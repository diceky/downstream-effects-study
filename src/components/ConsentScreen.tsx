import { useMemo, useState } from "react";

interface Props {
  role: "writer" | "reader";
  condition?: string;
  onConsent: () => Promise<void> | void;
  loading?: boolean;
  error?: string | null;
}

const READER_ITEMS = [
  "Participant Information Sheetを読み、内容を理解しました。",
  "研究への参加は任意であることを理解しました。",
  "メモの作成者を知っている可能性があること及び私の回答が個人を特定できる形で作成者に共有されることはないことを理解しました。",
  "即時アンケートに回答すること、および2週間後のフォローアップアンケートに関する連絡を受けることを理解しました。",
  "第2セッション終了後にフォローアップインタビューに招待される可能性があり、参加するかどうかは自由に選択できることを理解しました。",
  "本研究のデータが人事評価に使用されないことを理解しました。",
  "本研究に参加することに同意します。",
];

function getWriterItems(condition?: string): string[] {
  const isAi = condition === "ai_mediated";
  return [
    "Participant Information Sheetを読み、内容を理解しました。",
    "研究への参加は任意であることを理解しました。",
    "私が作成した振り返りメモが、選定された同僚に共有されることを理解しました。",
    "執筆中の入力データ(キー入力のログ、執筆中に追加・削除された語句のカウント)が収集されることを理解しました。",
    ...(isAi
      ? ["AIへのプロンプトおよびAIからの応答が収集される可能性があることを理解しました。"]
      : []),
    "本研究のデータが人事評価に使用されないことを理解しました。",
    "本研究に参加することに同意します。",
  ];
}

export default function ConsentScreen({ role, condition, onConsent, loading, error }: Props) {
  const items = role === "writer" ? getWriterItems(condition) : READER_ITEMS;
  const [checked, setChecked] = useState<boolean[]>(() => items.map(() => false));
  const allChecked = useMemo(() => checked.every(Boolean), [checked]);

  return (
    <div
      style={{
        maxWidth: 760,
        fontSize: 16,
        lineHeight: 1.8,
        color: "#1f2937",
      }}
    >
      <h2 style={{ fontSize: 28, marginBottom: 24 }}>研究参加への同意</h2>
      {role === "writer" ? (
        <>
          <p style={{ marginBottom: 24 }}>
            本研究へのご参加をご検討いただき、ありがとうございます。本研究の目的は、AIを用いた資料作成が、組織内の知識伝達にどのような影響を与えるかを検証することです。個人の文章作成能力、従業員の評価、またはAIプロトタイピングプログラムの成果を評価することを目的とするものではありません。
          </p>
          <h3 style={{ fontSize: 20, marginTop: 40, marginBottom: 16 }}>参加内容について</h3>
          <p style={{ marginBottom: 20 }}>
            参加に同意いただいた場合、主なタスクは、本インターフェースを使用して、AIプロトタイピングプログラムから得た主な学びについての1ページのメモを作成し、同僚に共有していただくことです。本タスクはオンラインで実施され、執筆の制限時間は15分です。
          </p>
          <p style={{ marginBottom: 16 }}>
            参加者の半数の方にはAIを使用せずに自らメモを作成して頂きます。残りの半数は最初の10分間でAIを用いてドラフトを生成し、残りの5分間で手動で修正・編集していただきます。いずれの条件においても、執筆およびAI生成の補助資料として以下をご利用いただけます。
          </p>
          <ul style={{ marginBottom: 24, paddingLeft: 24 }}>
            <li style={{ marginBottom: 8 }}>
              AIプロトタイピングプログラムの概要PDF
            </li>
            <li style={{ marginBottom: 8 }}>
              AIプロトタイピングプログラムの全アクティビティに対するご自身のプログラム中の振り返り内容
            </li>
          </ul>
          <p style={{ marginBottom: 24 }}>
            メモ作成中は、入力データ(キー入力のログ、執筆中に追加・削除された語句のカウント)及び（該当する場合は）AIへのプロンプト・レスポンスを収集します。メモ作成終了後、本インターフェース上で短い事後アンケートにご回答いただきます。セッション全体の所要時間は約20分を想定しています。
          </p>
          <p style={{ marginBottom: 24 }}>
            作成いただいたメモは、ご所属部署の同僚3名に共有されます。選定条件として、あなたと同じ部署に所属し、かつAIプロトタイピングプログラムにまだ参加していない方とするため、具体的な人選は研究チームが行います。補足資料は同僚に共有されず、メモのみが共有されます。同僚はメモを読み、その解釈についてのアンケートに回答します。同僚の回答内容を、個人が特定できる形であなたに伝わることはありません。
          </p>
          <p style={{ marginBottom: 32 }}>
            研究データは、分析および報告時に匿名化されます。個人のデータがエクレクトの管理職に共有されたり、人事評価に使用されたりすることは一切ありません。エクレクトへの結果報告は、集計・匿名化された形のみで行われます。
          </p>
          <p style={{ marginBottom: 16 }}>
            より詳しい研究内容は、下記のParticipant Information Sheetに記載されています。必ず内容をご確認ください。
          </p>
          <p style={{ marginBottom: 24 }}>
            <em>(Link to participant information sheet)</em>
          </p>
          <h3 style={{ fontSize: 20, marginTop: 40, marginBottom: 16 }}>同意事項</h3>
          <p style={{ marginBottom: 16 }}>研究にご参加頂くためには、以下の全ての項目への同意が必要です。</p>
        </>
      ) : (
        <>
          <p style={{ marginBottom: 24 }}>
            本研究へのご参加をご検討いただき、ありがとうございます。本研究の目的は、AIを用いた資料作成が、組織内の知識伝達にどのような影響を与えるかを検証することです。個人の文章作成能力、従業員の評価、またはAIプロトタイピングプログラムの成果を評価することを目的とするものではありません。
          </p>
          <h3 style={{ fontSize: 20, marginTop: 40, marginBottom: 16 }}>参加内容について</h3>
          <p style={{ marginBottom: 24 }}>
            参加に同意いただいた場合、主なタスクは、2回の短いオンラインセッションへのご参加です。これらのセッションは非同期となり、ご自身の都合の良い時間に参加いただけます。
          </p>
          <p style={{ marginBottom: 24 }}>
            第1セッションでは、同じ部署の同僚が作成した1ページのメモをお読みいただきます。同僚は社内のAIプロトタイピングプログラムに参加した直後で、チームメンバーに向けて主な学びをメモにまとめています。本インターフェース上で1ページのメモを読み、その後、そのメモに対する印象や解釈についてのアンケートにご回答いただきます。メモを読む際には、作成者が誰であるかが提示されます。第1セッションの所要時間は最大15分です。
          </p>
          <p style={{ marginBottom: 24 }}>
            第2セッションは第1セッションの2週間後に実施され、メモに関する短いフォローアップアンケートにご回答いただきます。第2セッションの所要時間は最大10分です。
          </p>
          <p style={{ marginBottom: 24 }}>
            なお、第2セッション終了後、任意で30分のフォローアップインタビューにご招待する場合があります。こちらの参加の可否も自由にご選択いただけます。
          </p>
          <p style={{ marginBottom: 32 }}>
            研究データは、分析および報告時に匿名化されます。個人の回答データがエクレクトの管理職やメモ作成者に共有されたり、人事評価に使用されたりすることは一切ありません。エクレクトへの結果報告は、集計・匿名化された形のみで行われます。
          </p>
          <p style={{ marginBottom: 16 }}>
            より詳しい研究内容は、下記のParticipant Information Sheetに記載されています。必ず内容をご確認ください。
          </p>
          <p style={{ marginBottom: 24 }}>
            <em>(Link to participant information sheet)</em>
          </p>
          <h3 style={{ fontSize: 20, marginTop: 40, marginBottom: 16 }}>同意事項</h3>
          <p style={{ marginBottom: 16 }}>研究にご参加頂くためには、以下の全ての項目への同意が必要です。</p>
        </>
      )}
      <ul style={{ listStyle: "none", padding: 0, marginBottom: 32 }}>
        {items.map((label, i) => (
          <li key={i} style={{ marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "flex-start", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={checked[i]}
                onChange={(e) => {
                  const next = [...checked];
                  next[i] = e.target.checked;
                  setChecked(next);
                }}
                style={{ marginTop: 6, width: 18, height: 18, flexShrink: 0 }}
              />
              <span style={{ marginLeft: 12 }}>{label}</span>
            </label>
          </li>
        ))}
      </ul>
      {error && <p style={{ color: "crimson", marginBottom: 16 }}>{error}</p>}
      <button
        type="button"
        disabled={!allChecked || loading}
        onClick={() => onConsent()}
        style={{ padding: "12px 24px", fontSize: 16 }}
      >
        {role === "writer" ? "同意してタスクを開始する" : "同意して閲覧タスクを開始する"}
      </button>
    </div>
  );
}
