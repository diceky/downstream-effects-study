import { useState, FormEvent } from "react";

interface Props {
  onSubmit: (answers: Record<string, unknown>) => Promise<void> | void;
  loading?: boolean;
  error?: string | null;
}

function Likert({
  name,
  label,
  value,
  onChange,
}: {
  name: string;
  label: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <fieldset style={{ marginTop: 32, border: "1px solid #eee", padding: 12 }}>
      <legend>
        {label}
        <span style={{ color: "#dc2626", marginLeft: 4 }}>*</span>
      </legend>
      <div className="likert-row">
        <span className="likert-label likert-label--start">
          全く当てはまらない
        </span>
        <div className="likert-options">
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <label key={n} className="likert-option">
              <input
                type="radio"
                name={name}
                value={n}
                checked={value === n}
                onChange={() => onChange(n)}
                required
              />
              <span>{n}</span>
            </label>
          ))}
        </div>
        <span className="likert-label likert-label--end">
          とても当てはまる
        </span>
      </div>
    </fieldset>
  );
}

export default function ReaderDelayedSurvey({ onSubmit, loading, error }: Props) {
  const [remembered, setRemembered] = useState<string[]>(["", "", ""]);
  const [change, setChange] = useState<number | null>(null);
  const [changeDetail, setChangeDetail] = useState("");
  const [comments, setComments] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await onSubmit({
      remembered_points: remembered,
      change_magnitude: change,
      change_detail: changeDetail,
      comments,
    });
  };

  const allRequiredAnswered =
    change !== null &&
    changeDetail.trim() !== "";

  return (
    <form onSubmit={submit} style={{ maxWidth: 1040 }}>
      <h2>Delayed Reader Survey</h2>
      <p style={{ fontSize: 13 }}>
        {/* このアンケートでは、2週間前に読んだAIプロトタイピングプログラムの共有メモについて現在覚えている内容や、そのメモがあなたの考え方や業務に及ぼした影響についてお聞きします。 */}
        メモは再表示されません。覚えている範囲で回答してください。
      </p>

      <div style={{ marginTop: 32, marginBottom: 32 }}>
        <label style={{ fontSize: 14 }}>
          2週間前に読んだメモに書かれていた内容として、覚えていることを最大3つまで書いてください。できるだけ具体的に、1つの欄につき1つの内容を短い文で書いてください。正確な表現を覚えている必要はなく、思い出せる範囲で構いません。無ければ空欄のままで構いません。
          <span style={{ color: "#6b7280", marginLeft: 4 }}>（任意）</span>
        </label>
        {remembered.map((val, i) => (
          <input
            key={i}
            type="text"
            value={val}
            onChange={(e) =>
              setRemembered((prev) =>
                prev.map((p, j) => (j === i ? e.target.value : p))
              )
            }
            placeholder={`覚えていること ${i + 1}`}
            style={{ width: "100%", marginTop: 8 }}
          />
        ))}
      </div>

      <Likert
        name="change"
        label="メモを読んで以降、自分の業務の進め方やAIの使い方に変化があった。"
        value={change}
        onChange={setChange}
      />

      <div style={{ marginTop: 32 }}>
        <label style={{ fontSize: 14 }}>
          変化があった場合、どのような点が変わりましたか？できるだけ具体的に教えてください。また、あまり変わっていない、またはまったく変わっていない場合は、その理由を教えてください。
          <span style={{ color: "#dc2626", marginLeft: 4 }}>*</span>
          <textarea
            value={changeDetail}
            onChange={(e) => setChangeDetail(e.target.value)}
            required
            style={{ width: "100%", minHeight: 80, marginTop: 4 }}
          />
        </label>
      </div>

      <div style={{ marginTop: 32 }}>
        <label style={{ fontSize: 14 }}>
          その他、コメントがあれば自由にご記入ください。
          <span style={{ color: "#6b7280", marginLeft: 4 }}>（任意）</span>
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            style={{ width: "100%", minHeight: 80, marginTop: 4 }}
          />
        </label>
      </div>

      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <button
        type="submit"
        disabled={loading || !allRequiredAnswered}
        style={{ marginTop: 32, padding: "8px 16px" }}
      >
        {loading ? "送信中..." : "アンケートを提出する"}
      </button>
    </form>
  );
}
