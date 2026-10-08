import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ breaks: true, gfm: true });

interface Props {
  source: string;
  style?: React.CSSProperties;
  className?: string;
  // Treat single-asterisk pairs as bold (Slack convention) instead of italic.
  slackFlavored?: boolean;
}

// Convert Slack-style `*bold*` (single asterisks) to standard `**bold**`.
// Leaves already-doubled `**...**` alone and avoids matching stray/lone `*`.
function convertSlackBold(input: string): string {
  return input.replace(
    /(^|[^*])\*(?!\s|\*)([^*\n]+?)(?<!\s)\*(?!\*)/g,
    (_m, pre: string, inner: string) => `${pre}**${inner}**`
  );
}

// Slack copy/paste often has leading spaces on lines; strip them so 4+ space
// indentation doesn't get parsed as an indented code block.
function stripLeadingSpaces(input: string): string {
  return input.replace(/^[ \t]+/gm, "");
}

// Slack allows ``` to open/close code blocks mid-line; standard markdown needs
// the fence on its own line. Insert newlines around every ``` so both open and
// close fences are recognized.
function normalizeTripleBacktickFences(input: string): string {
  return input
    .replace(/([^\n])```/g, "$1\n```")
    .replace(/```([^\n])/g, "```\n$1");
}

function preprocessSlack(input: string): string {
  return convertSlackBold(normalizeTripleBacktickFences(stripLeadingSpaces(input)));
}

export default function MarkdownRenderer({ source, style, className, slackFlavored }: Props) {
  const html = useMemo(() => {
    const src = slackFlavored ? preprocessSlack(source || "") : source || "";
    const raw = marked.parse(src, { async: false }) as string;
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: [
        "p", "br", "strong", "b", "em", "i", "s", "strike", "del", "u",
        "ul", "ol", "li",
        "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "code", "pre", "hr", "a",
      ],
      ALLOWED_ATTR: ["href", "title", "target", "rel"],
    });
  }, [source, slackFlavored]);

  return (
    <div
      className={`markdown-preview${className ? " " + className : ""}`}
      style={style}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
