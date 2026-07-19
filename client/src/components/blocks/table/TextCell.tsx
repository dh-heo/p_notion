import { useEffect, useRef, useState } from 'react'
import { clean, handleEditableLinkClick, mentionContext } from '../../RichText'
import { MentionMenu } from '../../MentionMenu'
import { useStore } from '../../../store'
import { parseClipboardGrid } from '../../../tableClipboard'
import type { Page } from '../../../types'
import { formatNumberHtml, focusCellEl, caretAtEdge } from './tableShared'

// 텍스트 셀: 편집(포커스) 중에는 prop -> DOM 반영을 막아 입력이 지워지지 않게 한다
// (마우스로 다른 셀을 누르면 선택 상태가 바뀌며 리렌더되는데, 그때 caret/내용이 날아가던 버그 수정)
export function TextCell({
  html,
  editable,
  comma,
  cellKey,
  onCommit,
  onPasteGrid,
  onNav,
}: {
  html: string
  editable: boolean
  comma: boolean
  cellKey: string
  onCommit: (html: string) => void
  onPasteGrid: (grid: string[][]) => void
  onNav: (dir: 'left' | 'right' | 'up' | 'down', atStart: boolean) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const pages = useStore((s) => s.pages)
  // '[[' 페이지 멘션 자동완성 (RichText와 동일하게 동작 — 셀도 텍스트 HTML을 저장하므로 앵커가 보존된다)
  const [mention, setMention] = useState<{ query: string; rect: DOMRect } | null>(null)
  const [mentionIdx, setMentionIdx] = useState(0)
  const mq = mention?.query.toLowerCase() ?? ''
  const cands = mention
    ? pages
        .filter((p) => (p.title || '제목 없음').toLowerCase().includes(mq))
        .slice(0, 8)
    : []
  // 포커스 중이 아니면 표시값(comma 열이면 숫자에 쉼표)을 DOM에 반영
  useEffect(() => {
    const el = ref.current
    if (!el || document.activeElement === el) return
    const display = comma ? formatNumberHtml(html) : html
    if (el.innerHTML !== display) el.innerHTML = display
  }, [html, comma])

  // '[[질의'를 감지해 멘션 메뉴를 열고 닫는다
  const refreshMention = () => {
    const el = ref.current
    if (!el) return
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
  }

  // '[[질의'를 선택한 페이지 멘션 앵커로 치환하고 셀 내용을 저장한다
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
    a.textContent = (page.icon ? page.icon + ' ' : '') + (page.title || '제목 없음')
    range.insertNode(a)
    const space = document.createTextNode(' ')
    a.after(space)
    const after = document.createRange()
    after.setStartAfter(space)
    after.collapse(true)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(after)
    setMention(null)
    onCommit(clean(el.innerHTML))
  }

  return (
    <>
    <div
      ref={ref}
      className="b-table-cell"
      data-cell={cellKey}
      contentEditable={editable}
      suppressContentEditableWarning
      onClick={handleEditableLinkClick}
      onInput={refreshMention}
      onFocus={() => {
        // 편집 시작 시 쉼표 표시 대신 원본을 보여준다 (caret은 끝으로)
        const el = ref.current
        if (el && comma && el.innerHTML !== html) {
          el.innerHTML = html
          focusCellEl(el, false)
        }
      }}
      onKeyDown={(e) => {
        const el = ref.current
        if (!el) return
        // IME 조합 중의 키다운(특히 Enter)은 조합 확정용이므로 무시 (멘션 이중 처리 방지)
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
        if (e.key === 'ArrowLeft' && caretAtEdge(el, true)) {
          e.preventDefault()
          onNav('left', false)
        } else if (e.key === 'ArrowRight' && caretAtEdge(el, false)) {
          e.preventDefault()
          onNav('right', true)
        } else if (e.key === 'ArrowUp' && caretAtEdge(el, true)) {
          e.preventDefault()
          onNav('up', false)
        } else if (e.key === 'ArrowDown' && caretAtEdge(el, false)) {
          e.preventDefault()
          onNav('down', true)
        }
      }}
      onPaste={(e) => {
        const grid = parseClipboardGrid(e.clipboardData)
        if (grid) {
          e.preventDefault()
          onPasteGrid(grid)
        }
      }}
      onBlur={(e) => {
        const el = e.currentTarget
        // 메뉴 항목 클릭은 mousedown+preventDefault라 blur가 나지 않지만, 셀을 떠나면 닫는다
        if (mention) setMention(null)
        onCommit(clean(el.innerHTML))
        // 편집 안 하고 빠져나오면 리렌더가 없을 수 있어, 표시 서식을 직접 되돌린다
        if (comma) {
          const display = formatNumberHtml(el.innerHTML)
          if (el.innerHTML !== display) el.innerHTML = display
        }
      }}
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
