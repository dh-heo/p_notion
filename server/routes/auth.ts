import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import {
  hashPassword,
  verifyPassword,
  setSessionCookie,
  clearSessionCookie,
  isAuthed,
} from "../auth.js";

export const auth = Router();

interface UserRow {
  id: string;
  password_hash: string;
  created_at: number;
}

const getUser = () =>
  db.prepare("SELECT * FROM app_user LIMIT 1").get() as UserRow | undefined;

// 인증 상태 + 최초 설정 필요 여부
auth.get("/status", (req, res) => {
  const user = getUser();
  res.json({ authenticated: !!user && isAuthed(req), needsSetup: !user });
});

// 최초 1회: 비밀번호 설정 (이미 있으면 거부)
auth.post("/setup", (req, res) => {
  if (getUser()) {
    res.status(409).json({ error: "already set up" });
    return;
  }
  const { password } = req.body ?? {};
  if (typeof password !== "string" || password.length < 4) {
    res.status(400).json({ error: "password too short" });
    return;
  }
  db.prepare(
    "INSERT INTO app_user (id, password_hash, created_at) VALUES (?, ?, ?)"
  ).run(randomUUID(), hashPassword(password), Date.now());
  setSessionCookie(res);
  res.status(201).json({ ok: true });
});

auth.post("/login", (req, res) => {
  const user = getUser();
  if (!user) {
    res.status(400).json({ error: "needs setup", needsSetup: true });
    return;
  }
  const { password } = req.body ?? {};
  if (
    typeof password !== "string" ||
    !verifyPassword(password, user.password_hash)
  ) {
    res.status(401).json({ error: "invalid password" });
    return;
  }
  setSessionCookie(res);
  res.json({ ok: true });
});

auth.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});
