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
  const [readingStartedAt, setReadingStartedAt] = useState<number | null>(null);
  const readingEndedAtRef = useRef<number | null>(null);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const lookup = useCallback(async (email: string) => {
    setError(null);
    setLoading(true);
    try {
      const data = await apiPost<LookupResp>("reader-lookup", { email });
      if (data.route === "immediate") {
        setReaderId(data.reader_id);
        setMemoText(data.memo_text);
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
      setReadingStartedAt(Date.now());
      setStep("reading");
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
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>メモ閲覧タスク</h1>

      {step === "email" && <EmailEntry onSubmit={lookup} loading={loading} error={error} />}

      {step === "consent" && (
        <ConsentScreen role="reader" onConsent={consent} loading={loading} error={error} />
      )}

      {step === "reading" && (
        <div>
          <p style={{ whiteSpace: "pre-wrap" }}>
            {`これから、同じ部署の同僚が作成した1ページのメモを読んでいただきます。

この同僚は社内のAI研修プログラムに参加し、その主な学びをチームメンバーに共有するためにこのメモを作成しました。

メモをよく読んでください。メモは最大5分間表示されます。その後、メモの内容について、あなたの理解や解釈に関する質問に回答していただきます。質問に回答している間は、メモを再表示することはできません。

これはテストではなく、正解・不正解はありません。あなたが理解・解釈した内容に基づいて、できる範囲で回答してください。`}
          </p>

          <div style={{ marginTop: 12 }}>
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
            <MarkdownRenderer source={memoText} />
          </div>

          <button
            type="button"
            onClick={goToImmediateSurvey}
            style={{ marginTop: 16, padding: "8px 16px" }}
          >
            質問に進む
          </button>
        </div>
      )}

      {step === "immediate_survey" && (
        <ReaderImmediateSurvey onSubmit={submitImmediate} loading={loading} error={error} />
      )}

      {step === "immediate_thanks" && (
        <div>
          <h2>ありがとうございました</h2>
          <p style={{ whiteSpace: "pre-wrap" }}>
            {`第1回のタスクは完了しました。

約2週間後に、短いフォローアップアンケートへの回答をお願いする予定です。フォローアップアンケートでは、今回読んだメモについて覚えている内容や、その後の考え方・業務への影響についてお聞きします。

メモを無理に覚えておく必要はありません。本研究では、自然な職場での理解や記憶を調べています。

ご協力ありがとうございました。`}
          </p>
        </div>
      )}

      {step === "delayed_not_available" && (
        <p>フォローアップアンケートはまだ開始できません。指定された時期以降に再度アクセスしてください。</p>
      )}

      {step === "delayed_intro" && (
        <div>
          <p style={{ whiteSpace: "pre-wrap" }}>
            {`フォローアップアンケートに戻っていただきありがとうございます。

このアンケートでは、以前読んだメモについて現在覚えている内容や、そのメモがあなたの考え方や業務に影響したかどうかについてお聞きします。

メモは再表示されません。覚えている範囲で回答してください。`}
          </p>
          <button
            type="button"
            onClick={() => setStep("delayed_survey")}
            style={{ marginTop: 12, padding: "8px 16px" }}
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
          <h2>ありがとうございました</h2>
          <p style={{ whiteSpace: "pre-wrap" }}>
            {`フォローアップアンケートは完了しました。

ご協力ありがとうございました。回答は正常に送信されました。`}
          </p>
        </div>
      )}

      {step === "completed" && (
        <p>このタスクはすでに完了しています。ご協力ありがとうございました。</p>
      )}
    </div>
  );
}
