import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
      {children}
    </ReactMarkdown>
  );
}
