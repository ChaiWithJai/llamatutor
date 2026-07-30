import { FC } from "react";
import InitialInputArea from "./InitialInputArea";
import { suggestions } from "@/utils/utils";
import { ReactNode } from "react";

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
    <section className="tutor-hero" aria-labelledby="hero-title">
      <p className="eyebrow">
        <span className="eyebrow-dot" aria-hidden="true" />A Dharmic Data
        learning experiment
      </p>
      <h1 className="hero-title" id="hero-title">
        Learn{" "}
        <span className="highlight highlight-learning">Something Useful.</span>{" "}
        See{" "}
        <span className="highlight highlight-proof">Where It Comes From.</span>
      </h1>
      <p className="hero-description">
        Name a topic and choose a learning level. The tutor finds web sources,
        explains the idea clearly, and stays with you for follow-up questions.
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

      <div className="suggestions" role="group" aria-label="Example topics">
        {suggestions.map((item) => (
          <button
            className="suggestion-button"
            onClick={() => setPromptValue(item.name)}
            type="button"
            key={item.id}
          >
            {item.name}
          </button>
        ))}
      </div>

      <div className="proof-strip" id="how-it-works">
        <div className="proof-item">
          <strong>Start with a topic</strong>
          <span>Bring the question you actually want to understand.</span>
        </div>
        <div className="proof-item">
          <strong>Choose your level</strong>
          <span>Control the vocabulary and depth of the explanation.</span>
        </div>
        <div className="proof-item">
          <strong>Inspect sources</strong>
          <span>Named webpages stay beside the learning conversation.</span>
        </div>
        <div className="proof-item">
          <strong>Ask what follows</strong>
          <span>Clarify, challenge, and keep going in the same session.</span>
        </div>
      </div>
    </section>
  );
};

export default Hero;
