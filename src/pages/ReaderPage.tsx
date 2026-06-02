import { useCallback, useEffect, useRef, useState } from "react";
import EmailEntry from "../components/EmailEntry";
import ConsentScreen from "../components/ConsentScreen";
import Timer from "../components/Timer";
import ReaderImmediateSurvey from "../components/ReaderImmediateSurvey";
import ReaderDelayedSurvey from "../components/ReaderDelayedSurvey";
import MarkdownRenderer from "../components/MarkdownRenderer";
import { apiPost } from "../lib/apiClient";

const CONSENT_VERSION = "v1_mvp";
const READING_DURATION_SECONDS = 5 * 60;

type Route = "immediate" | "delayed" | "completed";

interface ImmediateLookup {
  route: "immediate";
  reader_id: string;
  assigned_memo_id: string;
  assigned_writer_id: string;
  status: string;
  memo_text: string;
  writer_name: string | null;
  writer_email: string | null;
}

interface DelayedLookup {
  route: "delayed";
  reader_id: string;
  assigned_memo_id: string;
  assigned_writer_id: string;
  delayed_available_from?: string | null;
}

interface CompletedLookup {
  route: "completed";
}

type LookupResp = ImmediateLookup | DelayedLookup | CompletedLookup;

type Step =
  | "email"
  | "consent"
  | "immediate_intro"
  | "reading"
  | "immediate_survey"
  | "immediate_thanks"
  | "delayed_intro"
  | "delayed_not_available"
  | "delayed_survey"
  | "delayed_thanks"
  | "completed";

export default function ReaderPage() {
  const [step, setStep] = useState<Step>("email");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [readerId, setReaderId] = useState<string | null>(null);
  const [memoText, setMemoText] = useState<string>("");
  const [writerName, setWriterName] = useState<string | null>(null);
  const [writerEmail, setWriterEmail] = useState<string | null>(null);
  const [readingStartedAt, setReadingStartedAt] = useState<number | null>(null);
  const readingEndedAtRef = useRef<number | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [step]);

  const lookup = useCallback(async (email: string) => {
    setError(null);
    setLoading(true);
    try {
      const data = await apiPost<LookupResp>("reader-lookup", { email });
      if (data.route === "immediate") {
        setReaderId(data.reader_id);
        setMemoText(data.memo_text);
        setWriterName(data.writer_name);
        setWriterEmail(data.writer_email);
        setStep("consent");
      } else if (data.route === "delayed") {
        setReaderId(data.reader_id);
        if (
          data.delayed_available_from &&
          new Date(data.delayed_available_from).getTime() > Date.now()
        ) {
          setStep("delayed_not_available");
        } else {
          setStep("delayed_intro");
        }
      } else {
        setStep("completed");
      }
    } catch (e: any) {
      setError(e?.message ?? "送信中にエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }, []);

  const consent = useCallback(async () => {
    if (!readerId) return;
    setError(null);
    setLoading(true);
    try {
      await apiPost("reader-consent", {
        reader_id: readerId,
        consent_version: CONSENT_VERSION,
      });
      setStep("immediate_intro");
    } catch (e: any) {
      setError(e?.message ?? "送信中にエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }, [readerId]);

  const goToImmediateSurvey = useCallback(() => {
    readingEndedAtRef.current = Date.now();
    setStep("immediate_survey");
  }, []);

  const submitImmediate = useCallback(
    async (answers: Record<string, unknown>) => {
      if (!readerId || !readingStartedAt) return;
      setError(null);
      setLoading(true);
      try {
        const endedAt = readingEndedAtRef.current ?? Date.now();
        await apiPost("reader-submit-immediate", {
          reader_id: readerId,
          reading_started_at: new Date(readingStartedAt).toISOString(),
          reading_ended_at: new Date(endedAt).toISOString(),
          reading_duration_seconds: Math.floor((endedAt - readingStartedAt) / 1000),
          immediate_answers_json: answers,
        });
        setMemoText("");
        setStep("immediate_thanks");
      } catch (e: any) {
        setError(e?.message ?? "送信中にエラーが発生しました。");
      } finally {
        setLoading(false);
      }
    },
    [readerId, readingStartedAt]
  );

  const submitDelayed = useCallback(
    async (answers: Record<string, unknown>) => {
      if (!readerId) return;
      setError(null);
      setLoading(true);
      try {
        await apiPost("reader-submit-delayed", {
          reader_id: readerId,
          delayed_answers_json: answers,
        });
        setStep("delayed_thanks");
      } catch (e: any) {
        setError(e?.message ?? "送信中にエラーが発生しました。");
      } finally {
        setLoading(false);
      }
    },
    [readerId]
  );

  return (
    <div style={{ padding: "56px 24px 32px", maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 16, fontWeight: 500, color: "#6b7280", margin: "0 0 24px" }}>
        メモ閲覧タスク
      </h1>

      {step === "email" && <EmailEntry onSubmit={lookup} loading={loading} error={error} />}

      {step === "consent" && (
        <ConsentScreen role="reader" onConsent={consent} loading={loading} error={error} />
      )}

      {step === "immediate_intro" && (
        <div
          style={{
            maxWidth: 760,
            fontSize: 16,
            lineHeight: 1.8,
            color: "#1f2937",
          }}
        >
          <h2 style={{ fontSize: 28, marginBottom: 24 }}>メモ閲覧タスクの説明</h2>

          <p style={{ marginBottom: 24 }}>
            本タスクでは、あなたと同じ部署の同僚が作成した短いメモを読んでいただきます。この同僚は社内のAIプロトタイピングプログラムに参加した直後で、その主な学びをチームメンバーに共有するためにメモを作成しました。本インターフェース上でメモを閲覧していただきます。
          </p>
          <p style={{ marginBottom: 24 }}>
            メモは最大5分間表示されます。その間に、メモをよく読んでください。読み終えた段階で先に進んでいただいて構いませんが、メモを閲覧できるのは最長5分間です。5分が経過した後、メモの内容に関するいくつかの質問に回答していただきます。質問に回答している間は、メモを見ることはできません。
          </p>
          <p style={{ marginBottom: 32 }}>
            これはテストではなく、正解・不正解も特にありません。あなたの理解・解釈に基づいて回答してください。
          </p>

          <h3 style={{ fontSize: 20, marginTop: 40, marginBottom: 16 }}>本タスクにおける注意事項</h3>
          <ul style={{ marginBottom: 32, paddingLeft: 24 }}>
            <li style={{ marginBottom: 8 }}>他者と相談・会話せず、個人で実施してください。</li>
            <li style={{ marginBottom: 8 }}>ノートPCまたはデスクトップPCを使用し、途中で中断せず一気に進めることを推奨します。</li>
            <li style={{ marginBottom: 8 }}>外部のAIツールやウェブサイトを使用しないでください。</li>
          </ul>

          {error && <p style={{ color: "crimson", marginBottom: 16 }}>{error}</p>}
          <button
            type="button"
            onClick={() => {
              setReadingStartedAt(Date.now());
              setStep("reading");
            }}
            style={{ padding: "12px 24px", fontSize: 16 }}
          >
            メモを読み始める
          </button>
        </div>
      )}

      {step === "reading" && (
        <div>
          <div style={{ marginBottom: 12 }}>
            <Timer
              startedAt={readingStartedAt}
              durationSeconds={READING_DURATION_SECONDS}
              label="閲覧時間"
              onExpire={goToImmediateSurvey}
            />
          </div>

          <div
            style={{
              border: "1px solid var(--color-border)",
              padding: 16,
              marginTop: 16,
              borderRadius: "var(--radius-md)",
              background: "var(--color-bg)",
            }}
          >
            {(writerName || writerEmail) && (
              <div
                style={{
                  marginBottom: 16,
                  paddingBottom: 12,
                  borderBottom: "1px solid #e5e7eb",
                  fontSize: 14,
                  color: "#6b7280",
                }}
              >
                <div style={{ fontWeight: 600, color: "#1f2937" }}>
                  {writerName ?? "(名前未登録)"}
                </div>
                {/* {writerEmail && <div>{writerEmail}</div>} */}
              </div>
            )}
            <MarkdownRenderer source={memoText} />
          </div>

          <button
            type="button"
            onClick={() => setShowLeaveConfirm(true)}
            style={{ marginTop: 16, padding: "8px 16px" }}
          >
            質問に進む
          </button>

          {showLeaveConfirm && (
            <div
              role="dialog"
              aria-modal="true"
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 300,
                padding: 16,
              }}
            >
              <div
                style={{
                  background: "var(--color-bg)",
                  borderRadius: "var(--radius-md)",
                  padding: 24,
                  maxWidth: 380,
                  width: "100%",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
                }}
              >
                <p style={{ marginTop: 0, fontSize: 15, lineHeight: 1.7 }}>
                  一度次の画面へ進むともうメモを見直すことはできません。次に進みますか？
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowLeaveConfirm(false);
                      goToImmediateSurvey();
                    }}
                    style={{
                      background: "var(--color-danger, #dc2626)",
                      color: "#fff",
                      border: "1px solid var(--color-danger, #dc2626)",
                      padding: "10px 16px",
                      fontWeight: 600,
                      textAlign: "center",
                      justifyContent: "center",
                    }}
                  >
                    次へ進む
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLeaveConfirm(false)}
                    style={{ textAlign: "center", justifyContent: "center" }}
                  >
                    戻る
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {step === "immediate_survey" && (
        <ReaderImmediateSurvey onSubmit={submitImmediate} loading={loading} error={error} />
      )}

      {step === "immediate_thanks" && (
        <div>
          <h2>ご協力ありがとうございました！</h2>
          <p style={{ whiteSpace: "pre-wrap" }}>
            {`第1回のタスクは完了しました。

約2週間後に、短いフォローアップアンケートへの回答をご案内させて頂きます。

引き続きご協力のほど、よろしくお願いいたします。`}
          </p>
        </div>
      )}

      {step === "delayed_not_available" && (
        <p>フォローアップアンケートはまだ開始できません。研究管理者からフォローアップについての連絡が来てから再度アクセスをお願い致します。</p>
      )}

      {step === "delayed_intro" && (
        <div
          style={{
            maxWidth: 760,
            fontSize: 16,
            lineHeight: 1.8,
            color: "#1f2937",
          }}
        >
          <h2 style={{ fontSize: 28, marginBottom: 24 }}>フォローアップアンケートの説明</h2>

          <p style={{ marginBottom: 24 }}>
            本タスクでは、2週間前に読んでいただいた同僚のメモに関するいくつかの質問に回答していただきます。質問に回答している間、元のメモを見ることはできません。
          </p>
          <p style={{ marginBottom: 32 }}>
            これはテストではなく、正解・不正解はありません。あなたの理解・解釈に基づいて、できる範囲で回答してください。
          </p>

          <h3 style={{ fontSize: 20, marginTop: 40, marginBottom: 16 }}>本タスクにおける注意事項</h3>
          <ul style={{ marginBottom: 32, paddingLeft: 24 }}>
            <li style={{ marginBottom: 8 }}>他者と相談・会話せず、個人で実施してください。</li>
            <li style={{ marginBottom: 8 }}>ノートPCまたはデスクトップPCを使用し、途中で中断せず一気に進めることを推奨します。</li>
            <li style={{ marginBottom: 8 }}>外部のAIツールやウェブサイトを使用しないでください。</li>
          </ul>

          <button
            type="button"
            onClick={() => setStep("delayed_survey")}
            style={{ padding: "12px 24px", fontSize: 16 }}
          >
            フォローアップアンケートを開始する
          </button>
        </div>
      )}

      {step === "delayed_survey" && (
        <ReaderDelayedSurvey onSubmit={submitDelayed} loading={loading} error={error} />
      )}

      {step === "delayed_thanks" && (
        <div>
          <h2>ご協力ありがとうございました！</h2>
          <p style={{ whiteSpace: "pre-wrap" }}>
            {`回答は正常に送信されました。

これでメモ閲覧タスクは完了となります。全ての結果がで揃い次第、分析結果をレポートさせて頂きます。`}
          </p>
        </div>
      )}

      {step === "completed" && (
        <p>このタスクはすでに完了しています。ご協力ありがとうございました。</p>
      )}
    </div>
  );
}
