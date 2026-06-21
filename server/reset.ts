// 전체 초기화: SQLite 데이터와 업로드된 이미지를 모두 삭제한다.
// 서버를 다시 시작하면 db.ts가 빈 스키마 + workspace 1개를 재생성한다.
import { rmSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

for (const f of ['data.db', 'data.db-wal', 'data.db-shm']) {
  rmSync(join(__dirname, f), { force: true })
}
rmSync(join(__dirname, 'uploads'), { recursive: true, force: true })
mkdirSync(join(__dirname, 'uploads'), { recursive: true })

console.log('[reset] data.db와 uploads를 비웠습니다. dev 서버를 재시작하세요.')
