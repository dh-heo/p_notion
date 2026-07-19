import {
  ArrowUp,
  ArrowDown,
  ArrowRightToLine,
  Filter,
  Hash,
  Type as TypeIcon,
  Tag,
  Trash2,
  X,
  EyeOff,
  Palette,
} from 'lucide-react'
import type { TableColumn } from '../../../types'
import { chip } from './tableShared'
import { ColorSwatches } from './ColorSwatches'

interface MenuProps {
  col: TableColumn
  sortDir: 'asc' | 'desc' | null
  filter: string[] | string | undefined
  canDelete: boolean
  canHide: boolean
  onSort: (dir: 'asc' | 'desc' | null) => void
  onTextFilter: (q: string) => void
  onToggleOpt: (optId: string) => void
  onConvert: (to: 'text' | 'select') => void
  onDeleteOption: (optId: string) => void
  onInsertColAfter: () => void
  onToggleComma: () => void
  onSetBg: (bg: number | null) => void
  onHideCol: () => void
  onDeleteCol: () => void
}

export function ColumnMenu({
  col,
  sortDir,
  filter,
  canDelete,
  canHide,
  onSort,
  onTextFilter,
  onToggleOpt,
  onConvert,
  onDeleteOption,
  onInsertColAfter,
  onToggleComma,
  onSetBg,
  onHideCol,
  onDeleteCol,
}: MenuProps) {
  const allIds = ['', ...(col.options ?? []).map((o) => o.id)]
  const allowed = (filter as string[]) ?? allIds
  return (
    <div className="b-col-pop" onMouseDown={(e) => e.stopPropagation()}>
      <div className="b-pop-section">
        <button
          className={`b-pop-item${sortDir === 'asc' ? ' active' : ''}`}
          onClick={() => onSort(sortDir === 'asc' ? null : 'asc')}
        >
          <ArrowUp size={14} /> 오름차순
        </button>
        <button
          className={`b-pop-item${sortDir === 'desc' ? ' active' : ''}`}
          onClick={() => onSort(sortDir === 'desc' ? null : 'desc')}
        >
          <ArrowDown size={14} /> 내림차순
        </button>
        <button className="b-pop-item" onClick={onInsertColAfter}>
          <ArrowRightToLine size={14} /> 오른쪽에 열 추가
        </button>
        {canHide && (
          <button className="b-pop-item" onClick={onHideCol}>
            <EyeOff size={14} /> 열 숨기기
          </button>
        )}
        {canDelete && (
          <button className="b-pop-item danger" onClick={onDeleteCol}>
            <Trash2 size={14} /> 열 삭제
          </button>
        )}
      </div>

      <div className="b-pop-section">
        <div className="b-pop-label">
          <Palette size={12} /> 배경색
        </div>
        <ColorSwatches value={col.bg ?? null} onPick={onSetBg} />
      </div>

      <div className="b-pop-section">
        <div className="b-pop-label">
          <Filter size={12} /> 필터
        </div>
        {col.type === 'select' ? (
          <div className="b-pop-checks">
            <label className="b-pop-check">
              <input
                type="checkbox"
                checked={allowed.includes('')}
                onChange={() => onToggleOpt('')}
              />
              <span className="b-cell-empty">(없음)</span>
            </label>
            {(col.options ?? []).map((o) => {
              const cc = chip(o.color)
              return (
                <label key={o.id} className="b-pop-check">
                  <input
                    type="checkbox"
                    checked={allowed.includes(o.id)}
                    onChange={() => onToggleOpt(o.id)}
                  />
                  <span className="b-chip" style={{ background: cc.bg, color: cc.text }}>
                    {o.label}
                  </span>
                  <button
                    className="b-opt-del"
                    title="옵션 삭제"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onDeleteOption(o.id)}
                  >
                    <X size={12} />
                  </button>
                </label>
              )
            })}
          </div>
        ) : (
          <input
            className="b-pop-filter"
            placeholder="포함할 텍스트"
            value={(filter as string) ?? ''}
            onChange={(e) => onTextFilter(e.target.value)}
          />
        )}
      </div>

      <div className="b-pop-section">
        {col.type !== 'select' && (
          <button
            className={`b-pop-item${col.comma ? ' active' : ''}`}
            onClick={onToggleComma}
          >
            <Hash size={14} /> 천 단위 쉼표
          </button>
        )}
        <button
          className="b-pop-item"
          onClick={() => onConvert(col.type === 'select' ? 'text' : 'select')}
        >
          {col.type === 'select' ? <TypeIcon size={14} /> : <Tag size={14} />}
          {col.type === 'select' ? '텍스트 열로' : '범주 열로'}
        </button>
      </div>
    </div>
  )
}
