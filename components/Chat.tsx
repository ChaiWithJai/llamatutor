import FinalInputArea from "./FinalInputArea";
import CardCarousel from "./CardCarousel";
import TutorMarkdown from "./TutorMarkdown";
import { ReactNode, useEffect, useRef, useState } from "react";

export default function Chat({
  messages,
  disabled,
  loading,
  promptValue,
  setPromptValue,
  setMessages,
  handleChat,
  coachSlot,
  sources = [],
  signedIn = false,
  nextRep,
  onInspectSource,
  onJourneyEvent,
}: {
  messages: { role: string; content: string }[];
  disabled: boolean;
  loading: boolean;
  promptValue: string;
  setPromptValue: React.Dispatch<React.SetStateAction<string>>;
  setMessages: React.Dispatch<
    React.SetStateAction<{ role: string; content: string }[]>
  >;
  handleChat: (messages?: { role: string; content: string }[]) => void;
  topic: string;
  coachSlot?: ReactNode;
  sources?: { name: string; url: string }[];
  signedIn?: boolean;
  nextRep?: string;
  onInspectSource?: (sourceUrl: string) => void;
  onJourneyEvent?: (
    action: "impression" | "selected" | "edited" | "submitted",
    move: string,
  ) => void;
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const latestAssistantRef = useRef<HTMLDivElement>(null);
  const scrollableContainerRef = useRef<HTMLDivElement>(null);
  const wasLoadingRef = useRef(false);
  const [didScrollToBottom, setDidScrollToBottom] = useState(true);
  const [activeDock, setActiveDock] = useState<"followup" | "practice" | null>(
    null,
  );

  const openExample = () => {
    setPromptValue("Walk me through one concrete example step by step.");
    setActiveDock("followup");
    onJourneyEvent?.("selected", "example");
  };

  useEffect(() => {
    if (loading && didScrollToBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [didScrollToBottom, messages, loading]);

  useEffect(() => {
    if (wasLoadingRef.current && !loading) {
      window.requestAnimationFrame(() => {
        latestAssistantRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        latestAssistantRef.current
          ?.querySelector<HTMLElement>(".card-body")
          ?.scrollTo({ top: 0 });
      });
    }
    wasLoadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    const element = scrollableContainerRef.current;
    if (!element) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = element;
      setDidScrollToBottom(scrollTop + clientHeight >= scrollHeight - 4);
    };

    element.addEventListener("scroll", handleScroll);
    return () => element.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <section className="chat-panel" aria-label="Learning conversation">
      <div
        ref={scrollableContainerRef}
        className="message-list"
        aria-live="polite"
        aria-busy={loading}
      >
        {messages.length > 2 ? (
          <div className="prose max-w-none">
            {messages.slice(2).map((message, index, assistantMessages) => {
              if (message.role !== "assistant") {
                return (
                  <p key={index} className="user-message">
                    {message.content}
                  </p>
                );
              }

              // Cards are only bounded once a response finishes streaming --
              // chunking a growing partial string would reshuffle cards on
              // every token. The still-streaming message keeps the original
              // live markdown so the learner still sees real-time feedback.
              const isStreamingThisMessage =
                loading && index === assistantMessages.length - 1;
              const isLatestAssistant = index === assistantMessages.length - 1;

              return (
                <div
                  className="assistant-message"
                  key={index}
                  ref={isLatestAssistant ? latestAssistantRef : undefined}
                >
                  <span className="assistant-mark" aria-hidden="true">
                    D
                  </span>
                  {isStreamingThisMessage ? (
                    <div className="tutor-markdown">
                      <TutorMarkdown>{message.content}</TutorMarkdown>
                    </div>
                  ) : (
                    <CardCarousel
                      content={message.content}
                      sources={sources}
                      signedIn={signedIn}
                      onInspectSource={onInspectSource}
                      onWorkExample={openExample}
                    />
                  )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          <div
            className="flex flex-col gap-3"
            aria-label="Preparing explanation"
          >
            {Array.from({ length: 7 }, (_, index) => (
              <div
                key={index}
                className="loading-line"
                style={{ animationDelay: `${index * 0.08}s` }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="learning-dock" data-expanded={activeDock !== null}>
        <div
          className="learning-dock-actions"
          role="group"
          aria-label="Continue this learning session"
        >
          <button
            type="button"
            aria-expanded={activeDock === "followup"}
            aria-controls="followup-tools"
            className={
              activeDock === "followup"
                ? "dock-action dock-action-active"
                : "dock-action"
            }
            onClick={() =>
              setActiveDock((current) =>
                current === "followup" ? null : "followup",
              )
            }
          >
            <span aria-hidden="true">↳</span>
            Ask or choose a next move
          </button>
          <button
            type="button"
            aria-expanded={activeDock === "practice"}
            aria-controls="practice-tools"
            className={
              activeDock === "practice"
                ? "dock-action dock-action-active"
                : "dock-action"
            }
            onClick={() =>
              setActiveDock((current) =>
                current === "practice" ? null : "practice",
              )
            }
          >
            <span aria-hidden="true">◎</span>
            Practice this
          </button>
        </div>
        {activeDock === "practice" && (
          <div className="learning-dock-panel" id="practice-tools">
            {coachSlot}
          </div>
        )}
        {activeDock === "followup" && (
          <div
            className="chat-composer learning-dock-panel"
            id="followup-tools"
          >
            <FinalInputArea
              disabled={disabled}
              promptValue={promptValue}
              setPromptValue={setPromptValue}
              handleChat={(nextMessages) => {
                setActiveDock(null);
                handleChat(nextMessages);
              }}
              messages={messages}
              setMessages={setMessages}
              signedIn={signedIn}
              nextRep={nextRep}
              onJourneyEvent={onJourneyEvent}
            />
          </div>
        )}
      </div>
    </section>
  );
}
