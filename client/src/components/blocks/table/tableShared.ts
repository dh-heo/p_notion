// TableBlock과 그 하위 컴포넌트(TextCell/ColumnMenu/HeaderCell/ColorSwatches)가 공유하는
// 순수 유틸·상수·타입. React나 컴포넌트 상태에 의존하지 않는다.
import { escapeHtml } from '../../../escapeHtml'

// 범주 칩 팔레트 (따뜻한 톤, InlineToolbar 하이라이트 색과 결)
export const CHIP_COLORS = [
  { bg: '#f6e7b0', text: '#6b5a16' }, // 노랑
  { bg: '#f3d4d1', text: '#8a3a32' }, // 분홍
  { bg: '#d6e4cf', text: '#3f5536' }, // 초록
  { bg: '#d3e0ec', text: '#33506b' }, // 파랑
  { bg: '#f0ddc9', text: '#7a4f2b' }, // 주황
  { bg: '#e3d4ea', text: '#574569' }, // 보라
  { bg: '#e6e1d6', text: '#5a5448' }, // 회색
]
export const chip = (i: number) => CHIP_COLORS[i % CHIP_COLORS.length]

// 셀 배경 팔레트 (칩보다 은은한 톤). 행/열 배경색 인덱스가 여기를 가리킨다.
export const BG_COLORS = [
  '#fdf8e6', // 노랑
  '#fbeeeb', // 분홍
  '#f0f6ec', // 초록
  '#eef4f9', // 파랑
  '#fbf1e7', // 주황
  '#f5eef9', // 보라
  '#f3f0ea', // 회색
]
export const bgColor = (i: number) => BG_COLORS[i % BG_COLORS.length]

export function stripHtml(html: string): string {
  const d = document.createElement('div')
  d.innerHTML = html
  return (d.textContent ?? '').trim()
}

// 텍스트 필터의 한 term을 검사 (text/term 모두 소문자 가정)
// ^ = 시작, $ = 끝, ^…$ = 정확히 일치, 그 외 = 포함
export function matchTerm(text: string, term: string): boolean {
  const starts = term.startsWith('^')
  const ends = term.endsWith('$')
  const core = term.slice(starts ? 1 : 0, ends ? term.length - 1 : term.length)
  if (starts && ends) return text === core
  if (starts) return text.startsWith(core)
  if (ends) return text.endsWith(core)
  return text.includes(core)
}

// comma 켜진 text 열의 표시용 HTML. 셀이 순수한 숫자일 때만 1000단위 쉼표를 넣고,
// 숫자가 아니면(문자 포함) 원본 HTML을 그대로 둔다.
export function formatNumberHtml(html: string): string {
  const raw = stripHtml(html).replace(/,/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return html
  const neg = raw.startsWith('-')
  const [int, dec] = raw.replace('-', '').split('.')
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return escapeHtml((neg ? '-' : '') + withSep + (dec != null ? '.' + dec : ''))
}

// contentEditable 셀의 caret이 맨 앞/맨 뒤에 있는지 (화살표 셀 이동 경계 판정)
export function caretAtEdge(el: HTMLElement, atStart: boolean): boolean {
  const sel = window.getSelection()
  if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return false
  const range = sel.getRangeAt(0).cloneRange()
  range.selectNodeContents(el)
  if (atStart) range.setEnd(sel.anchorNode!, sel.anchorOffset)
  else range.setStart(sel.anchorNode!, sel.anchorOffset)
  return range.toString().length === 0
}

// 셀에 포커스를 주고 caret을 맨 앞/맨 뒤로 보낸다
export function focusCellEl(el: HTMLElement, atStart: boolean) {
  el.focus()
  if (!el.isContentEditable) return
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(atStart)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

export type SortState = { colId: string; dir: 'asc' | 'desc' } | null
// 열 id -> select: 허용 옵션 id 배열 / text: 포함 문자열
export type FilterState = Record<string, string[] | string>
