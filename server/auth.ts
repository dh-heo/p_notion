import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHmac,
} from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { db } from "./db.js";

const COOKIE = "pnotion_session";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30일

// ----- 비밀번호 해시 (scrypt, 외부 의존성 없음) -----
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const hash = Buffer.from(hashHex, "hex");
  const test = scryptSync(password, Buffer.from(saltHex, "hex"), hash.length);
  return hash.length === test.length && timingSafeEqual(hash, test);
}

// ----- 세션 토큰: 서버 시크릿으로 HMAC 서명한 무상태 토큰 (재시작에도 유지) -----
function getSecret(): string {
  const row = db
    .prepare("SELECT value FROM meta WHERE key = 'auth_secret'")
    .get() as { value: string } | undefined;
  if (row) return row.value;
  const secret = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO meta (key, value) VALUES ('auth_secret', ?)").run(
    secret
  );
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

function makeToken(): string {
  const exp = String(Date.now() + MAX_AGE_MS);
  return `${exp}.${sign(exp)}`;
}

function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(exp));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  return Number(exp) > Date.now();
}

// ----- 쿠키 -----
function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name)
      return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

export function setSessionCookie(res: Response) {
  res.cookie(COOKIE, makeToken(), {
    httpOnly: true,
    sameSite: "lax",
    // HTTPS 환경(프로덕션)에서 COOKIE_SECURE=true 로 활성화. 기본은 로컬 http 용 false.
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: MAX_AGE_MS,
    path: "/",
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE, { path: "/" });
}

export function isAuthed(req: Request): boolean {
  return verifyToken(readCookie(req, COOKIE));
}

// ----- API 토큰 (자동화/에이전트용): 환경변수 PNOTION_API_TOKEN과 일치하면 통과 -----
function hasValidApiToken(req: Request): boolean {
  const expected = process.env.PNOTION_API_TOKEN;
  if (!expected) return false;
  const header = req.headers.authorization;
  if (!header) return false;
  const got = header.replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ----- 미들웨어: 미인증이면 401 (세션 쿠키 또는 Bearer API 토큰) -----
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (isAuthed(req) || hasValidApiToken(req)) {
    next();
    return;
  }
  res.status(401).json({ error: "unauthorized" });
}
