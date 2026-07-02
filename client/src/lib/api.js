/* Tiny API client: JWT in localStorage, JSON in/out */
const TOKEN_KEY = "tunnelcraft:token";

export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function setToken(t) { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); }

async function req(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  const tok = getToken();
  if (tok) headers.Authorization = "Bearer " + tok;
  const res = await fetch("/api" + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || res.statusText || "request failed");
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  providers: () => req("/auth/providers"),
  register: (email, password, displayName) => req("/auth/register", { method: "POST", body: { email, password, displayName } }),
  login: (email, password) => req("/auth/login", { method: "POST", body: { email, password } }),
  me: () => req("/me"),
  logout: () => req("/auth/logout", { method: "POST" }),
  logoutAll: () => req("/auth/logout-all", { method: "POST" }),
  sessions: () => req("/auth/sessions"),
  revokeSession: (handle) => req("/auth/sessions/" + handle, { method: "DELETE" }),
  changePassword: (currentPassword, newPassword) => req("/auth/change-password", { method: "POST", body: { currentPassword, newPassword } }),
  verifyEmail: (token) => req("/auth/verify-email", { method: "POST", body: { token } }),
  resendVerification: () => req("/auth/resend-verification", { method: "POST" }),
  forgotPassword: (email) => req("/auth/forgot-password", { method: "POST", body: { email } }),
  resetPassword: (token, newPassword) => req("/auth/reset-password", { method: "POST", body: { token, newPassword } }),
  deleteAccount: (password) => req("/account", { method: "DELETE", body: { password, confirm: "DELETE" } }),
  getProgress: () => req("/progress"),
  putProgress: (data) => req("/progress", { method: "PUT", body: { data } }),
};

/* ---------- progress model helpers ---------- */
export const EMPTY_PROGRESS = { les: {}, quiz: {}, ex: {}, cap: {}, rev: {}, notes: {}, marks: {}, meta: {} };

export function mergeProgress(a, b) {
  const out = { les: {}, quiz: {}, ex: {}, cap: {}, rev: {}, notes: {}, marks: {}, meta: {} };
  for (const k of ["les", "ex", "cap", "marks"]) {
    Object.assign(out[k], (a && a[k]) || {}, (b && b[k]) || {});
  }
  const qa = (a && a.quiz) || {}, qb = (b && b.quiz) || {};
  for (const id of new Set([...Object.keys(qa), ...Object.keys(qb)])) {
    out.quiz[id] = Math.max(qa[id] || 0, qb[id] || 0);
  }
  // review cards: keep the more-demanding card (lower box; tie → earlier due, more misses)
  const ra = (a && a.rev) || {}, rb = (b && b.rev) || {};
  for (const k of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
    const x = ra[k], y = rb[k];
    out.rev[k] = !x ? y : !y ? x
      : x.box !== y.box ? (x.box < y.box ? x : y)
      : { box: x.box, due: Math.min(x.due, y.due), misses: Math.max(x.misses || 0, y.misses || 0) };
  }
  // notes: newest edit wins per lesson
  const na = (a && a.notes) || {}, nb = (b && b.notes) || {};
  for (const k of new Set([...Object.keys(na), ...Object.keys(nb)])) {
    const x = na[k], y = nb[k];
    out.notes[k] = !x ? y : !y ? x : (x.t || 0) >= (y.t || 0) ? x : y;
  }
  // meta: field-wise maxima / latest
  const ma = (a && a.meta) || {}, mb = (b && b.meta) || {};
  out.meta = {
    streak: Math.max(ma.streak || 0, mb.streak || 0),
    bestStreak: Math.max(ma.bestStreak || 0, mb.bestStreak || 0),
    lastDay: (ma.lastDay || "") > (mb.lastDay || "") ? ma.lastDay : mb.lastDay,
    last: (ma.lastT || 0) >= (mb.lastT || 0) ? ma.last : mb.last,
    lastT: Math.max(ma.lastT || 0, mb.lastT || 0),
    finals: Object.assign({}, ma.finals || {}, mb.finals || {}),
  };
  for (const [k, v] of Object.entries(Object.assign({}, ma.finals || {}, mb.finals || {}))) {
    out.meta.finals[k] = Math.max(ma.finals && ma.finals[k] || 0, mb.finals && mb.finals[k] || 0, v);
  }
  return out;
}

const GUEST_KEY = "tunnelcraft:v2:progress";
export function loadLocal() {
  try { return { ...EMPTY_PROGRESS, ...(JSON.parse(localStorage.getItem(GUEST_KEY)) || {}) }; }
  catch { return { ...EMPTY_PROGRESS }; }
}
export function saveLocal(p) {
  try { localStorage.setItem(GUEST_KEY, JSON.stringify(p)); } catch { /* full/blocked */ }
}
