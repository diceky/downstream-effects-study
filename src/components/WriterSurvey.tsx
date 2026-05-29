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
  low,
  high,
  value,
  onChange,
}: {
  name: string;
  label: string;
  low: string;
  high: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <fieldset style={{ marginTop: 16, border: "1px solid #eee", padding: 8 }}>
      <legend>{label}</legend>
      <div style={{ fontSize: 12, color: "#555" }}>
        1 = {low}、7 = {high}
      </div>
      <div>
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <label key={n} style={{ marginRight: 8 }}>
            <input
              type="radio"
              name={name}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              required
            />
            {n}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function WriterSurvey({ condition, onSubmit, loading, error }: Props) {
  const [burden, setBurden] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [ownership, setOwnership] = useState<number | null>(null);
  const [materialsHelpful, setMaterialsHelpful] = useState<number | null>(null);
  const [externalTools, setExternalTools] = useState<string>("");
  const [interruptions, setInterruptions] = useState<string>("");
  const [comments, setComments] = useState("");
  const [aiHelpful, setAiHelpful] = useState<number | null>(null);
  const [aiReliance, setAiReliance] = useState<number | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const answers: Record<string, unknown> = {
      burden,
      confidence,
      ownership,
      materials_helpful: materialsHelpful,
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

  return (
    <form onSubmit={submit} style={{ maxWidth: 720 }}>
      <h2>メモ作成後アンケート</h2>
      <p>メモ作成タスクについて、以下の質問に回答してください。</p>

      <Likert
        name="burden"
        label="このメモを作成する際、どの程度の負担を感じましたか？"
        low="まったく負担を感じなかった"
        high="非常に負担を感じた"
        value={burden}
        onChange={setBurden}
      />
      <Likert
        name="confidence"
        label="作成したメモの質にどの程度自信がありますか？"
        low="まったく自信がない"
        high="非常に自信がある"
        value={confidence}
        onChange={setConfidence}
      />
      <Likert
        name="ownership"
        label="最終的なメモは、どの程度「自分が作成したもの」だと感じますか？"
        low="まったくそう感じない"
        high="非常にそう感じる"
        value={ownership}
        onChange={setOwnership}
      />
      <Likert
        name="materials"
        label="補足資料は、メモ作成にどの程度役立ちましたか？"
        low="まったく役立たなかった"
        high="非常に役立った"
        value={materialsHelpful}
        onChange={setMaterialsHelpful}
      />

      <fieldset style={{ marginTop: 16, border: "1px solid #eee", padding: 8 }}>
        <legend>このインターフェース以外の外部ツールを使用しましたか？</legend>
        {["はい", "いいえ"].map((v) => (
          <label key={v} style={{ marginRight: 12 }}>
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

      <fieldset style={{ marginTop: 16, border: "1px solid #eee", padding: 8 }}>
        <legend>タスク中に中断はありましたか？</legend>
        {["はい", "いいえ"].map((v) => (
          <label key={v} style={{ marginRight: 12 }}>
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

      {condition === "ai_mediated" && (
        <>
          <Likert
            name="ai_helpful"
            label="AIアシスタントは、メモ作成にどの程度役立ちましたか？"
            low="まったく役立たなかった"
            high="非常に役立った"
            value={aiHelpful}
            onChange={setAiHelpful}
          />
          <Likert
            name="ai_reliance"
            label="AIが生成したドラフトにどの程度依存しましたか？"
            low="まったく依存しなかった"
            high="非常に依存した"
            value={aiReliance}
            onChange={setAiReliance}
          />
        </>
      )}

      <div style={{ marginTop: 16 }}>
        <label>
          その他、コメントがあれば記入してください。
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            style={{ width: "100%", minHeight: 80, marginTop: 4 }}
          />
        </label>
      </div>

      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <button type="submit" disabled={loading} style={{ marginTop: 16, padding: "8px 16px" }}>
        {loading ? "送信中..." : "アンケートを提出する"}
      </button>
    </form>
  );
}
