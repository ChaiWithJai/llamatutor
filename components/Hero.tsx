import { FC } from "react";
import InitialInputArea from "./InitialInputArea";
import { suggestions } from "@/utils/utils";
import { ReactNode } from "react";
import Image from "next/image";

type THeroProps = {
  promptValue: string;
  setPromptValue: React.Dispatch<React.SetStateAction<string>>;
  handleChat: (messages?: { role: string; content: string }[]) => void;
  ageGroup: string;
  setAgeGroup: React.Dispatch<React.SetStateAction<string>>;
  handleInitialChat: () => void;
  resumeContent?: ReactNode;
};

const Hero: FC<THeroProps> = ({
  promptValue,
  setPromptValue,
  handleChat,
  ageGroup,
  setAgeGroup,
  handleInitialChat,
  resumeContent,
}) => {
  return (
    <section className="tutor-hero" aria-label="Start a learning session">
      <p className="eyebrow">
        <span className="eyebrow-dot" aria-hidden="true" />
        Sources you can inspect · practice you can keep
      </p>
      <h1 className="hero-title" id="hero-title">
        What do you want to <span className="highlight">understand?</span>
      </h1>
      <p className="hero-description">
        Ask anything. Get a clear explanation grounded in named sources, then
        try one useful practice rep.
      </p>

      {resumeContent}

      <div id="learn">
        <InitialInputArea
          promptValue={promptValue}
          handleInitialChat={handleInitialChat}
          setPromptValue={setPromptValue}
          handleChat={handleChat}
          ageGroup={ageGroup}
          setAgeGroup={setAgeGroup}
        />
      </div>

      <div className="suggestions" role="group" aria-label="Ways to begin">
        {suggestions.map((item) => (
          <button
            className="suggestion-button"
            onClick={() => setPromptValue(item.prompt)}
            type="button"
            key={item.id}
          >
            <Image
              className="suggestion-icon"
              src={item.icon}
              alt=""
              width={28}
              height={28}
            />
            <span className="suggestion-copy">
              <span className="suggestion-move">{item.move}</span>
              <strong>{item.name}</strong>
              <span className="suggestion-description">{item.description}</span>
            </span>
            <span className="suggestion-arrow" aria-hidden="true">
              ↗
            </span>
          </button>
        ))}
      </div>

      <div className="learning-sequence" id="how-it-works">
        <p className="sequence-label">One question. One useful loop.</p>
        <ol>
          <li>
            <span className="sequence-number">1</span>
            <span>
              <strong>Ask</strong>
              <small>Bring the real question.</small>
            </span>
          </li>
          <li>
            <span className="sequence-number">2</span>
            <span>
              <strong>Understand</strong>
              <small>Meet the idea at your level.</small>
            </span>
          </li>
          <li>
            <span className="sequence-number">3</span>
            <span>
              <strong>Inspect</strong>
              <small>Open the named sources.</small>
            </span>
          </li>
          <li>
            <span className="sequence-number">4</span>
            <span>
              <strong>Practice</strong>
              <small>Use it once; keep the next step.</small>
            </span>
          </li>
        </ol>
      </div>
    </section>
  );
};

export default Hero;
