import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db, WORKSPACE_ID } from "../db.js";

export const pages = Router();

interface PageRow {
  id: string;
  workspace_id: string;
  parent_page_id: string | null;
  title: string;
  icon: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

// 전체 페이지 트리 (플랫 리스트로 반환, 트리는 클라이언트에서 구성)
pages.get("/tree", (_req, res) => {
  const rows = db
    .prepare(
      "SELECT * FROM page WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC"
    )
    .all(WORKSPACE_ID) as PageRow[];
  res.json(rows);
});

// 휴지통 목록 (삭제된 서브트리의 최상위만, 최근 삭제순)
pages.get("/trash", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT * FROM page
       WHERE workspace_id = ? AND deleted_at IS NOT NULL
         AND (parent_page_id IS NULL
              OR parent_page_id NOT IN (SELECT id FROM page WHERE deleted_at IS NOT NULL))
       ORDER BY deleted_at DESC`
    )
    .all(WORKSPACE_ID) as PageRow[];
  res.json(rows);
});

// 한 페이지와 그 하위 전체의 id (재귀)
function subtreeIds(id: string): string[] {
  const rows = db
    .prepare(
      `WITH RECURSIVE sub(id) AS (
         SELECT id FROM page WHERE id = ?
         UNION ALL
         SELECT p.id FROM page p JOIN sub ON p.parent_page_id = sub.id
       )
       SELECT id FROM sub`
    )
    .all(id) as { id: string }[];
  return rows.map((r) => r.id);
}

// 페이지 생성
pages.post("/pages", (req, res) => {
  const { parent_page_id = null, title = "" } = req.body ?? {};
  const id = randomUUID();
  const now = Date.now();

  const max = db
    .prepare(
      `SELECT MAX(sort_order) AS m FROM page
       WHERE workspace_id = ? AND parent_page_id IS ?`
    )
    .get(WORKSPACE_ID, parent_page_id) as { m: number | null };
  const sort_order = (max.m ?? 0) + 1;

  db.prepare(
    `INSERT INTO page (id, workspace_id, parent_page_id, title, icon, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`
  ).run(id, WORKSPACE_ID, parent_page_id, title, sort_order, now, now);

  const row = db.prepare("SELECT * FROM page WHERE id = ?").get(id);
  res.status(201).json(row);
});

// 페이지 수정 (title, icon)
pages.patch("/pages/:id", (req, res) => {
  const { id } = req.params;
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const key of ["title", "icon", "cover"] as const) {
    if (key in (req.body ?? {})) {
      fields.push(`${key} = ?`);
      values.push(req.body[key]);
    }
  }
  if (fields.length === 0) {
    res.status(400).json({ error: "no updatable fields" });
    return;
  }
  fields.push("updated_at = ?");
  values.push(Date.now(), id);

  db.prepare(`UPDATE page SET ${fields.join(", ")} WHERE id = ?`).run(
    ...values
  );
  res.json(db.prepare("SELECT * FROM page WHERE id = ?").get(id));
});

// 페이지 삭제 → 휴지통으로 (자기 자신 + 하위 전체를 소프트 삭제)
pages.delete("/pages/:id", (req, res) => {
  const ids = subtreeIds(req.params.id);
  if (ids.length === 0) {
    res.status(404).end();
    return;
  }
  const now = Date.now();
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(
    `UPDATE page SET deleted_at = ? WHERE id IN (${placeholders})`
  ).run(now, ...ids);
  res.status(204).end();
});

// 휴지통에서 복원 (자기 + 하위 전체 복원). 부모가 아직 삭제 상태면 최상위로 올린다.
pages.post("/pages/:id/restore", (req, res) => {
  const { id } = req.params;
  const ids = subtreeIds(id);
  if (ids.length === 0) {
    res.status(404).end();
    return;
  }
  const placeholders = ids.map(() => "?").join(",");
  const restore = db.transaction(() => {
    db.prepare(
      `UPDATE page SET deleted_at = NULL WHERE id IN (${placeholders})`
    ).run(...ids);
    // 복원된 루트의 부모가 여전히 삭제 상태면 부모 연결을 끊어 트리에서 떠돌지 않게 한다
    const row = db
      .prepare("SELECT parent_page_id FROM page WHERE id = ?")
      .get(id) as { parent_page_id: string | null } | undefined;
    if (row?.parent_page_id) {
      const parent = db
        .prepare("SELECT deleted_at FROM page WHERE id = ?")
        .get(row.parent_page_id) as { deleted_at: number | null } | undefined;
      if (!parent || parent.deleted_at != null) {
        db.prepare("UPDATE page SET parent_page_id = NULL WHERE id = ?").run(id);
      }
    }
  });
  restore();
  res.json(db.prepare("SELECT * FROM page WHERE id = ?").get(id));
});

// 휴지통에서 영구 삭제 (실제 DELETE → 하위 페이지/블록 CASCADE)
pages.delete("/trash/:id", (req, res) => {
  db.prepare("DELETE FROM page WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

// 휴지통 비우기 (삭제 상태인 모든 페이지 영구 삭제)
pages.delete("/trash", (_req, res) => {
  db.prepare(
    "DELETE FROM page WHERE workspace_id = ? AND deleted_at IS NOT NULL"
  ).run(WORKSPACE_ID);
  res.status(204).end();
});
