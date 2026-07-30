import { FC, KeyboardEvent } from "react";
import TypeAnimation from "./TypeAnimation";

type TInputAreaProps = {
  promptValue: string;
  setPromptValue: React.Dispatch<React.SetStateAction<string>>;
  disabled?: boolean;
  handleChat: (messages?: { role: string; content: string }[]) => void;
  ageGroup: string;
  setAgeGroup: React.Dispatch<React.SetStateAction<string>>;
  handleInitialChat: () => void;
};

const InitialInputArea: FC<TInputAreaProps> = ({
  promptValue,
  setPromptValue,
  disabled,
  handleInitialChat,
  ageGroup,
  setAgeGroup,
}) => {
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleInitialChat();
    }
  };

  return (
    <form
      className="prompt-card"
      onSubmit={(event) => {
        event.preventDefault();
        handleInitialChat();
      }}
    >
      <label className="prompt-label" htmlFor="learning-topic">
        What do you want to understand?
      </label>
      <div className="prompt-row">
        <textarea
          id="learning-topic"
          placeholder="Try “How does a neural network learn?”"
          disabled={disabled}
          value={promptValue}
          required
          onKeyDown={handleKeyDown}
          onChange={(event) => setPromptValue(event.target.value)}
          rows={1}
        />
        <label className="sr-only" htmlFor="learning-level">
          Learning level
        </label>
        <select
          id="learning-level"
          name="level"
          value={ageGroup}
          onChange={(event) => setAgeGroup(event.target.value)}
        >
          <option>Elementary School</option>
          <option>Middle School</option>
          <option>High School</option>
          <option>College</option>
          <option>Undergraduate</option>
          <option>Graduate</option>
        </select>
        <button
          disabled={disabled || !promptValue.trim()}
          type="submit"
          className="submit-button"
          aria-label="Start learning"
        >
          {disabled ? <TypeAnimation /> : <span aria-hidden="true">→</span>}
        </button>
      </div>
    </form>
  );
};

export default InitialInputArea;
