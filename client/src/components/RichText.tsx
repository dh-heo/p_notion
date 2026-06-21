import { useEffect, useRef, useState } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ClipboardEvent as ReactClipboardEvent,
} from 'react'
import DOMPurify from 'dompurify'
import type { BlockType, Page } from '../types'
import { useStore } from '../store'
import { parseClipboardGrid } from '../tableClipboard'
import { MentionMenu } from './MentionMenu'

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
function mentionContext():
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
  onSlash?: (rect: DOMRect) => void
  onMarkdown?: (type: BlockType, level?: 1 | 2 | 3) => void
  onIndent?: (dir: 1 | -1) => void
  onPasteGrid?: (grid: string[][]) => void
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
  onSlash,
  onMarkdown,
  onIndent,
  onPasteGrid,
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
      (page.icon ? page.icon + ' ' : '') + (page.title || '제목 없음')
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

    if (e.key === ' ' && onMarkdown && caretAtEnd(el)) {
      const text = (el.textContent ?? '').trim()
      const md = MD[text]
      if (md) {
        e.preventDefault()
        el.innerHTML = ''
        onInput('')
        onMarkdown(md.type, md.level)
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
    // 다른 문자 없이 '----'(minus 4개)만 입력되면 가로 구분선으로 변환
    if (onMarkdown && el.textContent === '----') {
      el.innerHTML = ''
      onInput('')
      onMarkdown('divider')
      return
    }
    if (onSlash && el.textContent === '/') {
      const rect = el.getBoundingClientRect()
      onSlash(rect)
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
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onClick={handleEditableLinkClick}
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
    </>
  )
}
