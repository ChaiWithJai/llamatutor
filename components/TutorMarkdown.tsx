import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { normalizeTutorMarkdown } from "@/utils/tutorMarkdown";

export default function TutorMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        table: ({ children, ...props }) => (
          <div className="markdown-table-wrap" tabIndex={0}>
            <table {...props}>{children}</table>
          </div>
        ),
      }}
    >
      {normalizeTutorMarkdown(children)}
    </ReactMarkdown>
  );
}
