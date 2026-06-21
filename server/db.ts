import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const db = new Database(join(__dirname, "data.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS workspace (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS page (
    id             TEXT PRIMARY KEY,
    workspace_id   TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    parent_page_id TEXT REFERENCES page(id) ON DELETE CASCADE,
    title          TEXT NOT NULL DEFAULT '',
    icon           TEXT,
    sort_order     REAL NOT NULL,
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS block (
    id              TEXT PRIMARY KEY,
    page_id         TEXT NOT NULL REFERENCES page(id) ON DELETE CASCADE,
    parent_block_id TEXT REFERENCES block(id) ON DELETE CASCADE,
    type            TEXT NOT NULL,
    content         TEXT NOT NULL DEFAULT '{}',
    sort_order      REAL NOT NULL,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_page_parent  ON page(parent_page_id);
  CREATE INDEX IF NOT EXISTS idx_block_page   ON block(page_id);
  CREATE INDEX IF NOT EXISTS idx_block_parent ON block(parent_block_id);

  -- 단일 사용자 인증: 비밀번호 해시 1행 + 키-값 메타(세션 서명용 시크릿)
  CREATE TABLE IF NOT EXISTS app_user (
    id            TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// 기존 data.db에 컬럼을 추가하는 멱등 마이그레이션 (CREATE TABLE IF NOT EXISTS는 컬럼을 못 늘림)
function ensureColumn(table: string, column: string, def: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
  }
}
// 휴지통: 소프트 삭제 시각 (NULL = 살아있음)
ensureColumn("page", "deleted_at", "INTEGER");
// 페이지 커버 이미지 URL (NULL = 없음). icon 컬럼은 최초 스키마에 이미 존재
ensureColumn("page", "cover", "TEXT");

// 단일 사용자: workspace 1개를 보장한다.
const existing = db
  .prepare("SELECT id FROM workspace LIMIT 1")
  .get() as { id: string } | undefined;

export const WORKSPACE_ID = existing
  ? existing.id
  : (() => {
      const id = randomUUID();
      db.prepare(
        "INSERT INTO workspace (id, name, created_at) VALUES (?, ?, ?)"
      ).run(id, "My Workspace", Date.now());
      return id;
    })();
