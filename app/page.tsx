"use client";

import AuthDialog from "@/components/AuthDialog";
import AccountDialog from "@/components/AccountDialog";
import Chat from "@/components/Chat";
import CoachPanel from "@/components/CoachPanel";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import ResumeBanner from "@/components/ResumeBanner";
import Sources from "@/components/Sources";
import {
  type CoachDashboard,
  type CoachingGoal,
  type PracticeRep,
  createFirstRep,
  createNextRep,
  formatCoachFeedbackPrompt,
} from "@/utils/coaching";
import { getSystemPrompt } from "@/utils/utils";
import { identityRequestHeaders } from "@/utils/clientIdentity";
import {
  getUser,
  handleAuthCallback,
  logout,
  onAuthChange,
  type User,
} from "@netlify/identity";
import {
  createParser,
  ParsedEvent,
  ReconnectInterval,
} from "eventsource-parser";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type ChatMessage = { role: string; content: string };
type Source = { name: string; url: string; content: string };

export default function Home() {
  const [inputValue, setInputValue] = useState("");
  const [topic, setTopic] = useState("");
  const [showResult, setShowResult] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [isLoadingSources, setIsLoadingSources] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [ageGroup, setAgeGroup] = useState("Middle School");
  const [error, setError] = useState("");
  const [sourceWarning, setSourceWarning] = useState("");
  const [grounded, setGrounded] = useState(true);

  const [user, setUser] = useState<User | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [authMode, setAuthMode] = useState<
    "login" | "signup" | "recovery" | "reset"
  >("login");
  const [dashboard, setDashboard] = useState<CoachDashboard | null>(null);
  const [goal, setGoal] = useState<CoachingGoal | null>(null);
  const [rep, setRep] = useState<PracticeRep | null>(null);
  const [coachingBusy, setCoachingBusy] = useState(false);
  const [completion, setCompletion] = useState<{
    feedback: string;
    nextRep: string;
  } | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      const response = await fetch("/api/coach", {
        cache: "no-store",
        credentials: "include",
        headers: identityRequestHeaders(),
      });
      if (!response.ok) return;
      const data = (await response.json()) as CoachDashboard;
      setDashboard(data);
      setGoal(data.goal);
      setRep(data.pendingRep);
      if (data.profile?.defaultLevel) setAgeGroup(data.profile.defaultLevel);
    } catch (dashboardError) {
      console.error("Could not load coaching progress", dashboardError);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedTopic = params.get("topic");
    const sharedLevel = params.get("level");
    if (sharedTopic) setInputValue(sharedTopic);
    if (sharedLevel) setAgeGroup(sharedLevel);

    let active = true;
    const bootstrapAuth = async () => {
      try {
        const callback = await handleAuthCallback();
        if (callback?.type === "recovery") {
          setAuthMode("reset");
          setAuthOpen(true);
        }
        const currentUser = callback?.user ?? (await getUser());
        if (active && currentUser) {
          setUser(currentUser);
          await loadDashboard();
        }
      } catch (authError) {
        console.error("Could not initialize sign-in", authError);
      }
    };

    void bootstrapAuth();
    const unsubscribe = onAuthChange((_event, nextUser) => {
      if (!active) return;
      setUser(nextUser);
      if (nextUser) void loadDashboard();
      else {
        setDashboard(null);
        setGoal(null);
        setRep(null);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [loadDashboard]);

  const prepareCoaching = useCallback(
    async (question: string, level: string) => {
      if (!user) return;
      setCoachingBusy(true);
      try {
        const goalResponse = await fetch("/api/coach", {
          method: "POST",
          credentials: "include",
          headers: identityRequestHeaders({
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({
            action: "start_goal",
            topic: question,
            level,
          }),
        });
        if (!goalResponse.ok) {
          const detail = await goalResponse.text();
          throw new Error(
            `Could not save the goal (${goalResponse.status}): ${detail.slice(0, 240)}`,
          );
        }
        const { goal: savedGoal } = (await goalResponse.json()) as {
          goal: CoachingGoal;
        };
        setGoal(savedGoal);

        const repResponse = await fetch("/api/coach", {
          method: "POST",
          credentials: "include",
          headers: identityRequestHeaders({
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({
            action: "ensure_rep",
            goalId: savedGoal.id,
            prompt: savedGoal.nextRepText ?? createFirstRep(question),
          }),
        });
        if (!repResponse.ok) {
          const detail = await repResponse.text();
          throw new Error(
            `Could not save the practice rep (${repResponse.status}): ${detail.slice(0, 240)}`,
          );
        }
        const { rep: savedRep } = (await repResponse.json()) as {
          rep: PracticeRep;
        };
        setRep(savedRep);
      } catch (coachError) {
        console.error(coachError);
        setError(
          "The lesson is available, but coaching progress could not be saved. Retry shortly.",
        );
      } finally {
        setCoachingBusy(false);
      }
    },
    [user],
  );

  const handleChat = async (nextMessages: ChatMessage[] = messages) => {
    setLoading(true);
    setError("");
    let streamedText = "";

    try {
      const chatRes = await fetch("/api/getChat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      if (!chatRes.ok) throw new Error(chatRes.statusText);

      const data = chatRes.body;
      if (!data) throw new Error("The response stream was empty.");

      const onParse = (event: ParsedEvent | ReconnectInterval) => {
        if (event.type !== "event") return;
        try {
          const text = JSON.parse(event.data).text ?? "";
          streamedText += text;
          setMessages((previous) => {
            const lastMessage = previous[previous.length - 1];
            if (lastMessage?.role === "assistant") {
              return [
                ...previous.slice(0, -1),
                { ...lastMessage, content: lastMessage.content + text },
              ];
            }
            return [...previous, { role: "assistant", content: text }];
          });
        } catch (parseError) {
          console.error(parseError);
        }
      };

      const reader = data.getReader();
      const decoder = new TextDecoder();
      const parser = createParser(onParse);
      let done = false;

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        parser.feed(decoder.decode(value, { stream: !done }));
      }

      return streamedText;
    } catch (caughtError) {
      console.error(caughtError);
      setError(
        "The tutor was interrupted. Anything already written is preserved; retry when you are ready.",
      );
      throw caughtError;
    } finally {
      setLoading(false);
    }
  };

  const handleSourcesAndChat = async (question: string, level: string) => {
    setIsLoadingSources(true);
    setSourceWarning("");
    let sourceResults: Source[] = [];

    try {
      const sourcesResponse = await fetch("/api/getSources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!sourcesResponse.ok) throw new Error(sourcesResponse.statusText);
      sourceResults = await sourcesResponse.json();
      setGrounded(true);
    } catch (sourceError) {
      console.error(sourceError);
      setGrounded(false);
      setSourceWarning(
        "Sources are unavailable. This explanation is unverified; retry sources before relying on important claims.",
      );
    } finally {
      setSources(sourceResults);
      setIsLoadingSources(false);
    }

    const initialMessages = [
      { role: "system", content: getSystemPrompt(sourceResults, level) },
      { role: "user", content: question },
    ];
    setMessages(initialMessages);
    await handleChat(initialMessages);
  };

  const startSession = async (question: string, level: string) => {
    const cleanQuestion = question.trim();
    if (!cleanQuestion) return;

    setShowResult(true);
    setError("");
    setCompletion(null);
    setTopic(cleanQuestion);
    setInputValue("");

    const params = new URLSearchParams(window.location.search);
    params.set("topic", cleanQuestion);
    params.set("level", level);
    window.history.replaceState({}, "", `?${params.toString()}`);

    const work = [handleSourcesAndChat(cleanQuestion, level)];
    if (user) work.push(prepareCoaching(cleanQuestion, level));

    try {
      await Promise.all(work);
    } catch {
      // Each critical path renders its own recoverable error.
    }
  };

  const handleInitialChat = () => startSession(inputValue, ageGroup);

  const handleResume = () => {
    if (!dashboard?.goal) return;
    setGoal(dashboard.goal);
    setRep(dashboard.pendingRep);
    setAgeGroup(dashboard.goal.level);
    void startSession(dashboard.goal.topic, dashboard.goal.level);
  };

  const retrySources = async () => {
    if (!topic) return;
    try {
      await handleSourcesAndChat(topic, ageGroup);
    } catch {
      // The retry state is visible in the page and sources panel.
    }
  };

  const retryChat = async () => {
    const retryMessages = [
      ...messages,
      {
        role: "user",
        content: "Please continue from where the interrupted response stopped.",
      },
    ];
    setMessages(retryMessages);
    try {
      await handleChat(retryMessages);
    } catch {
      // The same retry control remains available.
    }
  };

  const submitPractice = async (attempt: string) => {
    if (!user || !goal || !rep) {
      setAuthMode("login");
      setAuthOpen(true);
      return;
    }

    setCoachingBusy(true);
    setError("");
    const feedbackMessages = formatCoachFeedbackPrompt(
      goal.topic,
      rep.prompt,
      attempt,
      goal.level,
    );
    const visibleMessages = [
      ...messages,
      { role: "user", content: `Practice attempt: ${attempt}` },
    ];
    setMessages(visibleMessages);

    try {
      const feedback = await handleChat(feedbackMessages);
      if (!feedback.trim()) throw new Error("The feedback response was empty.");
      const nextRep = createNextRep(goal.topic);
      const response = await fetch("/api/coach", {
        method: "POST",
        credentials: "include",
        headers: identityRequestHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          action: "complete_rep",
          repId: rep.id,
          attempt,
          feedback,
          nextRep,
          grounded,
        }),
      });
      if (!response.ok) throw new Error("Could not save coaching progress.");

      const saved = (await response.json()) as {
        streakCount: number;
        nextRep: string;
      };
      setCompletion({ feedback, nextRep: saved.nextRep });
      setDashboard((previous) =>
        previous
          ? {
              ...previous,
              profile: previous.profile
                ? {
                    ...previous.profile,
                    streakCount: saved.streakCount,
                  }
                : null,
            }
          : previous,
      );
      await loadDashboard();
    } catch (coachError) {
      console.error(coachError);
      setError(
        "Your attempt is still on screen, but the coaching result was not saved. Please retry.",
      );
    } finally {
      setCoachingBusy(false);
    }
  };

  const handleAuthenticated = async (nextUser: User) => {
    setUser(nextUser);
    await loadDashboard();
    if (showResult && topic) await prepareCoaching(topic, ageGroup);
  };

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      setUser(null);
      setDashboard(null);
      setGoal(null);
      setRep(null);
      setCompletion(null);
    }
  };

  return (
    <>
      <Header
        userEmail={user?.email}
        sessionActive={showResult}
        onOpenAuth={() => {
          setAuthMode("login");
          setAuthOpen(true);
        }}
        onManageAccount={() => setAccountOpen(true)}
        onLogout={() => void handleLogout()}
      />
      <main
        id="main"
        className={`tutor-main${showResult ? " session-active" : ""}`}
      >
        {showResult ? (
          <div className="session-page">
            <div className="session-meta">
              <div className="min-w-0">
                <p className="session-label">
                  {grounded ? "Sourced learning session" : "Unverified session"}
                </p>
                <h1 className="session-topic">{topic}</h1>
              </div>
              <Link className="suggestion-button" href="/">
                New topic
              </Link>
            </div>
            {(error || sourceWarning) && (
              <div className="session-alerts">
                {error && (
                  <div className="error-banner" role="alert">
                    <span>{error}</span>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => void retryChat()}
                      disabled={loading}
                    >
                      Retry tutor
                    </button>
                  </div>
                )}
                {sourceWarning && (
                  <div className="warning-banner" role="status">
                    <span>{sourceWarning}</span>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => void retrySources()}
                      disabled={isLoadingSources || loading}
                    >
                      Retry sources
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="session-grid">
              <Chat
                messages={messages}
                disabled={loading}
                loading={loading}
                promptValue={inputValue}
                setPromptValue={setInputValue}
                setMessages={setMessages}
                handleChat={(nextMessages) => void handleChat(nextMessages)}
                topic={topic}
                coachSlot={
                  <CoachPanel
                    signedIn={Boolean(user)}
                    goal={goal}
                    rep={rep}
                    streakCount={dashboard?.profile?.streakCount ?? 0}
                    busy={coachingBusy}
                    completion={completion}
                    onSignIn={() => {
                      setAuthMode("login");
                      setAuthOpen(true);
                    }}
                    onSubmit={submitPractice}
                  />
                }
              />
              <Sources
                sources={sources}
                isLoading={isLoadingSources}
                onRetry={() => void retrySources()}
              />
            </div>
          </div>
        ) : (
          <Hero
            promptValue={inputValue}
            setPromptValue={setInputValue}
            handleChat={(nextMessages) => void handleChat(nextMessages)}
            ageGroup={ageGroup}
            setAgeGroup={setAgeGroup}
            handleInitialChat={handleInitialChat}
            resumeContent={
              dashboard ? (
                <ResumeBanner dashboard={dashboard} onResume={handleResume} />
              ) : undefined
            }
          />
        )}
      </main>
      {!showResult && <Footer />}
      <AuthDialog
        open={authOpen}
        initialMode={authMode}
        onClose={() => setAuthOpen(false)}
        onAuthenticated={(nextUser) => void handleAuthenticated(nextUser)}
      />
      {user?.email && (
        <AccountDialog
          open={accountOpen}
          email={user.email}
          onClose={() => setAccountOpen(false)}
          onDataDeleted={() => {
            setDashboard(null);
            setGoal(null);
            setRep(null);
            setCompletion(null);
          }}
        />
      )}
    </>
  );
}
