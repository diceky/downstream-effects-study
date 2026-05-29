import { useState, FormEvent } from "react";

interface Props {
  onSubmit: (email: string) => Promise<void> | void;
  loading?: boolean;
  error?: string | null;
}

export default function EmailEntry({ onSubmit, loading, error }: Props) {
  const [email, setEmail] = useState("");

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    await onSubmit(email);
  };

  return (
    <form onSubmit={handle} style={{ maxWidth: 480 }}>
      <p>研究タスクを開始するため、会社のメールアドレスを入力してください。</p>
      <label htmlFor="email" style={{ display: "block", marginTop: 12 }}>
        会社のメールアドレス
      </label>
      <input
        id="email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        style={{ width: "100%", padding: 8, marginTop: 4 }}
      />
      {error && <p style={{ color: "crimson", marginTop: 12 }}>{error}</p>}
      <button type="submit" disabled={loading} style={{ marginTop: 16, padding: "8px 16px" }}>
        {loading ? "確認中..." : "次へ"}
      </button>
    </form>
  );
}
