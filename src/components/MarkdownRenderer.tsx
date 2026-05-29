import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ breaks: true, gfm: true });

interface Props {
  source: string;
  style?: React.CSSProperties;
  className?: string;
}

export default function MarkdownRenderer({ source, style, className }: Props) {
  const html = useMemo(() => {
    const raw = marked.parse(source || "", { async: false }) as string;
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: [
        "p", "br", "strong", "b", "em", "i", "s", "strike", "del", "u",
        "ul", "ol", "li",
        "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "code", "pre", "hr", "a",
      ],
      ALLOWED_ATTR: ["href", "title", "target", "rel"],
    });
  }, [source]);

  return (
    <div
      className={`markdown-preview${className ? " " + className : ""}`}
      style={style}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
