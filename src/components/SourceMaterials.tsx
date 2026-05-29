import { useState } from "react";

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
        <h4>Program Overview PDF</h4>
        <p>AI Prototyping Programの全体概要をまとめたPDFです。</p>
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
              <span style={{ marginLeft: 6 }}>AIへの依頼にPDFを添付する</span>
            </label>
            {pdfAttached && (
              <div style={{ marginTop: 4 }}>
                <span style={{ background: "#e0e7ff", padding: "2px 6px", borderRadius: 4 }}>
                  添付中：Program Overview PDF
                </span>
                <button
                  type="button"
                  style={{ marginLeft: 8 }}
                  onClick={() => onTogglePdfAttachment(false)}
                >
                  添付を解除
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <section style={{ marginTop: 16 }}>
        <h4>あなたのプログラム中の振り返り</h4>
        <p>
          AI Prototyping
          Programの各アクティビティであなたが記入した振り返りです。メモに含める内容を考える際の参考として使用してください。
        </p>
        {condition === "ai_mediated" && (
          <p style={{ fontSize: 13, color: "#444" }}>
            AIはこれらの振り返りテキストには自動ではアクセスできません。AIに使わせたい内容がある場合は、必要な部分をコピーしてプロンプトに貼り付けるか、ご自身で要約して入力してください。
          </p>
        )}
        {reflections.length === 0 && <em>振り返りは登録されていません。</em>}
        {reflections.map((r, i) => (
          <div
            key={i}
            style={{ border: "1px solid #ddd", padding: 8, marginTop: 8, borderRadius: 4 }}
          >
            <div style={{ fontWeight: "bold" }}>
              Activity {r.activity_number ?? i + 1}: {r.title ?? ""}
            </div>
            <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{r.text ?? ""}</div>
            <button
              type="button"
              style={{ marginTop: 6 }}
              onClick={() => copy(r.text ?? "", i)}
            >
              振り返りをコピー
            </button>
            {copiedIndex === i && <span style={{ marginLeft: 8 }}>コピーしました。</span>}
          </div>
        ))}
      </section>
    </aside>
  );
}
