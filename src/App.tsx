import { BrowserRouter, Routes, Route, Link, Navigate } from "react-router-dom";
import WriterPage from "./pages/WriterPage";
import ReaderPage from "./pages/ReaderPage";
import AdminPage from "./pages/AdminPage";
import Icon from "./components/Icon";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/writer" element={<WriterPage />} />
        <Route path="/reader" element={<ReaderPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/" element={<Home />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function Home() {
  const linkRow: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 16px",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    marginBottom: 10,
    background: "var(--color-bg)",
    color: "var(--color-text)",
    textDecoration: "none",
    borderBottomColor: "var(--color-border)",
  };
  return (
    <div style={{ padding: 32, maxWidth: 640, margin: "0 auto" }}>
      <h1>AI生成した資料の社内共有に関する研究</h1>
      <p className="muted">参加するタスクを選んでください。</p>
      <div style={{ marginTop: 20 }}>
        <Link to="/writer" style={linkRow}>
          <Icon name="edit_note" size={22} />
          <span>メモ作成タスク</span>
          <span className="muted" style={{ marginLeft: "auto", fontSize: 13 }}>
            /writer
          </span>
        </Link>
        <Link to="/reader" style={linkRow}>
          <Icon name="menu_book" size={22} />
          <span>メモ閲覧タスク</span>
          <span className="muted" style={{ marginLeft: "auto", fontSize: 13 }}>
            /reader
          </span>
        </Link>
        <Link to="/admin" style={linkRow}>
          <Icon name="admin_panel_settings" size={22} />
          <span>管理画面</span>
          <span className="muted" style={{ marginLeft: "auto", fontSize: 13 }}>
            /admin
          </span>
        </Link>
      </div>
    </div>
  );
}
