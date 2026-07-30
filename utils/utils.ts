// import llama3Tokenizer from "llama3-tokenizer-js";

export const cleanedText = (text: string) => {
  let newText = text
    .trim()
    .replace(/(\n){4,}/g, "\n\n\n")
    .replace(/\n\n/g, " ")
    .replace(/ {3,}/g, "  ")
    .replace(/\t/g, "")
    .replace(/\n+(\s*\n)*/g, "\n")
    .substring(0, 100000);

  // console.log(llama3Tokenizer.encode(newText).length);

  return newText;
};

export async function fetchWithTimeout(
  url: string,
  options = {},
  timeout = 3000,
) {
  // Create an AbortController
  const controller = new AbortController();
  const { signal } = controller;

  // Set a timeout to abort the fetch
  const fetchTimeout = setTimeout(() => {
    controller.abort();
  }, timeout);

  // Start the fetch request with the abort signal
  return fetch(url, { ...options, signal })
    .then((response) => {
      clearTimeout(fetchTimeout); // Clear the timeout if the fetch completes in time
      return response;
    })
    .catch((error) => {
      if (error.name === "AbortError") {
        throw new Error("Fetch request timed out");
      }
      throw error; // Re-throw other errors
    });
}

type suggestionType = {
  id: number;
  name: string;
  icon: string;
};

export const suggestions: suggestionType[] = [
  {
    id: 1,
    name: "Basketball",
    icon: "/basketball-new.svg",
  },
  {
    id: 2,
    name: "Machine Learning",
    icon: "/light-new.svg",
  },
  {
    id: 3,
    name: "Personal Finance",
    icon: "/finance.svg",
  },
  {
    id: 4,
    name: "U.S History",
    icon: "/us.svg",
  },
];

export const getSystemPrompt = (
  finalResults: { content: string }[],
  ageGroup: string,
) => {
  const groundingInstruction =
    finalResults.length > 0
      ? "Use the supplied webpages as the factual grounding for the explanation. Do not invent a citation."
      : "No web sources are available. Say clearly that the explanation is unverified and avoid high-confidence claims that require current evidence.";

  return `
  You are Dharmic Data Tutor: a warm, direct, evidence-aware tutor and skill coach. Explain the requested topic at a ${ageGroup} level. Start with a short overview, then invite a useful follow-up. Be interactive, correct misunderstandings without shame, and prefer a concrete example over extra exposition.

  ${groundingInstruction}

  The product uses a separate practice panel for the learner's assigned rep. Do not claim that a learner has mastered the topic, and do not treat a streak as evidence of competence.

  Here is the information to teach:

  <teaching_info>
  ${"\n"}
   ${finalResults
     .slice(0, 7)
     .map((result, index) => `## Webpage #${index}:\n ${result.content} \n\n`)}
  </teaching_info>

  Here's the age group to teach at:

  <age_group>
  ${ageGroup}
  </age_group>

  Return markdown. Here is the topic to teach:
    `;
};
