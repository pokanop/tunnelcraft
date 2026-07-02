/* Tiny API client: JWT in localStorage, JSON in/out */
import { emptyProgress } from "./progress";
import type { Note, Progress, ProgressMeta, ReviewCard } from "./progress";

const TOKEN_KEY = "tunnelcraft:token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string | null): void {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

/** Thrown for any non-2xx response; `status` carries the HTTP status code. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/* ---------- response shapes ---------- */
export interface PublicUser {
  id: number;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
}
export interface AuthResponse {
  token: string;
  user: PublicUser;
}
export interface MeResponse {
  user: PublicUser;
}
export interface ProvidersResponse {
  providers: string[];
}
export interface SessionInfo {
  handle: string;
  device: string;
  userAgent: string;
  current: boolean;
  lastSeen: string;
  createdAt: string;
}
export interface SessionsResponse {
  sessions: SessionInfo[];
}
export interface MessageResponse {
  message?: string;
}
export interface ProgressResponse {
  data: Progress | null;
  updatedAt: string | null;
}

async function req<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const { method = "GET", body } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const tok = getToken();
  if (tok) headers["Authorization"] = "Bearer " + tok;
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch("/api" + path, init);
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    let msg = res.statusText || "request failed";
    if (
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof data.error === "string" &&
      data.error
    ) {
      msg = data.error;
    }
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export const api = {
  providers: () => req<ProvidersResponse>("/auth/providers"),
  register: (email: string, password: string, displayName: string) =>
    req<AuthResponse>("/auth/register", { method: "POST", body: { email, password, displayName } }),
  login: (email: string, password: string) =>
    req<AuthResponse>("/auth/login", { method: "POST", body: { email, password } }),
  me: () => req<MeResponse>("/me"),
  logout: () => req<unknown>("/auth/logout", { method: "POST" }),
  logoutAll: () => req<unknown>("/auth/logout-all", { method: "POST" }),
  sessions: () => req<SessionsResponse>("/auth/sessions"),
  revokeSession: (handle: string) => req<unknown>("/auth/sessions/" + handle, { method: "DELETE" }),
  changePassword: (currentPassword: string, newPassword: string) =>
    req<unknown>("/auth/change-password", {
      method: "POST",
      body: { currentPassword, newPassword },
    }),
  verifyEmail: (token: string) =>
    req<unknown>("/auth/verify-email", { method: "POST", body: { token } }),
  resendVerification: () => req<MessageResponse>("/auth/resend-verification", { method: "POST" }),
  forgotPassword: (email: string) =>
    req<unknown>("/auth/forgot-password", { method: "POST", body: { email } }),
  resetPassword: (token: string | null, newPassword: string) =>
    req<unknown>("/auth/reset-password", { method: "POST", body: { token, newPassword } }),
  deleteAccount: (password: string) =>
    req<unknown>("/account", { method: "DELETE", body: { password, confirm: "DELETE" } }),
  getProgress: () => req<ProgressResponse>("/progress"),
  putProgress: (data: Progress) => req<unknown>("/progress", { method: "PUT", body: { data } }),
};

/* ---------- progress model helpers ---------- */
export const EMPTY_PROGRESS: Progress = emptyProgress();

export function mergeProgress(
  a: Partial<Progress> | null | undefined,
  b: Partial<Progress> | null | undefined
): Progress {
  const out = emptyProgress();
  for (const k of ["les", "ex", "cap", "marks"] as const) {
    Object.assign(out[k], a?.[k] ?? {}, b?.[k] ?? {});
  }
  const qa = a?.quiz ?? {};
  const qb = b?.quiz ?? {};
  for (const id of new Set([...Object.keys(qa), ...Object.keys(qb)])) {
    out.quiz[id] = Math.max(qa[id] ?? 0, qb[id] ?? 0);
  }
  // review cards: keep the more-demanding card (lower box; tie → earlier due, more misses)
  const ra = a?.rev ?? {};
  const rb = b?.rev ?? {};
  for (const k of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
    const x = ra[k];
    const y = rb[k];
    const merged: ReviewCard | undefined = !x
      ? y
      : !y
        ? x
        : x.box !== y.box
          ? x.box < y.box
            ? x
            : y
          : {
              box: x.box,
              due: Math.min(x.due, y.due),
              misses: Math.max(x.misses || 0, y.misses || 0),
            };
    if (merged) out.rev[k] = merged;
  }
  // notes: newest edit wins per lesson
  const na = a?.notes ?? {};
  const nb = b?.notes ?? {};
  for (const k of new Set([...Object.keys(na), ...Object.keys(nb)])) {
    const x = na[k];
    const y = nb[k];
    const merged: Note | undefined = !x ? y : !y ? x : (x.t || 0) >= (y.t || 0) ? x : y;
    if (merged) out.notes[k] = merged;
  }
  // meta: field-wise maxima / latest
  const ma = a?.meta ?? {};
  const mb = b?.meta ?? {};
  const finals: Record<string, number> = { ...ma.finals, ...mb.finals };
  for (const [k, v] of Object.entries(finals)) {
    finals[k] = Math.max(ma.finals?.[k] ?? 0, mb.finals?.[k] ?? 0, v);
  }
  const meta: ProgressMeta = {
    streak: Math.max(ma.streak ?? 0, mb.streak ?? 0),
    bestStreak: Math.max(ma.bestStreak ?? 0, mb.bestStreak ?? 0),
    lastT: Math.max(ma.lastT ?? 0, mb.lastT ?? 0),
    finals,
  };
  const lastDay = (ma.lastDay ?? "") > (mb.lastDay ?? "") ? ma.lastDay : mb.lastDay;
  if (lastDay !== undefined) meta.lastDay = lastDay;
  const last = (ma.lastT ?? 0) >= (mb.lastT ?? 0) ? ma.last : mb.last;
  if (last !== undefined) meta.last = last;
  out.meta = meta;
  return out;
}

const GUEST_KEY = "tunnelcraft:v2:progress";
export function loadLocal(): Progress {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    // We only ever store our own serialized Progress blob under this key.
    const parsed = raw === null ? null : (JSON.parse(raw) as Partial<Progress> | null);
    return { ...EMPTY_PROGRESS, ...parsed };
  } catch {
    return { ...EMPTY_PROGRESS };
  }
}
export function saveLocal(p: Progress): void {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(p));
  } catch {
    /* full/blocked */
  }
}
