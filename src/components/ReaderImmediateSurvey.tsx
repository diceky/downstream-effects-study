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
  const [mainPoint, setMainPoint] = useState<string[]>(["", "", ""]);
  const [relevance, setRelevance] = useState("");
  const [teamAwareness, setTeamAwareness] = useState("");
  const [clarity, setClarity] = useState<number | null>(null);
  const [understanding, setUnderstanding] = useState<number | null>(null);
  const [burden, setBurden] = useState<number | null>(null);
  const [closeness, setCloseness] = useState<number | null>(null);
  const [deptKnowledge, setDeptKnowledge] = useState<number | null>(null);
  const [selfReference, setSelfReference] = useState<number | null>(null);
  const [otherReference, setOtherReference] = useState<number | null>(null);
  const [authorInfluence, setAuthorInfluence] = useState<number | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await onSubmit({
      main_point: mainPoint,
      relevance,
      team_awareness: teamAwareness,
      clarity,
      understanding,
      burden,
      closeness,
      dept_knowledge: deptKnowledge,
      self_reference: selfReference,
      other_reference: otherReference,
      author_influence: authorInfluence,
    });
  };

  const allRequiredAnswered =
    mainPoint[0].trim() !== "" &&
    relevance.trim() !== "" &&
    teamAwareness.trim() !== "" &&
    clarity !== null &&
    understanding !== null &&
    burden !== null &&
    closeness !== null &&
    deptKnowledge !== null &&
    selfReference !== null &&
    otherReference !== null &&
    authorInfluence !== null;

  const textQuestions: { label: string; value: string; setter: (v: string) => void }[] = [
    {
      label: "ご自身の業務に照らして、特に関連がありそうだと感じた点はありますか？あれば教えてください。",
      value: relevance,
      setter: setRelevance,
    },
    {
      label: "このメモを読んで、今後もっと意識すべきだと思ったことを1つ教えてください。",
      value: teamAwareness,
      setter: setTeamAwareness,
    },
  ];

  return (
    <form onSubmit={submit} style={{ maxWidth: 1040 }}>
      <h2>Immediate Reader Survey</h2>
      <p>
        以下の質問には、先ほど読んだメモについて、あなた自身の理解や解釈に基づいて回答してください。メモはこの画面では表示されません。
      </p>

      <div style={{ marginTop: 32 }}>
        <label>
          このメモで、作成者が伝えたかったと思うことを、最大3つまで書いてください。できるだけ具体的に、1つの欄につき1つの内容を短い文で書いてください。二つ目以降は無ければ空欄のままで構いません。
          <span style={{ color: "#dc2626", marginLeft: 4 }}>*</span>
        </label>
        {mainPoint.map((val, i) => (
          <input
            key={i}
            type="text"
            value={val}
            onChange={(e) =>
              setMainPoint((prev) =>
                prev.map((p, j) => (j === i ? e.target.value : p))
              )
            }
            required={i === 0}
            placeholder={`伝えたかったと思うこと ${i + 1}`}
            style={{ width: "100%", marginTop: 8 }}
          />
        ))}
      </div>

      {textQuestions.map((q, i) => (
        <div key={i} style={{ marginTop: 32 }}>
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
        name="self_reference"
        label="メモの内容は自分の部署・チームに関係する内容だと感じた。"
        value={selfReference}
        onChange={setSelfReference}
      />
      <Likert
        name="other_reference"
        label="メモの内容は書き手ならではの経験・視点・気づきが含まれていると感じた。"
        value={otherReference}
        onChange={setOtherReference}
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
