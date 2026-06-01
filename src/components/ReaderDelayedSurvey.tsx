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
    <fieldset style={{ marginTop: 16, border: "1px solid #eee", padding: 16 }}>
      <legend>
        {label}
        <span style={{ color: "#dc2626", marginLeft: 4 }}>*</span>
      </legend>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: 24,
          marginTop: 12,
        }}
      >
        <span style={{ fontSize: 13, color: "#555", textAlign: "right" }}>
          全く当てはまらない
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <label
              key={n}
              style={{
                display: "inline-flex",
                flexDirection: "column",
                alignItems: "center",
                fontSize: 13,
              }}
            >
              <input
                type="radio"
                name={name}
                value={n}
                checked={value === n}
                onChange={() => onChange(n)}
                required
              />
              <span style={{ marginTop: 2 }}>{n}</span>
            </label>
          ))}
        </div>
        <span style={{ fontSize: 13, color: "#555", textAlign: "left" }}>
          とても当てはまる
        </span>
      </div>
    </fieldset>
  );
}

export default function ReaderDelayedSurvey({ onSubmit, loading, error }: Props) {
  const [remembered, setRemembered] = useState("");
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
    remembered.trim() !== "" &&
    change !== null &&
    changeDetail.trim() !== "";

  return (
    <form onSubmit={submit} style={{ maxWidth: 1040 }}>
      <h2>フォローアップアンケート</h2>
      <p>
        このアンケートでは、以前読んだメモについて現在覚えている内容や、そのメモがあなたの考え方や業務に影響したかどうかについてお聞きします。メモは再表示されません。覚えている範囲で回答してください。
      </p>

      <div style={{ marginTop: 12 }}>
        <label>
          そのメモで伝えられていた主なポイントとして、覚えていることはありますか？可能であれば3点まで挙げてください。
          <span style={{ color: "#dc2626", marginLeft: 4 }}>*</span>
          <textarea
            value={remembered}
            onChange={(e) => setRemembered(e.target.value)}
            required
            style={{ width: "100%", minHeight: 80, marginTop: 4 }}
          />
        </label>
      </div>

      <Likert
        name="change"
        label="メモを読んで以降、自分の業務の進め方やAIの使い方に変化があった。"
        value={change}
        onChange={setChange}
      />

      <div style={{ marginTop: 12 }}>
        <label>
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

      <div style={{ marginTop: 16 }}>
        <label>
          その他、コメントがあれば記入してください。
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
        style={{ marginTop: 16, padding: "8px 16px" }}
      >
        {loading ? "送信中..." : "フォローアップアンケートを提出する"}
      </button>
    </form>
  );
}
