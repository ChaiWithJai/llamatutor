import { FC, KeyboardEvent, useEffect, useState } from "react";
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
  signedIn: boolean;
  nextRep?: string;
  onJourneyEvent?: (
    action: "impression" | "selected" | "edited" | "submitted",
    move: string,
  ) => void;
};

const universalMoves = [
  {
    id: "intuition",
    label: "Build intuition",
    prompt: "Explain this another way with a simple analogy.",
  },
  {
    id: "example",
    label: "Work an example",
    prompt: "Walk me through one concrete example step by step.",
  },
  {
    id: "check",
    label: "Check understanding",
    prompt: "Ask me one short question to check my understanding.",
  },
];

const FinalInputArea: FC<TInputAreaProps> = ({
  promptValue,
  setPromptValue,
  disabled,
  messages,
  setMessages,
  handleChat,
  signedIn,
  nextRep,
  onJourneyEvent,
}) => {
  const [selectedMove, setSelectedMove] = useState<string | null>(null);
  const [reportedEdit, setReportedEdit] = useState(false);
  const moves =
    signedIn && nextRep
      ? [
          { id: "continue", label: "Continue your rep", prompt: nextRep },
          universalMoves[1],
          universalMoves[2],
        ]
      : universalMoves;

  useEffect(() => {
    onJourneyEvent?.("impression", "journey-rail");
  }, [onJourneyEvent]);

  const onSubmit = () => {
    if (!promptValue.trim()) return;
    const latestMessages = [
      ...messages,
      { role: "user", content: promptValue.trim() },
    ];
    setPromptValue("");
    setMessages(latestMessages);
    if (selectedMove) onJourneyEvent?.("submitted", selectedMove);
    setSelectedMove(null);
    setReportedEdit(false);
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
      <div className="journey-rail-wrap">
        <div className="journey-rail-heading">
          <span className="prompt-label">Choose your next move</span>
          <span>Three clear paths</span>
        </div>
        <div
          className="journey-rail"
          role="group"
          aria-label="Learning journeys"
        >
          {moves.map((move) => (
            <button
              key={move.id}
              className={
                selectedMove === move.id
                  ? "journey-move journey-move-active"
                  : "journey-move"
              }
              type="button"
              aria-pressed={selectedMove === move.id}
              onClick={() => {
                setSelectedMove(move.id);
                setReportedEdit(false);
                setPromptValue(move.prompt);
                onJourneyEvent?.("selected", move.id);
              }}
            >
              {move.label}
              <span aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      </div>
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
          onChange={(event) => {
            setPromptValue(event.target.value);
            if (selectedMove && !reportedEdit) {
              setReportedEdit(true);
              onJourneyEvent?.("edited", selectedMove);
            }
          }}
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
