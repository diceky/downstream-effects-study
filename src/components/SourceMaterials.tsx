import { useState } from "react";
import Icon from "./Icon";

export interface Reflection {
  activity_number?: number | string;
  title?: string;
  text?: string;
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

  const copy = async (text: string, i: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(i);
      setTimeout(() => setCopiedIndex((cur) => (cur === i ? null : cur)), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <aside style={{ border: "1px solid #ccc", padding: 12, borderRadius: 4 }}>
      <h3>補足資料</h3>
      <p>以下の資料を参考にしてメモを作成してください。すべての資料を必ず使う必要はありません。</p>

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
        {reflections.map((r, i) => (
          <div
            key={i}
            style={{
              position: "relative",
              border: "1px solid #e5e7eb",
              background: "#f8fafc",
              padding: 12,
              paddingRight: 40,
              marginTop: 8,
              borderRadius: 6,
            }}
          >
            <button
              type="button"
              onClick={() => copy(r.text ?? "", i)}
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
            <div style={{ fontWeight: "bold" }}>
              Activity {r.activity_number ?? i + 1}: {r.title ?? ""}
            </div>
            <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{r.text ?? ""}</div>
          </div>
        ))}
      </section>
    </aside>
  );
}
