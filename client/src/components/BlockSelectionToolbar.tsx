import { useEffect, useState } from 'react'
import { List, ListOrdered } from 'lucide-react'
import { useStore } from '../store'

// 여러 행을 드래그로 선택하면 나타나는 툴바. 선택한 블록들을 한 번에 불릿/번호 목록으로 바꾼다.
export function BlockSelectionToolbar() {
  const selectedBlockIds = useStore((s) => s.selectedBlockIds)
  const blocks = useStore((s) => s.blocks)
  const convertBlocks = useStore((s) => s.convertBlocks)
  const locked = useStore(
    (s) => !!(s.currentPageId && s.lockedPages[s.currentPageId])
  )
  const [rect, setRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    // 여러 행 선택 시에만 표시
    if (locked || selectedBlockIds.length < 2) {
      setRect(null)
      return
    }
    // 선택된 블록 중 문서상 가장 위 블록의 위치 위쪽에 툴바를 띄운다
    const idset = new Set(selectedBlockIds)
    const first = blocks.find((b) => idset.has(b.id))
    const el = first && document.querySelector(`[data-row-id="${first.id}"]`)
    setRect(el ? el.getBoundingClientRect() : null)
  }, [selectedBlockIds, blocks, locked])

  if (!rect) return null

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
    </div>
  )
}
