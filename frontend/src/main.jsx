import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./live/App.jsx";
import "./styles.css";

class ErrorBoundary extends React.Component {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="empty">
        <h1>화면을 불러오지 못했어요</h1>
        <p>
          화면을 다시 불러와 주세요. 작성 중이었다면 저장 여부를 확인해 주세요.
        </p>
        <button className="btn primary" onClick={() => location.reload()}>
          다시 시도
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
