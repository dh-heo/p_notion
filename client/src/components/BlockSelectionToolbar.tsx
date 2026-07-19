import { useEffect, useState } from 'react'
import { List, ListOrdered, Bold, Baseline, Highlighter } from 'lucide-react'
import { useStore } from '../store'

// 여러 행을 드래그로 선택하면 나타나는 툴바.
// 선택한 블록들을 불릿/번호 목록으로 바꾸거나, 굵게/글자색/배경색을 한 번에 적용한다.

const TEXT_COLORS: { label: string; value: string }[] = [
  { label: '기본', value: '#2b2a27' },
  { label: '회색', value: '#8b8578' },
  { label: '빨강', value: '#b0392e' },
  { label: '주황', value: '#b9603a' },
  { label: '초록', value: '#5b7553' },
  { label: '파랑', value: '#3f6184' },
  { label: '보라', value: '#6b5b8a' },
]
const BG_COLORS: { label: string; value: string }[] = [
  { label: '노랑', value: '#f6e7b0' },
  { label: '분홍', value: '#f3d4d1' },
  { label: '초록', value: '#d6e4cf' },
  { label: '파랑', value: '#d3e0ec' },
  { label: '주황', value: '#f0ddc9' },
  { label: '회색', value: '#e6e1d6' },
]

export function BlockSelectionToolbar() {
  const selectedBlockIds = useStore((s) => s.selectedBlockIds)
  const blocks = useStore((s) => s.blocks)
  const convertBlocks = useStore((s) => s.convertBlocks)
  const formatBlocks = useStore((s) => s.formatBlocks)
  const locked = useStore(
    (s) => !!(s.currentPageId && s.lockedPages[s.currentPageId])
  )
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [pop, setPop] = useState<'color' | 'bg' | null>(null)

  useEffect(() => {
    // 여러 행 선택 시에만 표시
    if (locked || selectedBlockIds.length < 2) {
      setRect(null)
      setPop(null)
      return
    }
    // 선택된 블록 중 문서상 가장 위 블록의 위치 위쪽에 툴바를 띄운다
    const idset = new Set(selectedBlockIds)
    const first = blocks.find((b) => idset.has(b.id))
    const el = first && document.querySelector(`[data-row-id="${first.id}"]`)
    setRect(el ? el.getBoundingClientRect() : null)
  }, [selectedBlockIds, blocks, locked])

  if (!rect) return null

  const swatches = pop === 'color' ? TEXT_COLORS : BG_COLORS

  return (
    <div
      className="block-select-toolbar"
      style={{ top: rect.top - 44, left: rect.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        onClick={() => convertBlocks(selectedBlockIds, 'bullet')}
        title="글머리 기호로 변환"
      >
        <List size={15} />
        <span>글머리</span>
      </button>
      <button
        onClick={() => convertBlocks(selectedBlockIds, 'numbered')}
        title="번호 매기기로 변환"
      >
        <ListOrdered size={15} />
        <span>번호</span>
      </button>
      <span className="block-select-sep" />
      <button
        onClick={() => formatBlocks(selectedBlockIds, { kind: 'bold' })}
        title="굵게"
      >
        <Bold size={15} />
      </button>
      <button
        className={pop === 'color' ? 'active' : ''}
        onClick={() => setPop((p) => (p === 'color' ? null : 'color'))}
        title="글자색"
      >
        <Baseline size={15} />
      </button>
      <button
        className={pop === 'bg' ? 'active' : ''}
        onClick={() => setPop((p) => (p === 'bg' ? null : 'bg'))}
        title="배경색"
      >
        <Highlighter size={15} />
      </button>
      {pop && (
        <div className="block-select-swatches">
          {swatches.map((c) => (
            <button
              key={c.value}
              className={`color-swatch${pop === 'bg' ? ' bg' : ''}`}
              style={pop === 'bg' ? { background: c.value } : { color: c.value }}
              title={c.label}
              onClick={() => {
                formatBlocks(selectedBlockIds, {
                  kind: pop === 'bg' ? 'bg' : 'color',
                  value: c.value,
                })
                setPop(null)
              }}
            >
              A
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
