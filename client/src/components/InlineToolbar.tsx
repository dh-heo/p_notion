import { useEffect, useState } from 'react'
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Link,
  Baseline,
  Type,
} from 'lucide-react'
import { useStore } from '../store'

function currentEditable(): HTMLElement | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const node = sel.getRangeAt(0).commonAncestorContainer
  const el = node.nodeType === 3 ? node.parentElement : (node as HTMLElement)
  return el?.closest<HTMLElement>('[contenteditable="true"]') ?? null
}

function fireInput(el: HTMLElement | null) {
  el?.dispatchEvent(new Event('input', { bubbles: true }))
}

type ColorCmd = 'foreColor' | 'hiliteColor'
interface RecentColor {
  kind: ColorCmd
  value: string
  label: string
}
const RECENT_KEY = 'pnotion:recent-colors'
const RECENT_MAX = 6

function loadRecent(): RecentColor[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
  } catch {
    return []
  }
}
function saveRecent(list: RecentColor[]) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(list))
}

// 따뜻하고 차분한 팔레트
const TEXT_COLORS: { label: string; value: string }[] = [
  { label: '기본', value: '#2b2a27' },
  { label: '회색', value: '#8b8578' },
  { label: '빨강', value: '#b0392e' },
  { label: '주황', value: '#b9603a' },
  { label: '초록', value: '#5b7553' },
  { label: '파랑', value: '#3f6184' },
  { label: '보라', value: '#6b5b8a' },
]

// 선택 영역을 span style="font-size: Npx"로 감싼다 (px 단위)
const FONT_SIZES = [16, 20, 24]

const BG_COLORS: { label: string; value: string }[] = [
  { label: '없음', value: 'transparent' },
  { label: '노랑', value: '#f6e7b0' },
  { label: '분홍', value: '#f3d4d1' },
  { label: '초록', value: '#d6e4cf' },
  { label: '파랑', value: '#d3e0ec' },
  { label: '주황', value: '#f0ddc9' },
  { label: '회색', value: '#e6e1d6' },
]

export function InlineToolbar() {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [sizeOpen, setSizeOpen] = useState(false)
  const [recent, setRecent] = useState<RecentColor[]>(() => loadRecent())
  const locked = useStore(
    (s) => !!(s.currentPageId && s.lockedPages[s.currentPageId])
  )

  useEffect(() => {
    const onSel = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setRect(null)
        setPaletteOpen(false)
        setSizeOpen(false)
        return
      }
      const editable = currentEditable()
      // 본문 텍스트 블록과 표 셀의 선택만 대상으로 (코드 에디터 제외)
      if (
        !editable ||
        (!editable.classList.contains('b-text') &&
          !editable.classList.contains('b-paragraph') &&
          !editable.classList.contains('b-table-cell') &&
          !editable.className.includes('b-heading'))
      ) {
        setRect(null)
        setPaletteOpen(false)
        setSizeOpen(false)
        return
      }
      setRect(sel.getRangeAt(0).getBoundingClientRect())
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [])

  if (locked || !rect) return null

  const exec = (cmd: string, value?: string) => {
    const el = currentEditable()
    // 굵게/기울임/밑줄/취소선은 의미 태그(<b>/<i>/<u>/<strike>)로 생성
    document.execCommand('styleWithCSS', false, 'false')
    document.execCommand(cmd, false, value)
    fireInput(el)
  }

  const applyFontSize = (px: number) => {
    const el = currentEditable()
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    if (range.collapsed) return

    const frag = range.extractContents()
    // 이미 적용된 font-size를 제거해 중첩 시 안쪽 값이 우선되는 문제를 막는다
    frag.querySelectorAll('span').forEach((s) => {
      s.style.removeProperty('font-size')
      if (!s.getAttribute('style')) s.removeAttribute('style')
    })

    const span = document.createElement('span')
    span.style.fontSize = `${px}px`
    span.appendChild(frag)
    range.insertNode(span)

    // 방금 적용한 영역을 다시 선택해 연속 변경이 가능하게 한다
    const next = document.createRange()
    next.selectNodeContents(span)
    sel.removeAllRanges()
    sel.addRange(next)

    fireInput(el)
    setSizeOpen(false)
  }

  const applyColor = (cmd: ColorCmd, color: string, label: string) => {
    const el = currentEditable()
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand(cmd, false, color)
    fireInput(el)
    // "없음"(transparent)은 지우기 동작이라 최근 목록에 넣지 않음
    if (color !== 'transparent') {
      const next = [
        { kind: cmd, value: color, label },
        ...recent.filter((r) => !(r.kind === cmd && r.value === color)),
      ].slice(0, RECENT_MAX)
      setRecent(next)
      saveRecent(next)
    }
    setPaletteOpen(false)
  }

  const wrapCode = () => {
    const el = currentEditable()
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    if (range.collapsed) return
    const code = document.createElement('code')
    try {
      range.surroundContents(code)
    } catch {
      const frag = range.extractContents()
      code.appendChild(frag)
      range.insertNode(code)
    }
    fireInput(el)
    setRect(null)
  }

  const addLink = () => {
    const input = prompt('링크 URL')
    if (!input) return
    // 스킴이 없으면 https://를 붙여 상대경로로 깨지지 않게 한다
    const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`
    const el = currentEditable()
    document.execCommand('createLink', false, url)
    // 모든 링크를 새 창에서 열도록 보정 (sanitize가 target/rel 유지)
    el?.querySelectorAll('a').forEach((a) => {
      a.setAttribute('target', '_blank')
      a.setAttribute('rel', 'noreferrer noopener')
    })
    fireInput(el)
  }

  return (
    <div
      className="inline-toolbar"
      style={{ top: rect.top - 44, left: rect.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button onClick={() => exec('bold')} title="굵게">
        <Bold size={15} />
      </button>
      <button onClick={() => exec('italic')} title="기울임">
        <Italic size={15} />
      </button>
      <button onClick={() => exec('underline')} title="밑줄">
        <Underline size={15} />
      </button>
      <button onClick={() => exec('strikeThrough')} title="취소선">
        <Strikethrough size={15} />
      </button>
      <button onClick={wrapCode} title="인라인 코드">
        <Code size={15} />
      </button>
      <button onClick={addLink} title="링크">
        <Link size={15} />
      </button>

      <span className="toolbar-divider" />

      <button
        className={sizeOpen ? 'active' : ''}
        onClick={() => {
          setSizeOpen((v) => !v)
          setPaletteOpen(false)
        }}
        title="글자 크기"
      >
        <Type size={15} />
      </button>

      {sizeOpen && (
        <div className="color-pop size-pop">
          <div className="color-section">
            <div className="color-label">글자 크기</div>
            <div className="size-options">
              {FONT_SIZES.map((px) => (
                <button
                  key={px}
                  className="size-option"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyFontSize(px)}
                >
                  {px}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <button
        className={paletteOpen ? 'active' : ''}
        onClick={() => {
          setPaletteOpen((v) => !v)
          setSizeOpen(false)
        }}
        title="글자색 · 배경색"
      >
        <Baseline size={15} />
      </button>

      {paletteOpen && (
        <div className="color-pop">
          {recent.length > 0 && (
            <div className="color-section">
              <div className="color-label">최근 사용</div>
              <div className="color-swatches">
                {recent.map((r, i) => (
                  <button
                    key={`${r.kind}-${r.value}-${i}`}
                    className={`color-swatch${r.kind === 'hiliteColor' ? ' bg' : ''}`}
                    style={
                      r.kind === 'foreColor'
                        ? { color: r.value }
                        : { background: r.value }
                    }
                    title={r.label}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyColor(r.kind, r.value, r.label)}
                  >
                    A
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="color-section">
            <div className="color-label">글자색</div>
            <div className="color-swatches">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c.value}
                  className="color-swatch"
                  style={{ color: c.value }}
                  title={c.label}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyColor('foreColor', c.value, c.label)}
                >
                  A
                </button>
              ))}
            </div>
          </div>
          <div className="color-section">
            <div className="color-label">배경색</div>
            <div className="color-swatches">
              {BG_COLORS.map((c) => (
                <button
                  key={c.value}
                  className="color-swatch bg"
                  style={{ background: c.value }}
                  title={c.label}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyColor('hiliteColor', c.value, c.label)}
                >
                  A
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
