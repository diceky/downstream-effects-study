import { useState, FormEvent } from "react";

interface Props {
  onSubmit: (answers: Record<string, unknown>) => Promise<void> | void;
  loading?: boolean;
  error?: string | null;
  writerName?: string | null;
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

export default function ReaderImmediateSurvey({ onSubmit, loading, error, writerName }: Props) {
  const [mainPoint, setMainPoint] = useState("");
  const [relevance, setRelevance] = useState("");
  const [teamAwareness, setTeamAwareness] = useState("");
  const [clarification, setClarification] = useState("");
  const [clarity, setClarity] = useState<number | null>(null);
  const [understanding, setUnderstanding] = useState<number | null>(null);
  const [burden, setBurden] = useState<number | null>(null);
  const [closeness, setCloseness] = useState<number | null>(null);
  const [deptKnowledge, setDeptKnowledge] = useState<number | null>(null);
  const [teamRelevance, setTeamRelevance] = useState<number | null>(null);
  const [authorInfluence, setAuthorInfluence] = useState<number | null>(null);

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
      team_relevance: teamRelevance,
      author_influence: authorInfluence,
    });
  };

  const allRequiredAnswered =
    mainPoint.trim() !== "" &&
    relevance.trim() !== "" &&
    teamAwareness.trim() !== "" &&
    clarification.trim() !== "" &&
    clarity !== null &&
    understanding !== null &&
    burden !== null &&
    closeness !== null &&
    deptKnowledge !== null &&
    teamRelevance !== null &&
    authorInfluence !== null;

  const textQuestions: { label: string; value: string; setter: (v: string) => void }[] = [
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
      label: "この内容を実務に活かす前に、メモの作成者に対して確認・明確化したい点があれば教えてください。",
      value: clarification,
      setter: setClarification,
    },
  ];

  return (
    <form onSubmit={submit} style={{ maxWidth: 1040 }}>
      <h2>メモ閲覧後アンケート</h2>
      <p>
        以下の質問には、先ほど読んだメモについて、あなた自身の理解や解釈に基づいて回答してください。メモはこの画面では表示されません。
      </p>

      {textQuestions.map((q, i) => (
        <div key={i} style={{ marginTop: 12 }}>
          <label>
            {q.label}
            <span style={{ color: "#dc2626", marginLeft: 4 }}>*</span>
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
        label="このメモの内容はわかりやすかった。"
        value={clarity}
        onChange={setClarity}
      />
      <Likert
        name="understanding"
        label="このメモの意図や伝えたい内容を十分に理解できた。"
        value={understanding}
        onChange={setUnderstanding}
      />
      <Likert
        name="burden"
        label="このメモの内容を理解するのに、認知的な負荷を強く感じた。"
        value={burden}
        onChange={setBurden}
      />
      <Likert
        name="team_relevance"
        label="メモの内容は自分のチームにとって関連性の高いものだと感じた。"
        value={teamRelevance}
        onChange={setTeamRelevance}
      />
      <Likert
        name="closeness"
        label={`普段、メモの作成者${
          writerName ? `（${writerName}）` : ""
        }と近い関係で仕事をしている。`}
        value={closeness}
        onChange={setCloseness}
      />
      <Likert
        name="author_influence"
        label={`メモの作成者${
          writerName ? `（${writerName}）` : ""
        }からの情報は普段から自分の業務に大きな影響がある。`}
        value={authorInfluence}
        onChange={setAuthorInfluence}
      />
      <Likert
        name="dept_knowledge"
        label="自分は、所属部署の業務内容や業務特性をよく理解している。"
        value={deptKnowledge}
        onChange={setDeptKnowledge}
      />

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
