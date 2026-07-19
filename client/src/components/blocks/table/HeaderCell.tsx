import {
  ArrowUp,
  ArrowDown,
  Filter,
  GripVertical,
  Tag,
  ChevronDown,
  EyeOff,
} from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ReactNode, MouseEvent as ReactMouseEvent } from 'react'
import type { TableColumn } from '../../../types'

// 헤더 셀: 드래그 핸들(grip)로만 열 순서를 바꾼다 (이름 입력/메뉴 클릭과 충돌하지 않게)
export function HeaderCell({
  col,
  c,
  editable,
  sortDir,
  filtered,
  hiddenBefore,
  selected,
  onShowGap,
  onToggleMenu,
  onRename,
  onSelDown,
  onSelEnter,
  menu,
}: {
  col: TableColumn
  c: number
  editable: boolean
  sortDir: 'asc' | 'desc' | null
  filtered: boolean
  // 이 열 바로 앞에 숨겨진 열들의 이름 (없으면 빈 배열)
  hiddenBefore: string[]
  // 영역 선택에 이 헤더 셀이 포함됐는지
  selected: boolean
  onShowGap: () => void
  onToggleMenu: () => void
  onRename: (name: string) => void
  // 헤더도 본문 셀처럼 드래그 영역 선택에 참여 (헤더 행 = -1)
  onSelDown: (e: ReactMouseEvent) => void
  onSelEnter: (e: ReactMouseEvent) => void
  menu: ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: col.id })
  return (
    <th
      ref={setNodeRef}
      className={`b-th${isDragging ? ' dragging' : ''}${selected ? ' selected' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onMouseDown={onSelDown}
      onMouseEnter={onSelEnter}
    >
      {editable && hiddenBefore.length > 0 && (
        <button
          className="b-th-gap"
          title={`숨긴 열 ${hiddenBefore.length}개: ${hiddenBefore.join(', ')} — 클릭하여 펼치기`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onShowGap}
        >
          <EyeOff size={11} />
          {hiddenBefore.length > 1 && <span>{hiddenBefore.length}</span>}
        </button>
      )}
      <div className="b-th-inner">
        {editable && (
          <button
            className="b-th-drag"
            title="열 이동"
            {...attributes}
            {...listeners}
            // grip 드래그(열 이동)는 dnd의 onPointerDown이 처리 — 영역 선택 시작만 막는다
            onMouseDown={(e) => e.stopPropagation()}
          >
            <GripVertical size={12} />
          </button>
        )}
        <input
          className="b-th-name"
          value={col.name}
          placeholder={`열 ${c + 1}`}
          readOnly={!editable}
          onChange={(e) => onRename(e.target.value)}
        />
        {col.type === 'select' && <Tag size={12} className="b-th-typeicon" />}
        {sortDir && (sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
        {filtered && <Filter size={12} className="b-th-filtered" />}
        {editable && (
          <button
            className="b-th-menu"
            title="열 옵션"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onToggleMenu}
          >
            <ChevronDown size={13} />
          </button>
        )}
      </div>
      {menu}
    </th>
  )
}
