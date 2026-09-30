import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Eye,
  EyeOff,
  ShieldCheck,
  UserRound,
  LockKeyhole,
} from "lucide-react";
import { useApp } from "./store";
import { registerDemo } from "./auth";
import { asset } from "./data";
import "./auth.css";

export function AuthHeader() {
  return (
    <header className="auth-header">
      <Link className="brand" to="/" aria-label="백석대학교 긱창업 홈">
        <img src={asset("brand/logo-mark")} alt="" />
        <span>
          백석대학교 <b>긱창업</b>
        </span>
      </Link>
    </header>
  );
}
export function AuthFooter() {
  const { notify } = useApp();
  return (
    <footer className="auth-footer">
      <nav aria-label="인증 페이지 안내">
        <button
          onClick={() =>
            notify(
              "정식 이용약관은 운영 전 제공 예정입니다. 현재는 데모 서비스입니다.",
            )
          }
        >
          이용약관
        </button>
        <span aria-hidden="true">|</span>
        <button
          onClick={() =>
            notify(
              "데모 계정은 이 브라우저에만 저장됩니다. 정식 개인정보 처리방침은 운영 전 제공 예정입니다.",
            )
          }
        >
          개인정보처리방침
        </button>
        <span aria-hidden="true">|</span>
        <Link to="/guide">이용안내</Link>
      </nav>
      <small>© 2026 백석대학교 긱창업. All rights reserved.</small>
    </footer>
  );
}

export default function AuthPage({ mode = "login" }) {
  const signup = mode === "signup";
  const reset = mode === "reset";
  const { user, login, logout } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [socialNotice, setSocialNotice] = useState("");
  const title = reset
    ? "비밀번호를 잊으셨나요?"
    : signup
      ? "회원가입"
      : "로그인";
  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    setBusy(true);
    try {
      if (signup) {
        if (form.get("password") !== form.get("confirm"))
          throw new Error("비밀번호가 서로 일치하지 않습니다.");
        if (!form.get("terms") || !form.get("privacy"))
          throw new Error("필수 안내에 동의해 주세요.");
        await registerDemo({
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
        });
        setSuccess(
          "데모 회원가입이 완료되었습니다. 입력한 이메일과 비밀번호로 로그인해 주세요.",
        );
      } else {
        await login(
          form.get("email"),
          form.get("password"),
          form.get("remember") === "on",
        );
        const next = params.get("next");
        const allowed = ["/my", "/saved", "/request/new", "/workroom"];
        navigate(allowed.includes(next) ? next : "/my", { replace: true });
      }
    } catch (err) {
      setError(
        err.name === "Error"
          ? err.message
          : "브라우저 저장소를 사용할 수 없습니다. 저장 설정을 확인해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={`auth-page ${signup ? "auth-signup" : ""}`}>
      <div className="auth-motto" aria-hidden="true">
        함께 만드는
        <br />
        <span>더 큰 가능성</span>
        <i />
      </div>
      <div className="auth-card">
        <h1>{title}</h1>
        <p className="muted">
          {signup
            ? "하나의 계정으로 일도 찾고, 의뢰도 등록하세요."
            : reset
              ? "계정 복구 기능을 안내해 드립니다."
              : "같은 학교의 재능과 기회를 연결합니다."}
        </p>
        {reset ? (
          <div className="auth-result">
            <h2>아직 이메일을 보낼 수 없어요</h2>
            <p>
              비밀번호 재설정은 본인 확인과 메일 서버 연결이 필요합니다. 현재
              데모에서는 재설정 메일을 발송하거나 비밀번호를 변경하지 않습니다.
            </p>
            <Link className="btn primary" to="/login">
              로그인으로 돌아가기
            </Link>
          </div>
        ) : success ? (
          <div className="auth-result" role="status">
            <ShieldCheck size={32} />
            <h2>가입이 완료되었어요</h2>
            <p>{success}</p>
            <p>학교 인증 상태: 미인증</p>
            <Link className="btn primary" to="/login">
              로그인하기 <ArrowRight size={17} />
            </Link>
          </div>
        ) : user ? (
          <div className="auth-result">
            <h2>{user.name}님, 로그인되어 있어요</h2>
            <Link className="btn primary" to="/my">
              마이페이지로 이동
            </Link>
            <button className="btn" onClick={logout}>
              로그아웃
            </button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            {signup && (
              <label>
                이름
                <input
                  name="name"
                  autoComplete="nickname"
                  placeholder="사용할 이름을 입력해 주세요"
                  required
                  minLength={2}
                  maxLength={20}
                />
              </label>
            )}
            <label>
              이메일
              <div className="auth-input-icon">
                <UserRound size={20} aria-hidden="true" />
                <input
                  type="email"
                  name="email"
                  autoComplete="username"
                  placeholder="이메일을 입력하세요."
                  required
                  maxLength={254}
                />
              </div>
            </label>
            <label>
              비밀번호
              <div className="auth-password">
                <LockKeyhole size={20} aria-hidden="true" />
                <input
                  type={show ? "text" : "password"}
                  name="password"
                  autoComplete={signup ? "new-password" : "current-password"}
                  placeholder={
                    signup ? "8자 이상 입력해 주세요" : "비밀번호를 입력하세요."
                  }
                  required
                  minLength={8}
                  maxLength={128}
                />
                <button
                  type="button"
                  aria-label={show ? "비밀번호 숨기기" : "비밀번호 보기"}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
            </label>
            {signup && (
              <label>
                비밀번호 확인
                <input
                  type={show ? "text" : "password"}
                  name="confirm"
                  autoComplete="new-password"
                  placeholder="비밀번호를 한 번 더 입력해 주세요"
                  required
                  minLength={8}
                  maxLength={128}
                />
              </label>
            )}
            {signup ? (
              <div className="auth-consents">
                <label>
                  <input type="checkbox" name="terms" required /> [필수] 데모
                  이용 안내에 동의합니다
                </label>
                <details>
                  <summary>데모 이용 안내 보기</summary>
                  <p>
                    시연용 계정이며 실제 거래·학교 인증·운영 서비스 가입이
                    아닙니다. 운영 전 정식 이용약관을 별도로 제공해야 합니다.
                  </p>
                </details>
                <label>
                  <input type="checkbox" name="privacy" required /> [필수]
                  브라우저 내 계정 저장에 동의합니다
                </label>
                <details>
                  <summary>저장 항목 및 범위 보기</summary>
                  <p>
                    이름, 이메일, 비밀번호의 솔트·파생 해시가 현재 브라우저에
                    저장됩니다. 서버로 전송하지 않으며 브라우저 사이트 데이터
                    삭제 시 지워집니다. 실제 개인정보를 사용하지 마세요.
                  </p>
                </details>
              </div>
            ) : (
              <div className="auth-options">
                <label>
                  <input type="checkbox" name="remember" /> 로그인 상태 유지
                </label>
                <Link className="auth-forgot" to="/password-reset">
                  비밀번호 찾기
                </Link>
              </div>
            )}
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            <button className="btn primary auth-submit" disabled={busy}>
              {busy ? "처리 중…" : signup ? "회원가입" : "로그인"}
              <ArrowRight size={18} />
            </button>
            <div className="auth-divider">
              <span>또는</span>
            </div>
            <div className="auth-social">
              <button
                type="button"
                className="social-button kakao"
                aria-label="카카오 로그인"
                aria-describedby="social-connection-note"
                onClick={() =>
                  setSocialNotice(
                    "카카오 로그인은 아직 연결되지 않았습니다. 앱 등록 및 서버 OAuth 연동 후 이용할 수 있습니다.",
                  )
                }
              >
                <img src="/brand/kakao-login.svg" alt="" />
              </button>
              <button
                type="button"
                className="social-button naver"
                aria-label="네이버 로그인"
                aria-describedby="social-connection-note"
                onClick={() =>
                  setSocialNotice(
                    "네이버 로그인은 아직 연결되지 않았습니다. 앱 등록 및 서버 OAuth 연동 후 이용할 수 있습니다.",
                  )
                }
              >
                <img src="/brand/naver-login.png" alt="" />
              </button>
              <small id="social-connection-note">
                소셜 로그인은 연동 준비 중입니다.
              </small>
              {socialNotice && (
                <p className="auth-social-notice" role="status">
                  {socialNotice}
                </p>
              )}
            </div>
            <p className="auth-switch">
              {signup ? "이미 계정이 있으신가요?" : "아직 계정이 없으신가요?"}{" "}
              <Link to={signup ? "/login" : "/signup"}>
                {signup ? "로그인" : "회원가입"}
                <ArrowRight size={16} />
              </Link>
            </p>
          </form>
        )}
        <div className="auth-school-note">
          <ShieldCheck size={28} />
          <p>
            학교 구성원 인증으로 더욱 믿을 수 있는 연결.
            <br />
            회원가입과 학교 인증은 별도로 진행됩니다.
          </p>
        </div>
        <details className="auth-demo-note">
          <summary>프론트엔드 데모 · 실제 개인정보 입력 금지</summary>
          <p>
            다른 서비스의 비밀번호를 사용하지 마세요. 계정은 이 브라우저에만
            저장되며 서버 인증·학교 인증을 제공하지 않습니다. 로그인 상태 유지는
            이 기기에서 7일간 적용되는 데모입니다. 프로젝트·찜은 계정별로
            분리되지 않는 공용 시연 데이터입니다.
          </p>
        </details>
      </div>
    </section>
  );
}
