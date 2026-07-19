// store.ts가 쓰는 모듈 수준 순수 헬퍼·상수. React/Zustand에 의존하지 않는다.
// (initStarted는 store 내부에서 재할당되는 가변 플래그라 store.ts에 남겨둔다.)
import type { Block, BlockType } from './types'

// 블록별 디바운스 자동저장
const timers = new Map<string, ReturnType<typeof setTimeout>>()
export function debounceSave(id: string, fn: () => void, ms = 600) {
  const t = timers.get(id)
  if (t) clearTimeout(t)
  timers.set(id, setTimeout(() => {
    timers.delete(id)
    fn()
  }, ms))
}
// 대기 중인 디바운스 저장 취소 — 변환 직후 옛 content 저장이 뒤늦게 덮어쓰지 않도록
export function cancelSave(id: string) {
  const t = timers.get(id)
  if (t) {
    clearTimeout(t)
    timers.delete(id)
  }
}

export function bySort(a: { sort_order: number }, b: { sort_order: number }) {
  return a.sort_order - b.sort_order
}

// 캐럿(텍스트 입력)이 있는 블록 종류 — 이 유형으로의 변환엔 끝 빈 문단을 붙이지 않는다
export const TEXT_TYPES = new Set<BlockType>([
  'paragraph', 'heading', 'bullet', 'numbered', 'todo', 'quote', 'callout',
])

// 끝에 자동 유지할 "빈 문단" 판정 (RichText.isEmptyHtml와 동일 규칙, 순환 import 회피용 로컬)
export function isEmptyParaBlock(b: Block): boolean {
  if (b.type !== 'paragraph') return false
  const html = (b.content as { html?: string }).html ?? ''
  return html.replace(/<br\s*\/?>/gi, '').replace(/&nbsp;/gi, '').trim() === ''
}

// 마지막으로 보던 페이지 (localStorage 영속, 재접속 시 복원)
export const LAST_PAGE_KEY = 'pnotion:last-page'

// 페이지별 편집 잠금 상태 (localStorage 영속, 기본 편집 가능)
export const LOCK_KEY = 'pnotion:locked-pages'
export function loadLocked(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(LOCK_KEY) ?? '{}')
  } catch {
    return {}
  }
}

// 넓은 화면에서 사이드바 접힘 상태 (localStorage 영속, 기본 펼침)
export const COLLAPSE_KEY = 'pnotion:sidebar-collapsed'
// 좁은 화면 판정 — 좁으면 오버레이(sidebarOpen), 넓으면 인라인 접힘(sidebarCollapsed)으로 동작
export const isNarrow = () => window.matchMedia('(max-width: 720px)').matches
