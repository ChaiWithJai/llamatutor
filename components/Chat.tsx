import ReactMarkdown from "react-markdown";
import FinalInputArea from "./FinalInputArea";
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
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollableContainerRef = useRef<HTMLDivElement>(null);
  const [didScrollToBottom, setDidScrollToBottom] = useState(true);

  useEffect(() => {
    if (loading || didScrollToBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [didScrollToBottom, messages, loading]);

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
            {messages.slice(2).map((message, index) =>
              message.role === "assistant" ? (
                <div className="assistant-message" key={index}>
                  <span className="assistant-mark" aria-hidden="true">
                    D
                  </span>
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
              ) : (
                <p key={index} className="user-message">
                  {message.content}
                </p>
              ),
            )}
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

      {coachSlot}

      <div className="chat-composer">
        <FinalInputArea
          disabled={disabled}
          promptValue={promptValue}
          setPromptValue={setPromptValue}
          handleChat={handleChat}
          messages={messages}
          setMessages={setMessages}
        />
      </div>
    </section>
  );
}
