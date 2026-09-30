import { useEffect, useState } from "react";
import {
  Send,
  FileText,
  Check,
  Paperclip,
  Download,
  ShieldCheck,
  MessageCircle,
} from "lucide-react";
import { Breadcrumb, Avatar } from "./components";
import { readStored, writeStored } from "./lib";
import { useApp } from "./store";

export default function Workroom() {
  const [tab, setTab] = useState("개요");
  const [messages, setMessages] = useState(() =>
    readStored("room-messages", [
      {
        id: "intro",
        text: "안녕하세요! 함께 프로젝트를 시작하게 되어 반갑습니다. 작업 방향을 여기서 이야기해요.",
        mine: false,
      },
    ]),
  );
  const [text, setText] = useState("");
  const [accepted, setAccepted] = useState(() =>
    readStored("room-agreed", false),
  );
  const [requested, setRequested] = useState(() =>
    readStored("room-completion", false),
  );
  const [files, setFiles] = useState(() => readStored("room-files", []));
  const { notify } = useApp();
  useEffect(() => {
    const ok = [
      writeStored("room-messages", messages),
      writeStored("room-agreed", accepted),
      writeStored("room-completion", requested),
      writeStored("room-files", files),
    ];
    if (ok.includes(false))
      notify("브라우저 저장 공간이 부족해 변경 사항을 저장하지 못했어요.");
  }, [messages, accepted, requested, files]);
  const send = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setMessages((m) => [
      ...m,
      { id: crypto.randomUUID(), text: text.trim(), mine: true },
    ]);
    setText("");
  };
  const attach = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      notify("데모에서는 2MB 이하 파일을 올릴 수 있어요.");
      return;
    }
    if (
      files.reduce((sum, f) => sum + f.size, 0) + file.size >
      3 * 1024 * 1024
    ) {
      notify("데모 파일 전체 용량은 3MB까지 저장할 수 있어요.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setFiles((f) => [
        ...f,
        {
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          data: reader.result,
        },
      ]);
    reader.readAsDataURL(file);
  };
  return (
    <div className="container simple-page">
      <Breadcrumb items={[{ label: "프로젝트 워크룸" }]} />
      <div className="room-heading">
        <div>
          <span className="badge">예시 워크룸</span>
          <h1>학교 행사 포스터 디자인</h1>
          <p>이지현 ↔ 백석 · 합의 금액 100,000원 · 작업 기간 7일</p>
        </div>
        <span className={`status ${requested ? "" : "green"}`}>
          {requested ? "완료 확인 대기" : "조건 협의 중"}
        </span>
      </div>
      <p className="demo-banner">
        워크룸 체험 화면입니다. 메시지와 파일은 현재 브라우저에만 저장되며
        상대방에게 전송되지 않습니다.
      </p>
      <div className="tabs room-tabs">
        {["개요", "채팅", "계약", "파일"].map((t) => (
          <button
            className={tab === t ? "active" : ""}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "개요" ? (
        <div className="room-overview">
          <section className="panel">
            <h2>우리 프로젝트의 현재 단계</h2>
            <ol className="room-progress">
              {["선정 완료", "계약 확인", "작업 진행", "완료"].map((s, i) => (
                <li
                  className={i === 0 ? "done" : i === 1 ? "current" : ""}
                  key={s}
                >
                  <span>{i === 0 ? <Check size={16} /> : i + 1}</span>
                  <b>{s}</b>
                </li>
              ))}
            </ol>
            <div className="form-hint">
              <ShieldCheck />
              <p>
                {accepted
                  ? "내 계약 동의를 기록했어요. 상대방이 동일 버전에 동의하면 작업을 시작할 수 있습니다."
                  : "작업 범위와 조건을 확인한 뒤 계약에 동의해 주세요."}
              </p>
            </div>
            <button className="btn primary" onClick={() => setTab("계약")}>
              계약 확인하기
            </button>
          </section>
          <section className="panel">
            <h2>최근 대화</h2>
            <p>{messages.at(-1)?.text}</p>
            <button className="text-button" onClick={() => setTab("채팅")}>
              대화 이어가기
              <MessageCircle size={16} />
            </button>
          </section>
          <section className="panel">
            <h2>
              공유 파일 <em>{files.length}</em>
            </h2>
            <p className="muted">작업에 필요한 자료를 한곳에 모아두세요.</p>
            <button className="text-button" onClick={() => setTab("파일")}>
              파일 확인하기
              <FileText size={16} />
            </button>
          </section>
        </div>
      ) : tab === "채팅" ? (
        <section className="chat-panel">
          <div className="chat-person">
            <Avatar n={1} />
            <div>
              <b>이지현</b>
              <small>학교 행사 포스터 디자인</small>
            </div>
          </div>
          <div className="messages" aria-live="polite">
            <span className="chat-date">프로젝트 대화</span>
            {messages.map((m) => (
              <div className={`message ${m.mine ? "mine" : ""}`} key={m.id}>
                {!m.mine && <Avatar n={1} />}
                <p>{m.text}</p>
              </div>
            ))}
          </div>
          <form className="chat-input" onSubmit={send}>
            <input
              aria-label="메시지"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="프로젝트에 대해 이야기해 보세요"
              maxLength={3000}
            />
            <button
              className="btn primary"
              disabled={!text.trim()}
              aria-label="메시지 보내기"
            >
              <Send size={18} />
            </button>
          </form>
        </section>
      ) : tab === "계약" ? (
        <section className="panel contract">
          <div className="inline between">
            <h2>프로젝트 계약 초안</h2>
            <span className="badge">버전 1 · 검토 중</span>
          </div>
          <div className="info-rows">
            {[
              ["의뢰자", "이지현"],
              ["수행자", "백석"],
              ["작업 범위", "학교 행사 홍보용 포스터 디자인"],
              ["결과물", "A2 포스터 1종, SNS 홍보 이미지, 편집 원본"],
              ["합의 금액", "100,000원"],
              ["수행 기간", "계약 체결 후 7일"],
              ["수정 범위", "초안 이후 2회 수정"],
            ].map(([k, v]) => (
              <p key={k}>
                <span>{k}</span>
                <b>{v}</b>
              </p>
            ))}
          </div>
          <div className="contract-status">
            <span>{accepted ? "✓ 내 동의 완료" : "○ 내 동의 대기"}</span>
            <span>○ 상대방 동의 대기</span>
          </div>
          <p className="muted small">
            양측이 동일 버전에 동의해야 계약이 체결됩니다. 이 데모는 내 동의만
            기록합니다.
          </p>
          <button
            className="btn primary"
            disabled={accepted}
            onClick={() => {
              setAccepted(true);
              notify("내 동의를 기록했어요. 상대방 동의 대기 상태입니다.");
            }}
          >
            <Check size={17} />
            {accepted ? "동의 완료" : "내용 확인 및 동의"}
          </button>
        </section>
      ) : (
        <section className="panel">
          <div className="section-heading">
            <h2>함께 나누는 파일</h2>
            <label className="btn primary upload-label">
              <Paperclip size={17} />
              파일 추가
              <input type="file" onChange={attach} />
            </label>
          </div>
          <p className="muted small">
            파일당 2MB · 전체 3MB 이하 · 이 브라우저에서만 저장
          </p>
          {files.length ? (
            files.map((f) => (
              <div className="file-row" key={f.id}>
                <FileText size={23} />
                <div>
                  <b>{f.name}</b>
                  <small>{(f.size / 1024).toFixed(1)} KB</small>
                </div>
                <a
                  className="icon-button"
                  href={f.data}
                  download={f.name}
                  aria-label={`${f.name} 다운로드`}
                >
                  <Download size={19} />
                </a>
              </div>
            ))
          ) : (
            <div className="empty">
              <FileText size={35} />
              <h3>아직 공유한 파일이 없어요</h3>
              <p>기획서나 작업 자료를 추가해 보세요.</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
