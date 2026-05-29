import { useMemo, useState } from "react";

interface Props {
  role: "writer" | "reader";
  onConsent: () => Promise<void> | void;
  loading?: boolean;
  error?: string | null;
}

const WRITER_ITEMS = [
  "参加者情報シートを読み、内容を理解しました。",
  "研究への参加は任意であることを理解しました。",
  "メモ作成中のプロセスデータおよびアンケート回答が研究目的で収集されることを理解しました。",
  "個人の研究データが管理者に共有されたり、人事評価・業務評価に使用されたりしないことを理解しました。",
  "本研究に参加することに同意します。",
];

const READER_ITEMS = [
  "参加者情報シートを読み、内容を理解しました。",
  "研究への参加は任意であることを理解しました。",
  "同僚が作成したメモを読み、その内容について自分の理解や解釈に関する質問に回答することを理解しました。",
  "個人の回答が管理者やメモ作成者に共有されたり、人事評価・業務評価に使用されたりしないことを理解しました。",
  "本研究に参加することに同意します。",
];

export default function ConsentScreen({ role, onConsent, loading, error }: Props) {
  const items = role === "writer" ? WRITER_ITEMS : READER_ITEMS;
  const [checked, setChecked] = useState<boolean[]>(() => items.map(() => false));
  const allChecked = useMemo(() => checked.every(Boolean), [checked]);

  return (
    <div style={{ maxWidth: 720 }}>
      <h2>研究参加への同意</h2>
      <p>タスクを開始する前に、参加者情報シートを確認し、以下の項目に同意してください。</p>
      <p>
        <em>(MVP: 参加者情報シートのリンクはここに表示されます。)</em>
      </p>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {items.map((label, i) => (
          <li key={i} style={{ marginBottom: 12 }}>
            <label>
              <input
                type="checkbox"
                checked={checked[i]}
                onChange={(e) => {
                  const next = [...checked];
                  next[i] = e.target.checked;
                  setChecked(next);
                }}
              />
              <span style={{ marginLeft: 8 }}>{label}</span>
            </label>
          </li>
        ))}
      </ul>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <button
        type="button"
        disabled={!allChecked || loading}
        onClick={() => onConsent()}
        style={{ padding: "8px 16px" }}
      >
        {role === "writer" ? "同意してタスクを開始する" : "同意して閲覧タスクを開始する"}
      </button>
    </div>
  );
}
