import { useState, FormEvent } from "react";

interface Props {
  onSubmit: (answers: Record<string, unknown>) => Promise<void> | void;
  loading?: boolean;
  error?: string | null;
}

const CHANGE_OPTIONS = [
  "大きく変わった",
  "少し変わった",
  "あまり変わっていない",
  "まったく変わっていない",
  "わからない",
];

const REASON_OPTIONS = [
  "業務にあまり関係がなかった",
  "実践する機会がなかった",
  "内容に不明点が多かった",
  "あまり重要だと感じなかった",
  "すでに実践していた内容だった",
  "その他 / 該当なし",
];

export default function ReaderDelayedSurvey({ onSubmit, loading, error }: Props) {
  const [remembered, setRemembered] = useState("");
  const [change, setChange] = useState("");
  const [changeDetail, setChangeDetail] = useState("");
  const [reason, setReason] = useState("");
  const [reread, setReread] = useState("");
  const [shared, setShared] = useState("");
  const [comments, setComments] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await onSubmit({
      remembered_points: remembered,
      change_magnitude: change,
      change_detail: changeDetail,
      no_change_reason: reason,
      reread,
      shared,
      comments,
    });
  };

  return (
    <form onSubmit={submit} style={{ maxWidth: 720 }}>
      <h2>フォローアップアンケート</h2>
      <p>
        フォローアップアンケートに戻っていただきありがとうございます。このアンケートでは、以前読んだメモについて現在覚えている内容や、そのメモがあなたの考え方や業務に影響したかどうかについてお聞きします。メモは再表示されません。覚えている範囲で回答してください。
      </p>

      <div style={{ marginTop: 12 }}>
        <label>
          そのメモで伝えられていた主なポイントとして、今どのような内容を覚えていますか？可能であれば3点まで挙げてください。
          <textarea
            value={remembered}
            onChange={(e) => setRemembered(e.target.value)}
            required
            style={{ width: "100%", minHeight: 80, marginTop: 4 }}
          />
        </label>
      </div>

      <fieldset style={{ marginTop: 16, border: "1px solid #eee", padding: 8 }}>
        <legend>
          そのメモを読んで以降、ご自身の業務の進め方やAIの使い方について、どの程度変化がありましたか？
        </legend>
        {CHANGE_OPTIONS.map((o) => (
          <label key={o} style={{ display: "block" }}>
            <input
              type="radio"
              name="change"
              value={o}
              checked={change === o}
              onChange={() => setChange(o)}
              required
            />
            <span style={{ marginLeft: 6 }}>{o}</span>
          </label>
        ))}
      </fieldset>

      <div style={{ marginTop: 12 }}>
        <label>
          変化があった場合、具体的にどのような点が変わりましたか？できるだけ具体的に教えてください。
          <textarea
            value={changeDetail}
            onChange={(e) => setChangeDetail(e.target.value)}
            style={{ width: "100%", minHeight: 80, marginTop: 4 }}
          />
        </label>
      </div>

      <fieldset style={{ marginTop: 16, border: "1px solid #eee", padding: 8 }}>
        <legend>
          あまり変わっていない、またはまったく変わっていない場合、その理由として最も近いものを選んでください。
        </legend>
        {REASON_OPTIONS.map((o) => (
          <label key={o} style={{ display: "block" }}>
            <input
              type="radio"
              name="reason"
              value={o}
              checked={reason === o}
              onChange={() => setReason(o)}
            />
            <span style={{ marginLeft: 6 }}>{o}</span>
          </label>
        ))}
      </fieldset>

      <fieldset style={{ marginTop: 16, border: "1px solid #eee", padding: 8 }}>
        <legend>初めて読んで以降、そのメモを改めて見返したことはありますか？</legend>
        {["はい", "いいえ"].map((v) => (
          <label key={v} style={{ marginRight: 12 }}>
            <input
              type="radio"
              name="reread"
              value={v}
              checked={reread === v}
              onChange={() => setReread(v)}
              required
            />
            {v}
          </label>
        ))}
      </fieldset>

      <fieldset style={{ marginTop: 16, border: "1px solid #eee", padding: 8 }}>
        <legend>そのメモの内容について、他の人と話したり共有したりしましたか？</legend>
        {["はい", "いいえ"].map((v) => (
          <label key={v} style={{ marginRight: 12 }}>
            <input
              type="radio"
              name="shared"
              value={v}
              checked={shared === v}
              onChange={() => setShared(v)}
              required
            />
            {v}
          </label>
        ))}
      </fieldset>

      <div style={{ marginTop: 12 }}>
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
        {loading ? "送信中..." : "フォローアップアンケートを提出する"}
      </button>
    </form>
  );
}
