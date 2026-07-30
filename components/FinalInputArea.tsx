import { FC, KeyboardEvent } from "react";
import TypeAnimation from "./TypeAnimation";

type TInputAreaProps = {
  promptValue: string;
  setPromptValue: React.Dispatch<React.SetStateAction<string>>;
  disabled?: boolean;
  messages: { role: string; content: string }[];
  setMessages: React.Dispatch<
    React.SetStateAction<{ role: string; content: string }[]>
  >;
  handleChat: (messages?: { role: string; content: string }[]) => void;
};

const FinalInputArea: FC<TInputAreaProps> = ({
  promptValue,
  setPromptValue,
  disabled,
  messages,
  setMessages,
  handleChat,
}) => {
  const onSubmit = () => {
    if (!promptValue.trim()) return;
    const latestMessages = [
      ...messages,
      { role: "user", content: promptValue.trim() },
    ];
    setPromptValue("");
    setMessages(latestMessages);
    handleChat(latestMessages);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="prompt-label" htmlFor="follow-up">
        Ask a follow-up
      </label>
      <div className="prompt-row">
        <textarea
          id="follow-up"
          placeholder="What should we unpack next?"
          disabled={disabled}
          value={promptValue}
          onKeyDown={handleKeyDown}
          required
          onChange={(event) => setPromptValue(event.target.value)}
          rows={1}
        />
        <button
          disabled={disabled || !promptValue.trim()}
          type="submit"
          className="submit-button"
          aria-label="Send follow-up"
        >
          {disabled ? <TypeAnimation /> : <span aria-hidden="true">→</span>}
        </button>
      </div>
    </form>
  );
};

export default FinalInputArea;
