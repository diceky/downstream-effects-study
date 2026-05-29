import { useState, FormEvent } from "react";

interface Props {
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

export default function ReaderImmediateSurvey({ onSubmit, loading, error }: Props) {
  const [mainPoint, setMainPoint] = useState("");
  const [relevance, setRelevance] = useState("");
  const [teamAwareness, setTeamAwareness] = useState("");
  const [clarification, setClarification] = useState("");
  const [clarity, setClarity] = useState<number | null>(null);
  const [understanding, setUnderstanding] = useState<number | null>(null);
  const [burden, setBurden] = useState<number | null>(null);
  const [closeness, setCloseness] = useState<number | null>(null);
  const [deptKnowledge, setDeptKnowledge] = useState<number | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await onSubmit({
      main_point: mainPoint,
      relevance,
      team_awareness: teamAwareness,
      clarification,
      clarity,
      understanding,
      burden,
      closeness,
      dept_knowledge: deptKnowledge,
    });
  };

  return (
    <form onSubmit={submit} style={{ maxWidth: 720 }}>
      <h2>メモ閲覧後アンケート</h2>
      <p>
        以下の質問には、先ほど読んだメモについて、あなた自身の理解や解釈に基づいて回答してください。メモはこの画面では表示されません。
      </p>

      {[
        {
          label: "このメモを通して、作成者がチームに一番伝えたかったポイントは何だと思いますか？",
          value: mainPoint,
          setter: setMainPoint,
        },
        {
          label: "ご自身の業務に照らして、特に関連がありそうだと感じた点はありますか？あれば教えてください。",
          value: relevance,
          setter: setRelevance,
        },
        {
          label: "このメモを読んで、チームとして今後より意識すべきだと思ったことを1つ教えてください。",
          value: teamAwareness,
          setter: setTeamAwareness,
        },
        {
          label: "この内容を実務に活かす前に、まだ確認・明確化したい点があれば教えてください。",
          value: clarification,
          setter: setClarification,
        },
      ].map((q, i) => (
        <div key={i} style={{ marginTop: 12 }}>
          <label>
            {q.label}
            <textarea
              value={q.value}
              onChange={(e) => q.setter(e.target.value)}
              required
              style={{ width: "100%", minHeight: 80, marginTop: 4 }}
            />
          </label>
        </div>
      ))}

      <Likert
        name="clarity"
        label="このメモの内容はどの程度わかりやすいと感じましたか？"
        low="まったくわかりにくい"
        high="非常にわかりやすい"
        value={clarity}
        onChange={setClarity}
      />
      <Likert
        name="understanding"
        label="このメモの意図や伝えたい内容を十分に理解できたと感じますか？"
        low="まったくそう感じない"
        high="非常にそう感じる"
        value={understanding}
        onChange={setUnderstanding}
      />
      <Likert
        name="burden"
        label="このメモの内容を理解するのに、どの程度の負担を感じましたか？"
        low="まったく負担を感じなかった"
        high="非常に負担を感じた"
        value={burden}
        onChange={setBurden}
      />
      <Likert
        name="closeness"
        label="普段、メモの作成者とどの程度近い関係で仕事をしていますか？"
        low="まったく近くない"
        high="非常に近い"
        value={closeness}
        onChange={setCloseness}
      />
      <Likert
        name="dept_knowledge"
        label="ご自身の部署の業務・優先事項・仕事の進め方について、どの程度理解していると感じますか？"
        low="まったく理解していない"
        high="非常によく理解している"
        value={deptKnowledge}
        onChange={setDeptKnowledge}
      />

      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <button type="submit" disabled={loading} style={{ marginTop: 16, padding: "8px 16px" }}>
        {loading ? "送信中..." : "アンケートを提出する"}
      </button>
    </form>
  );
}
