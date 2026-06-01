import { useState, FormEvent } from "react";

interface Props {
  condition: "human_only" | "ai_mediated";
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

export default function WriterSurvey({ condition, onSubmit, loading, error }: Props) {
  const [burden, setBurden] = useState<number | null>(null);
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [divisionUnderstanding, setDivisionUnderstanding] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [ownership, setOwnership] = useState<number | null>(null);
  const [completedAlone, setCompletedAlone] = useState<string>("");
  const [usedMaterials, setUsedMaterials] = useState<string>("");
  const [externalTools, setExternalTools] = useState<string>("");
  const [interruptions, setInterruptions] = useState<string>("");
  const [comments, setComments] = useState("");
  const [aiHelpful, setAiHelpful] = useState<number | null>(null);
  const [aiReliance, setAiReliance] = useState<number | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const answers: Record<string, unknown> = {
      burden,
      difficulty,
      division_understanding: divisionUnderstanding,
      confidence,
      ownership,
      completed_alone: completedAlone,
      used_materials: usedMaterials,
      external_tools: externalTools,
      interruptions,
      comments,
    };
    if (condition === "ai_mediated") {
      answers.ai_helpful = aiHelpful;
      answers.ai_reliance = aiReliance;
    }
    await onSubmit(answers);
  };

  const allRequiredAnswered =
    burden !== null &&
    difficulty !== null &&
    divisionUnderstanding !== null &&
    confidence !== null &&
    ownership !== null &&
    completedAlone !== "" &&
    usedMaterials !== "" &&
    externalTools !== "" &&
    interruptions !== "" &&
    (condition !== "ai_mediated" || (aiHelpful !== null && aiReliance !== null));

  return (
    <form onSubmit={submit} style={{ maxWidth: 1040 }}>
      <h2>メモ作成後アンケート</h2>
      <p>メモ作成タスクについて、以下の質問に回答してください。</p>

      <Likert
        name="burden"
        label="このメモを作成する際に、認知的な負荷を強く感じた。"
        value={burden}
        onChange={setBurden}
      />
      <Likert
        name="confidence"
        label="作成したメモの内容に自信がある。"
        value={confidence}
        onChange={setConfidence}
      />
      <Likert
        name="ownership"
        label="最終的なメモは、「自分が作成したもの」だと感じる。"
        value={ownership}
        onChange={setOwnership}
      />
      <Likert
        name="difficulty"
        label="このメモ作成タスクは難しいと感じた。"
        value={difficulty}
        onChange={setDifficulty}
      />
      <Likert
        name="division_understanding"
        label="自分は、所属部署の業務内容や業務特性をよく理解している。"
        value={divisionUnderstanding}
        onChange={setDivisionUnderstanding}
      />

      <fieldset style={{ marginTop: 16, border: "1px solid #eee", padding: 8 }}>
        <legend>
          タスク中に中断はありましたか？
          <span style={{ color: "#dc2626", marginLeft: 4 }}>*</span>
        </legend>
        {["はい", "いいえ"].map((v) => (
          <label key={v} style={{ marginRight: 56, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input
              type="radio"
              name="interruptions"
              value={v}
              checked={interruptions === v}
              onChange={() => setInterruptions(v)}
              required
            />
            {v}
          </label>
        ))}
      </fieldset>
      <fieldset style={{ marginTop: 16, border: "1px solid #eee", padding: 8 }}>
        <legend>
          このタスクを他者と相談・会話せず、一人で完了しましたか？
          <span style={{ color: "#dc2626", marginLeft: 4 }}>*</span>
        </legend>
        {["はい", "いいえ"].map((v) => (
          <label key={v} style={{ marginRight: 56, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input
              type="radio"
              name="completed_alone"
              value={v}
              checked={completedAlone === v}
              onChange={() => setCompletedAlone(v)}
              required
            />
            {v}
          </label>
        ))}
      </fieldset>

      <fieldset style={{ marginTop: 16, border: "1px solid #eee", padding: 8 }}>
        <legend>
          補足資料（プログラム概要PDFおよびご自身の振り返り）を使用しましたか？
          <span style={{ color: "#dc2626", marginLeft: 4 }}>*</span>
        </legend>
        {["はい", "いいえ"].map((v) => (
          <label key={v} style={{ marginRight: 56, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input
              type="radio"
              name="used_materials"
              value={v}
              checked={usedMaterials === v}
              onChange={() => setUsedMaterials(v)}
              required
            />
            {v}
          </label>
        ))}
      </fieldset>

      <fieldset style={{ marginTop: 16, border: "1px solid #eee", padding: 8 }}>
        <legend>
          このインターフェース以外の外部ツールを使用しましたか？
          <span style={{ color: "#dc2626", marginLeft: 4 }}>*</span>
        </legend>
        {["はい", "いいえ"].map((v) => (
          <label key={v} style={{ marginRight: 56, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input
              type="radio"
              name="external_tools"
              value={v}
              checked={externalTools === v}
              onChange={() => setExternalTools(v)}
              required
            />
            {v}
          </label>
        ))}
      </fieldset>

      {condition === "ai_mediated" && (
        <>
          <Likert
            name="ai_helpful"
            label="AIアシスタントは、メモ作成に役立った。"
            value={aiHelpful}
            onChange={setAiHelpful}
          />
          <Likert
            name="ai_reliance"
            label="最終的なメモ内容は、AIが生成したドラフトに大きく影響を受けている。"
            value={aiReliance}
            onChange={setAiReliance}
          />
        </>
      )}

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
        {loading ? "送信中..." : "アンケートを提出する"}
      </button>
    </form>
  );
}
