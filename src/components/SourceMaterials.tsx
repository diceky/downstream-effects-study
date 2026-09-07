import { useState } from "react";
import { emojify } from "node-emoji";
import Icon from "./Icon";
import MarkdownRenderer from "./MarkdownRenderer";

export interface Reflection {
  activity_number?: number | string;
  title?: string;
  text?: string;
}

function renderShortcodes(text: string): string {
  // Leave unknown shortcodes (e.g. Slack custom emoji) as-is instead of stripping them.
  return emojify(text, { fallback: (name) => `:${name}:` });
}

interface Props {
  pdfUrl?: string | null;
  reflections: Reflection[];
  condition: "human_only" | "ai_mediated";
  pdfAttached?: boolean;
  onTogglePdfAttachment?: (next: boolean) => void;
}

export default function SourceMaterials({
  pdfUrl,
  reflections,
  condition,
  pdfAttached,
  onTogglePdfAttachment,
}: Props) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [openIndices, setOpenIndices] = useState<Set<number>>(new Set());

  const copy = async (text: string, i: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(i);
      setTimeout(() => setCopiedIndex((cur) => (cur === i ? null : cur)), 1500);
    } catch {
      /* ignore */
    }
  };

  const toggleOpen = (i: number) => {
    setOpenIndices((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <aside style={{ border: "1px solid #ccc", padding: 12, borderRadius: 4 }}>
      <h3>補足資料</h3>
      <p>以下の資料を参考にしてメモを作成してください。資料の使用は任意です、使う必要はありません。</p>

      <section style={{ marginTop: 12 }}>
        <h4>プログラムの概要PDF</h4>
        {pdfUrl ? (
          <a href={pdfUrl} target="_blank" rel="noreferrer">
            <button type="button">PDFを表示する</button>
          </a>
        ) : (
          <em>PDFは未設定です。</em>
        )}

        {condition === "ai_mediated" && onTogglePdfAttachment && (
          <div style={{ marginTop: 8 }}>
            <label>
              <input
                type="checkbox"
                checked={!!pdfAttached}
                onChange={(e) => onTogglePdfAttachment(e.target.checked)}
              />
              <span style={{ marginLeft: 6 }}>プロンプトに概要PDFを添付する</span>
            </label>
            {pdfAttached && (
              <div style={{ marginTop: 4 }}>
                <span style={{ background: "#e0e7ff", padding: "2px 6px", borderRadius: 4 }}>
                  添付中：Program Overview PDF
                </span>
              </div>
            )}
          </div>
        )}
      </section>

      <hr style={{ border: 0, borderTop: "1px solid #e5e7eb", margin: "24px 0" }} />

      <section>
        <h4>あなたのプログラム中の振り返り</h4>
        {condition === "ai_mediated" && (
          <p style={{ fontSize: 13, color: "#444" }}>
            AIに使わせたい内容がある場合は、必要な部分をプロンプトにコピペするか、ご自身で要約してご利用ください。
          </p>
        )}
        {reflections.length === 0 && <em>振り返りは登録されていません。</em>}
        {reflections.map((r, i) => {
          const isOpen = openIndices.has(i);
          const heading = renderShortcodes(
            `Activity ${r.activity_number ?? i + 1}: ${r.title ?? ""}`
          );
          const rawText = r.text ?? "";
          const hasText = rawText.trim().length > 0;
          const emojifiedText = renderShortcodes(rawText);
          const clipboardText = `${heading}\n\n${emojifiedText}`;
          return (
            <div
              key={i}
              style={{
                position: "relative",
                border: "1px solid #e5e7eb",
                background: "#f8fafc",
                marginTop: 8,
                borderRadius: 6,
                overflow: "hidden",
              }}
            >
              <button
                type="button"
                onClick={() => toggleOpen(i)}
                aria-expanded={isOpen}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "transparent",
                  border: "none",
                  padding: "10px 44px 10px 12px",
                  textAlign: "left",
                  cursor: "pointer",
                  fontWeight: "bold",
                  color: "inherit",
                }}
              >
                <Icon name={isOpen ? "expand_more" : "chevron_right"} size={18} />
                <span style={{ flex: 1 }}>{heading}</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  copy(clipboardText, i);
                }}
                title="振り返りをコピー"
                aria-label="振り返りをコピー"
                style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  background: "transparent",
                  border: "none",
                  padding: 4,
                  cursor: "pointer",
                  color: copiedIndex === i ? "#16a34a" : "#6b7280",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                <Icon name={copiedIndex === i ? "check" : "content_copy"} size={18} />
              </button>
              {isOpen && (
                hasText ? (
                  <MarkdownRenderer
                    source={emojifiedText}
                    slackFlavored
                    style={{
                      padding: "12px",
                      borderTop: "1px solid #e5e7eb",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      padding: "12px",
                      borderTop: "1px solid #e5e7eb",
                      fontSize: 12,
                      color: "#9ca3af",
                    }}
                  >
                    投稿無し
                  </div>
                )
              )}
            </div>
          );
        })}
      </section>
    </aside>
  );
}
