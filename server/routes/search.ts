import { Router } from "express";
import { db, WORKSPACE_ID } from "../db.js";

export const search = Router();

// HTML 태그 제거 + 기본 엔티티 복원 (서버엔 DOM이 없어 정규식으로 처리)
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// 블록 content(JSON 파싱본)에서 검색/스니펫용 평문을 뽑는다
function blockText(type: string, content: unknown): string {
  const c = content as Record<string, unknown>;
  if (typeof c?.html === "string") return stripHtml(c.html);
  if (type === "code" && typeof c?.code === "string") return c.code;
  if (type === "table" && Array.isArray(c?.cells)) {
    return (c.cells as string[][])
      .flat()
      .map((v) => stripHtml(String(v ?? "")))
      .join(" ");
  }
  if (type === "image" && typeof c?.caption === "string") return c.caption;
  if (type === "file" && typeof c?.name === "string") return c.name;
  if (type === "youtube" && typeof c?.url === "string") return c.url;
  return "";
}

// q 주변을 잘라 스니펫 생성
function snippet(text: string, q: string): string {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text.slice(0, 80);
  const start = Math.max(0, i - 30);
  const end = Math.min(text.length, i + q.length + 50);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

interface PageHit {
  pageId: string;
  title: string;
  icon: string | null;
  snippet: string;
}

// GET /api/search?q=... → 페이지 단위로 묶은 결과 (제목 우선, 없으면 본문 스니펫)
search.get("/search", (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) {
    res.json([]);
    return;
  }
  const like = `%${q}%`;
  const byPage = new Map<string, PageHit>();

  // 1) 제목 매치
  const titleRows = db
    .prepare(
      `SELECT id, title, icon FROM page
       WHERE workspace_id = ? AND deleted_at IS NULL AND title LIKE ? COLLATE NOCASE
       ORDER BY updated_at DESC`
    )
    .all(WORKSPACE_ID, like) as { id: string; title: string; icon: string | null }[];
  for (const p of titleRows) {
    byPage.set(p.id, { pageId: p.id, title: p.title, icon: p.icon, snippet: "" });
  }

  // 2) 본문(블록) 매치 — content LIKE로 후보를 좁힌 뒤 평문에서 재확인
  const blockRows = db
    .prepare(
      `SELECT b.page_id AS pageId, b.type AS type, b.content AS content,
              p.title AS title, p.icon AS icon, b.updated_at AS updated_at
       FROM block b JOIN page p ON p.id = b.page_id
       WHERE p.workspace_id = ? AND p.deleted_at IS NULL AND b.content LIKE ? COLLATE NOCASE
       ORDER BY b.updated_at DESC`
    )
    .all(WORKSPACE_ID, like) as {
    pageId: string;
    type: string;
    content: string;
    title: string;
    icon: string | null;
  }[];

  for (const row of blockRows) {
    let text = "";
    try {
      text = blockText(row.type, JSON.parse(row.content));
    } catch {
      continue;
    }
    if (!text.toLowerCase().includes(q.toLowerCase())) continue; // 태그 안에서만 매치된 경우 제외
    const existing = byPage.get(row.pageId);
    if (existing) {
      if (!existing.snippet) existing.snippet = snippet(text, q);
    } else {
      byPage.set(row.pageId, {
        pageId: row.pageId,
        title: row.title,
        icon: row.icon,
        snippet: snippet(text, q),
      });
    }
  }

  res.json([...byPage.values()].slice(0, 30));
});

// GET /api/pages/:id/backlinks → 이 페이지를 멘션( <a data-page-id="ID"> )한 블록들을 소스 페이지별로
search.get("/pages/:id/backlinks", (req, res) => {
  const { id } = req.params;
  // content는 JSON 문자열이라 따옴표가 이스케이프됨 → 일단 id로 후보를 좁히고 파싱 후 정확히 확인
  const rows = db
    .prepare(
      `SELECT b.page_id AS pageId, b.type AS type, b.content AS content,
              p.title AS title, p.icon AS icon
       FROM block b JOIN page p ON p.id = b.page_id
       WHERE p.workspace_id = ? AND p.deleted_at IS NULL
         AND b.page_id != ? AND b.content LIKE ?
       ORDER BY b.updated_at DESC`
    )
    .all(WORKSPACE_ID, id, `%${id}%`) as {
    pageId: string;
    type: string;
    content: string;
    title: string;
    icon: string | null;
  }[];

  const needle = `data-page-id="${id}"`;
  const byPage = new Map<string, PageHit>();
  for (const row of rows) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.content);
    } catch {
      continue;
    }
    const c = parsed as Record<string, unknown>;
    const htmls: string[] = [];
    if (typeof c?.html === "string") htmls.push(c.html);
    if (Array.isArray(c?.cells))
      for (const v of (c.cells as string[][]).flat()) htmls.push(String(v ?? ""));
    if (!htmls.some((h) => h.includes(needle))) continue; // 실제 멘션 앵커가 있는지 확인

    if (!byPage.has(row.pageId)) {
      const text = blockText(row.type, parsed);
      byPage.set(row.pageId, {
        pageId: row.pageId,
        title: row.title,
        icon: row.icon,
        snippet: text.length > 120 ? text.slice(0, 120) + "…" : text,
      });
    }
  }
  res.json([...byPage.values()]);
});
