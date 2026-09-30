// Frontend-only demo. These records are not a trusted authentication boundary.
const ACCOUNT_KEY = "bu-gig:demo-accounts";
const SESSION_KEY = "bu-gig:demo-session";
const REMEMBER_KEY = "bu-gig:demo-remembered-session";
const normalizeEmail = (email) => email.trim().toLowerCase();
function accounts() {
  const records = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || "[]");
  if (!Array.isArray(records))
    throw new Error("데모 계정 저장소를 읽을 수 없습니다.");
  return records;
}
const publicUser = ({ id, name, email }) => ({
  id,
  name,
  email,
  verified: false,
});
async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new Uint8Array(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return Array.from(new Uint8Array(bits), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export function currentDemoUser() {
  try {
    const remembered = JSON.parse(localStorage.getItem(REMEMBER_KEY) || "null");
    const id =
      sessionStorage.getItem(SESSION_KEY) ||
      (remembered?.expiresAt > Date.now() ? remembered.id : null);
    const account = accounts().find((item) => item.id === id);
    return account ? publicUser(account) : null;
  } catch {
    return null;
  }
}
export async function registerDemo({ name, email, password }) {
  email = normalizeEmail(email);
  name = name.trim();
  if (name.length < 2 || name.length > 20)
    throw new Error("이름은 2~20자로 입력해 주세요.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("이메일 형식을 확인해 주세요.");
  if (password.length < 8 || password.length > 128)
    throw new Error("비밀번호는 8~128자로 입력해 주세요.");
  if (accounts().some((item) => item.email === email))
    throw new Error("이미 가입된 이메일입니다. 로그인해 주세요.");
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await passwordHash(password, salt);
  const latest = accounts();
  if (latest.some((item) => item.email === email))
    throw new Error("이미 가입된 이메일입니다.");
  const user = { id: crypto.randomUUID(), name, email, salt, hash };
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify([...latest, user]));
  return publicUser(user);
}
export async function loginDemo(email, password, remember = false) {
  const account = accounts().find(
    (item) => item.email === normalizeEmail(email),
  );
  if (!account || (await passwordHash(password, account.salt)) !== account.hash)
    throw new Error("이메일 또는 비밀번호를 확인해 주세요.");
  sessionStorage.setItem(SESSION_KEY, account.id);
  if (remember)
    localStorage.setItem(
      REMEMBER_KEY,
      JSON.stringify({ id: account.id, expiresAt: Date.now() + 7 * 86400000 }),
    );
  else localStorage.removeItem(REMEMBER_KEY);
  return publicUser(account);
}
export function logoutDemo() {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(REMEMBER_KEY);
}
