import { useEffect, useRef, useState } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ClipboardEvent as ReactClipboardEvent,
} from 'react'
import DOMPurify from 'dompurify'
import type { BlockContent, BlockType, Page } from '../types'
import { useStore } from '../store'
import { parseClipboardGrid } from '../tableClipboard'
import { MentionMenu } from './MentionMenu'
import { isImageIcon } from './PageIcon'
import { SlashMenu, filterSlashChoices } from './SlashMenu'
import type { SlashChoice } from './SlashMenu'

// contentEditable 안의 링크 클릭 처리: 내부 페이지 멘션(data-page-id)은 해당 페이지로 이동,
// 일반 링크는 새 탭으로 연다
export function handleEditableLinkClick(e: ReactMouseEvent) {
  const a = (e.target as HTMLElement).closest('a')
  if (!a) return
  const pid = a.getAttribute('data-page-id')
  if (pid) {
    e.preventDefault()
    useStore.getState().selectPage(pid)
    return
  }
  if (a.href) {
    e.preventDefault()
    window.open(a.href, '_blank', 'noopener,noreferrer')
  }
}

const SANITIZE = {
  ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'code', 'a', 'br', 'span', 'font'],
  // style은 DOMPurify의 CSS 필터로 color/background-color/font-size 등 안전한 속성만 보존됨
  // data-page-id: 내부 페이지 멘션 앵커
  ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'color', 'data-page-id'],
}
export function clean(html: string): string {
  return DOMPurify.sanitize(html, SANITIZE)
}

export function isEmptyHtml(html: string): boolean {
  return html.replace(/<br\s*\/?>/gi, '').replace(/&nbsp;/gi, '').trim() === ''
}

// 마크다운 단축: 프리픽스 → 블록 변환
const MD: Record<string, { type: BlockType; level?: 1 | 2 | 3 }> = {
  '#': { type: 'heading', level: 1 },
  '##': { type: 'heading', level: 2 },
  '###': { type: 'heading', level: 3 },
  '-': { type: 'bullet' },
  '*': { type: 'bullet' },
  '[]': { type: 'todo' },
  '[ ]': { type: 'todo' },
}

// 캐럿 바로 앞의 '->' / '<-'를 화살표(→ / ←)로 치환. 치환했으면 true
function replaceArrowsAtCaret(): boolean {
  const sel = window.getSelection()
  if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return false
  const node = sel.anchorNode
  if (!node || node.nodeType !== Node.TEXT_NODE) return false
  const offset = sel.anchorOffset
  const text = node.textContent ?? ''
  const before = text.slice(0, offset)
  let arrow = ''
  if (before.endsWith('->')) arrow = '→'
  else if (before.endsWith('<-')) arrow = '←'
  if (!arrow) return false
  node.textContent = text.slice(0, offset - 2) + arrow + text.slice(offset)
  const r = document.createRange()
  r.setStart(node, offset - 1)
  r.collapse(true)
  sel.removeAllRanges()
  sel.addRange(r)
  return true
}

function caretAtStart(el: HTMLElement): boolean {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return false
  const r = sel.getRangeAt(0)
  if (!r.collapsed) return false
  const pre = r.cloneRange()
  pre.selectNodeContents(el)
  pre.setEnd(r.startContainer, r.startOffset)
  return pre.toString().length === 0
}

function caretAtEnd(el: HTMLElement): boolean {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return false
  const r = sel.getRangeAt(0)
  const post = r.cloneRange()
  post.selectNodeContents(el)
  post.setStart(r.endContainer, r.endOffset)
  return post.toString().length === 0
}

// 블록 시작부터 캐럿까지의 평문 (행 맨 앞의 '/' 슬래시·마크다운 프리픽스 감지에 사용)
function textBeforeCaret(el: HTMLElement): string {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return ''
  const r = sel.getRangeAt(0)
  const pre = r.cloneRange()
  pre.selectNodeContents(el)
  pre.setEnd(r.endContainer, r.endOffset)
  return pre.toString()
}

function htmlAfterCaret(el: HTMLElement): string {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return ''
  const r = sel.getRangeAt(0)
  const after = r.cloneRange()
  after.selectNodeContents(el)
  after.setStart(r.endContainer, r.endOffset)
  const frag = after.extractContents() // el에서 caret 이후 내용 제거
  const div = document.createElement('div')
  div.appendChild(frag)
  return div.innerHTML
}

// 캐럿 바로 앞에서 닫히지 않은 '[[질의'를 찾는다 (페이지 멘션 자동완성용)
export function mentionContext():
  | { query: string; node: Text; start: number; offset: number }
  | null {
  const sel = window.getSelection()
  if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return null
  const node = sel.anchorNode
  if (!node || node.nodeType !== Node.TEXT_NODE) return null
  const text = node.textContent ?? ''
  const offset = sel.anchorOffset
  const before = text.slice(0, offset)
  const start = before.lastIndexOf('[[')
  if (start === -1) return null
  const query = before.slice(start + 2)
  // 대괄호/줄바꿈이 끼면 멘션이 아니다
  if (/[[\]\n]/.test(query)) return null
  return { query, node: node as Text, start, offset }
}

// 화면 좌표(x,y)에 해당하는 캐럿 위치를 Range로 반환 (브라우저별 API 차이 흡수)
function caretPointToRange(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number
    ) => { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(x, y)
    if (p) {
      const r = document.createRange()
      r.setStart(p.offsetNode, p.offset)
      r.collapse(true)
      return r
    }
  }
  if (doc.caretRangeFromPoint) {
    const r = doc.caretRangeFromPoint(x, y)
    if (r) {
      r.collapse(true)
      return r
    }
  }
  return null
}

// 현재 캐럿이 블록의 첫 줄/마지막 줄에 있는지와, 가로 위치(x)를 구한다
function caretLineInfo(el: HTMLElement): { first: boolean; last: boolean; x: number } {
  const er = el.getBoundingClientRect()
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return { first: true, last: true, x: er.left }
  const cr = sel.getRangeAt(0).getBoundingClientRect()
  // 빈 블록 등에서 collapsed range가 빈 사각형이면 단일 줄로 취급
  if (cr.height === 0 && cr.top === 0 && cr.bottom === 0) {
    return { first: true, last: true, x: er.left }
  }
  const lh = cr.height || 20
  return {
    first: cr.top - er.top < lh * 0.75,
    last: er.bottom - cr.bottom < lh * 0.75,
    x: cr.left,
  }
}

function placeCaret(el: HTMLElement, atStart: boolean) {
  el.focus()
  const sel = window.getSelection()
  const r = document.createRange()
  r.selectNodeContents(el)
  r.collapse(atStart)
  sel?.removeAllRanges()
  sel?.addRange(r)
}

interface Props {
  html: string
  onInput: (html: string) => void
  onEnter?: (afterHtml: string, beforeEmpty: boolean) => void
  onBackspaceStart?: (html: string, empty: boolean) => void
  // 두 번째 인자는 슬래시 토큰 앞에 남아 있던 기존 텍스트(이미 작성된 행에서 맨 앞 '/' 사용 시)
  onSlashSelect?: (choice: SlashChoice, html: string) => void
  onMarkdown?: (type: BlockType, level?: 1 | 2 | 3, html?: string) => void
  onIndent?: (dir: 1 | -1) => void
  onPasteGrid?: (grid: string[][]) => void
  // 앱 내부에서 복사한 블록들을 붙여넣을 때 (text/html 마커 감지 시)
  onPasteBlocks?: (items: Array<{ type: BlockType; content: BlockContent }>) => void
  // 설정 시 contentEditable에 data-block-id로 부착돼 화살표 블록 간 이동 대상이 된다
  navId?: string
  placeholder?: string
  className?: string
  editable?: boolean
  shouldFocus?: boolean
  focusAtStart?: boolean
  onFocusConsumed?: () => void
}

export function RichText({
  html,
  onInput,
  onEnter,
  onBackspaceStart,
  onSlashSelect,
  onMarkdown,
  onIndent,
  onPasteGrid,
  onPasteBlocks,
  navId,
  placeholder,
  className,
  editable = true,
  shouldFocus,
  focusAtStart,
  onFocusConsumed,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const pages = useStore((s) => s.pages)
  const [mention, setMention] = useState<{ query: string; rect: DOMRect } | null>(
    null
  )
  const [mentionIdx, setMentionIdx] = useState(0)
  const [slash, setSlash] = useState<{ query: string; rect: DOMRect } | null>(null)
  const [slashIdx, setSlashIdx] = useState(0)

  const slashChoices = slash ? filterSlashChoices(slash.query) : []

  const mq = mention?.query.toLowerCase() ?? ''
  const cands = mention
    ? pages
        .filter((p) => (p.title || '제목 없음').toLowerCase().includes(mq))
        .slice(0, 8)
    : []

  // '[[질의'를 선택한 페이지 멘션 앵커로 치환
  const pickMention = (page: Page) => {
    const el = ref.current
    const ctx = mentionContext()
    if (!el || !ctx) return
    const range = document.createRange()
    range.setStart(ctx.node, ctx.start)
    range.setEnd(ctx.node, ctx.offset)
    range.deleteContents()
    const a = document.createElement('a')
    a.setAttribute('data-page-id', page.id)
    a.textContent =
      (page.icon && !isImageIcon(page.icon) ? page.icon + ' ' : '') +
      (page.title || '제목 없음')
    range.insertNode(a)
    const space = document.createTextNode(' ')
    a.after(space)
    const after = document.createRange()
    after.setStartAfter(space)
    after.collapse(true)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(after)
    setMention(null)
    onInput(clean(el.innerHTML))
  }

  // 캐럿 앞의 프리픽스('/질의' 또는 '- ' 같은 마크다운 토큰)만 DOM에서 지우고 남은 HTML을 돌려준다.
  // 편집 중엔 외부 html 동기화가 막혀 있어(포커스 가드) 프리픽스를 직접 지워야 화면에서 사라진다.
  const consumePrefix = (): string => {
    const el = ref.current
    if (!el) return ''
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const caret = sel.getRangeAt(0)
      const del = document.createRange()
      del.setStart(el, 0)
      del.setEnd(caret.endContainer, caret.endOffset)
      del.deleteContents()
    }
    return clean(el.innerHTML)
  }

  // 슬래시 메뉴에서 블록 종류 선택: '/질의' 토큰만 지우고 뒤에 남은 텍스트와 함께 변환을 위임.
  // onInput('')은 호출하지 않는다 — 디바운스 저장이 변환 결과(content)를 뒤늦게 덮어쓰기 때문.
  // 실제 content는 convertBlock이 즉시 교체하며, 대기 중 저장은 convertBlock이 취소한다.
  const pickSlash = (choice: SlashChoice) => {
    const remaining = consumePrefix()
    setSlash(null)
    onSlashSelect?.(choice, remaining)
  }

  // 화살표로 이웃 텍스트 블록(data-block-id가 붙은 RichText)으로 캐럿을 이동한다.
  // 표/코드/이미지 등 비텍스트 블록은 data-block-id가 없어 자연스럽게 건너뛴다.
  const moveToSibling = (
    dir: -1 | 1,
    x: number | null,
    collapseTo: 'start' | 'end'
  ): boolean => {
    const el = ref.current
    if (!el || !navId) return false
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>('[data-block-id]')
    )
    const target = nodes[nodes.indexOf(el) + dir]
    if (!target) return false
    target.focus()
    const sel = window.getSelection()
    if (!sel) return true
    let range: Range | null = null
    if (x != null) {
      const tr = target.getBoundingClientRect()
      const cx = Math.max(tr.left + 1, Math.min(x, tr.right - 1))
      // 위로(-1) 가면 대상의 마지막 줄, 아래로(+1) 가면 첫 줄로 진입
      const y = dir === -1 ? tr.bottom - 6 : tr.top + 6
      range = caretPointToRange(cx, y)
    }
    if (!range) {
      range = document.createRange()
      range.selectNodeContents(target)
      range.collapse(collapseTo === 'start')
    }
    sel.removeAllRanges()
    sel.addRange(range)
    return true
  }

  // 외부 html과 DOM 동기화 (편집 중이 아닐 때만)
  useEffect(() => {
    const el = ref.current
    if (el && document.activeElement !== el && el.innerHTML !== html) {
      el.innerHTML = html
    }
  }, [html])

  // 포커스 요청 처리
  useEffect(() => {
    if (shouldFocus && ref.current) {
      placeCaret(ref.current, focusAtStart ?? false)
      onFocusConsumed?.()
    }
  }, [shouldFocus, focusAtStart, onFocusConsumed])

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const el = ref.current!

    // 한글 등 IME 조합 중의 키다운(특히 Enter)은 조합 확정용이므로 무시한다.
    // 가드가 없으면 한 번의 Enter가 조합 확정 + 블록 분리로 이중 처리돼 개행/항목이 2개가 된다.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return

    // 멘션 메뉴가 열려 있으면 방향키/Enter/Esc를 메뉴 조작에 사용
    if (mention) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIdx((i) => (cands.length ? (i + 1) % cands.length : 0))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIdx((i) =>
          cands.length ? (i - 1 + cands.length) % cands.length : 0
        )
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (cands[mentionIdx]) pickMention(cands[mentionIdx])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMention(null)
        return
      }
    }

    // 슬래시 메뉴가 열려 있으면 방향키/Enter/Esc를 메뉴 조작에 사용 (끝에서 멈춤, 순환 없음)
    if (slash) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashIdx((i) => Math.min(i + 1, slashChoices.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashIdx((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (slashChoices[slashIdx]) pickSlash(slashChoices[slashIdx])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setSlash(null)
        return
      }
    }

    // 포맷 단축키: ⌘/Ctrl+B/I/U, ⌘/Ctrl+K(링크). 링크는 선택 영역이 있을 때만 동작
    if ((e.metaKey || e.ctrlKey) && !e.altKey) {
      const k = e.key.toLowerCase()
      if (k === 'b' || k === 'i' || k === 'u') {
        e.preventDefault()
        document.execCommand('styleWithCSS', false, 'false')
        document.execCommand(k === 'b' ? 'bold' : k === 'i' ? 'italic' : 'underline')
        onInput(clean(el.innerHTML))
        return
      }
      if (k === 'k') {
        const sel = window.getSelection()
        if (sel && !sel.isCollapsed) {
          e.preventDefault()
          const url = prompt('링크 URL')
          if (url?.trim()) {
            const href = /^[a-z]+:\/\//i.test(url) ? url : `https://${url.trim()}`
            document.execCommand('createLink', false, href)
            onInput(clean(el.innerHTML))
          }
          return
        }
        // 선택 영역이 없으면 전역 검색(⌘K)이 처리하도록 둔다
      }
    }

    if (e.key === 'Tab' && onIndent) {
      e.preventDefault()
      onIndent(e.shiftKey ? -1 : 1)
      return
    }

    // 화살표로 블록 경계를 넘어 이웃 블록으로 이동 (수정자 없는 단순 화살표만)
    if (
      navId &&
      !e.shiftKey &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      (e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight')
    ) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const info = caretLineInfo(el)
        if (e.key === 'ArrowUp' && info.first) {
          if (moveToSibling(-1, info.x, 'end')) e.preventDefault()
        } else if (e.key === 'ArrowDown' && info.last) {
          if (moveToSibling(1, info.x, 'start')) e.preventDefault()
        }
      } else if (e.key === 'ArrowLeft' && caretAtStart(el)) {
        if (moveToSibling(-1, null, 'end')) e.preventDefault()
      } else if (e.key === 'ArrowRight' && caretAtEnd(el)) {
        if (moveToSibling(1, null, 'start')) e.preventDefault()
      }
      return
    }

    // 캐럿 앞이 정확히 마크다운 프리픽스면 블록 변환 (행 맨 앞이면 뒤에 기존 텍스트가 있어도 동작).
    // 프리픽스만 지우고 나머지 텍스트는 보존한다.
    if (e.key === ' ' && onMarkdown) {
      const sel = window.getSelection()
      const before = sel && sel.isCollapsed ? textBeforeCaret(el) : ''
      const md = MD[before]
      if (md) {
        e.preventDefault()
        onMarkdown(md.type, md.level, consumePrefix())
        return
      }
      // '1.' / '1)' 등 숫자 프리픽스 → 번호 매기기 목록
      if (/^\d+[.)]$/.test(before)) {
        e.preventDefault()
        onMarkdown('numbered', undefined, consumePrefix())
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (onEnter) {
        const after = htmlAfterCaret(el)
        const beforeEmpty = (el.textContent ?? '') === ''
        onInput(clean(el.innerHTML))
        onEnter(clean(after), beforeEmpty)
      } else {
        // 블록 분리가 없는 컨텍스트(예: 토글 본문)에선 줄바꿈만 삽입
        document.execCommand('insertLineBreak')
        onInput(clean(el.innerHTML))
      }
      return
    }

    if (e.key === 'Backspace' && onBackspaceStart && caretAtStart(el)) {
      e.preventDefault()
      const empty = (el.textContent ?? '') === ''
      onBackspaceStart(clean(el.innerHTML), empty)
      return
    }
  }

  const handleInput = () => {
    const el = ref.current!
    // '->' / '<-' → 화살표 치환 (치환 시 caret/DOM이 바뀌므로 이후 직렬화에 반영됨)
    replaceArrowsAtCaret()
    // 다른 문자 없이 '----'(minus 4개)만 입력되면 가로 구분선으로 변환
    if (onMarkdown && el.textContent === '----') {
      el.innerHTML = ''
      onInput('')
      onMarkdown('divider')
      return
    }
    // 슬래시 메뉴: 캐럿 앞이 '/질의'(행 맨 앞의 슬래시)면 열고 질의로 필터링한다.
    // 캐럿 뒤에 기존 텍스트가 있어도 되므로 이미 작성된 행에서도 맨 앞 '/'로 메뉴가 열린다.
    const slashMatch = onSlashSelect ? /^\/(\S*)$/.exec(textBeforeCaret(el)) : null
    if (slashMatch) {
      const sel = window.getSelection()
      const rect =
        sel && sel.rangeCount > 0
          ? sel.getRangeAt(0).getBoundingClientRect()
          : el.getBoundingClientRect()
      setSlash({ query: slashMatch[1], rect })
      setSlashIdx(0)
    } else if (slash) {
      setSlash(null)
    }
    // 페이지 멘션 자동완성 ('[[' 감지)
    const ctx = mentionContext()
    if (ctx) {
      const sel = window.getSelection()
      const rect =
        sel && sel.rangeCount > 0
          ? sel.getRangeAt(0).getBoundingClientRect()
          : el.getBoundingClientRect()
      setMention({ query: ctx.query, rect })
      setMentionIdx(0)
    } else if (mention) {
      setMention(null)
    }
    onInput(clean(el.innerHTML))
  }

  // 스프레드시트 영역을 붙여넣으면 표 블록으로 전환/삽입 (그 외는 기본 붙여넣기)
  const handlePaste = (e: ReactClipboardEvent<HTMLDivElement>) => {
    // 앱 내부에서 복사한 블록(text/html 마커)을 먼저 처리 → 블록 구조 복원
    if (onPasteBlocks) {
      const html = e.clipboardData.getData('text/html')
      if (html.includes('data-pnotion-blocks')) {
        const el = new DOMParser()
          .parseFromString(html, 'text/html')
          .querySelector('[data-pnotion-blocks]')
        const raw = el?.getAttribute('data-pnotion-blocks')
        if (raw) {
          try {
            const items = JSON.parse(decodeURIComponent(raw))
            if (Array.isArray(items) && items.length) {
              e.preventDefault()
              onPasteBlocks(items)
              return
            }
          } catch {
            /* 파싱 실패 시 기본 붙여넣기로 폴백 */
          }
        }
      }
    }
    if (!onPasteGrid) return
    const grid = parseClipboardGrid(e.clipboardData)
    if (grid) {
      e.preventDefault()
      onPasteGrid(grid)
    }
  }

  return (
    <>
      <div
        ref={ref}
        className={className}
        contentEditable={editable}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        data-block-id={navId}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onClick={handleEditableLinkClick}
        // 메뉴 항목 클릭은 mousedown+preventDefault라 blur가 나지 않으므로, blur 시 슬래시 메뉴를 닫는다
        onBlur={() => slash && setSlash(null)}
      />
      {mention && (
        <MentionMenu
          rect={mention.rect}
          cands={cands}
          active={mentionIdx}
          onHover={setMentionIdx}
          onPick={pickMention}
        />
      )}
      {slash && (
        <SlashMenu
          rect={slash.rect}
          choices={slashChoices}
          active={slashIdx}
          onHover={setSlashIdx}
          onPick={pickSlash}
        />
      )}
    </>
  )
}
