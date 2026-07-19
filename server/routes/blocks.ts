import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";

export const blocks = Router();

interface BlockRow {
  id: string;
  page_id: string;
  parent_block_id: string | null;
  type: string;
  content: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

// 블록이 바뀌면 소속 페이지의 updated_at도 갱신 ("최근 편집" 정렬용)
function touchPage(pageId: string, now: number) {
  db.prepare("UPDATE page SET updated_at = ? WHERE id = ?").run(now, pageId);
}

// 한 페이지의 모든 블록 (정렬 순)
blocks.get("/pages/:pageId/blocks", (req, res) => {
  const rows = db
    .prepare(
      "SELECT * FROM block WHERE page_id = ? ORDER BY sort_order ASC"
    )
    .all(req.params.pageId) as BlockRow[];
  res.json(rows.map((r) => ({ ...r, content: JSON.parse(r.content) })));
});

// 블록 생성. sort_order를 직접 지정하거나(분수 인덱싱) 끝에 추가.
blocks.post("/blocks", (req, res) => {
  const {
    page_id,
    parent_block_id = null,
    type = "paragraph",
    content = {},
    sort_order,
  } = req.body ?? {};

  if (!page_id) {
    res.status(400).json({ error: "page_id required" });
    return;
  }

  let order = sort_order;
  if (order === undefined || order === null) {
    const max = db
      .prepare(
        `SELECT MAX(sort_order) AS m FROM block
         WHERE page_id = ? AND parent_block_id IS ?`
      )
      .get(page_id, parent_block_id) as { m: number | null };
    order = (max.m ?? 0) + 1;
  }

  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO block (id, page_id, parent_block_id, type, content, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    page_id,
    parent_block_id,
    type,
    JSON.stringify(content),
    order,
    now,
    now
  );
  touchPage(page_id, now);

  const row = db.prepare("SELECT * FROM block WHERE id = ?").get(id) as BlockRow;
  res.status(201).json({ ...row, content: JSON.parse(row.content) });
});

// 블록 수정 (type, content)
blocks.patch("/blocks/:id", (req, res) => {
  const { id } = req.params;
  const fields: string[] = [];
  const values: unknown[] = [];

  if ("type" in (req.body ?? {})) {
    fields.push("type = ?");
    values.push(req.body.type);
  }
  if ("content" in (req.body ?? {})) {
    fields.push("content = ?");
    values.push(JSON.stringify(req.body.content));
  }
  if (fields.length === 0) {
    res.status(400).json({ error: "no updatable fields" });
    return;
  }
  const now = Date.now();
  fields.push("updated_at = ?");
  values.push(now, id);

  db.prepare(`UPDATE block SET ${fields.join(", ")} WHERE id = ?`).run(
    ...values
  );
  const row = db.prepare("SELECT * FROM block WHERE id = ?").get(id) as BlockRow;
  touchPage(row.page_id, now);
  res.json({ ...row, content: JSON.parse(row.content) });
});

// 블록 삭제
blocks.delete("/blocks/:id", (req, res) => {
  const row = db
    .prepare("SELECT page_id FROM block WHERE id = ?")
    .get(req.params.id) as { page_id: string } | undefined;
  db.prepare("DELETE FROM block WHERE id = ?").run(req.params.id);
  if (row) touchPage(row.page_id, Date.now());
  res.status(204).end();
});

// 일괄 재정렬: 블록 또는 페이지의 sort_order / 부모 갱신
blocks.patch("/reorder", (req, res) => {
  const { kind, items } = req.body ?? {};
  if (kind !== "block" && kind !== "page") {
    res.status(400).json({ error: "kind must be 'block' or 'page'" });
    return;
  }
  const items_ = (items ?? []) as Array<{
    id: string;
    sort_order: number;
    parent_id?: string | null;
  }>;

  const now = Date.now();
  const tx = db.transaction(() => {
    for (const it of items_) {
      if (kind === "block") {
        if ("parent_id" in it) {
          db.prepare(
            "UPDATE block SET sort_order = ?, parent_block_id = ?, updated_at = ? WHERE id = ?"
          ).run(it.sort_order, it.parent_id ?? null, now, it.id);
        } else {
          db.prepare(
            "UPDATE block SET sort_order = ?, updated_at = ? WHERE id = ?"
          ).run(it.sort_order, now, it.id);
        }
      } else {
        if ("parent_id" in it) {
          db.prepare(
            "UPDATE page SET sort_order = ?, parent_page_id = ?, updated_at = ? WHERE id = ?"
          ).run(it.sort_order, it.parent_id ?? null, now, it.id);
        } else {
          db.prepare(
            "UPDATE page SET sort_order = ?, updated_at = ? WHERE id = ?"
          ).run(it.sort_order, now, it.id);
        }
      }
    }
  });
  tx();
  res.status(204).end();
});
