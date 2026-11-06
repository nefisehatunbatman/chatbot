"use client";

import { isValidElement, memo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

function CodeBlock({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  let lang = "";
  if (isValidElement(children)) {
    const cls = (children.props as { className?: string }).className || "";
    lang = cls.match(/language-([\w+-]+)/)?.[1] || "";
  }
  return (
    <div className="code-block">
      <div className="code-head">
        <span>{lang || "kod"}</span>
        <button
          onClick={() => {
            navigator.clipboard?.writeText(ref.current?.innerText || "");
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Kopyalandı" : "Kopyala"}
        </button>
      </div>
      <pre ref={ref}>{children}</pre>
    </div>
  );
}

function MarkdownImpl({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false }]]}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
          ),
          table: ({ children }) => (
            <div className="table-wrap"><table>{children}</table></div>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export default memo(MarkdownImpl);
