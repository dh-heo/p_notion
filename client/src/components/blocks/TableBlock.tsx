import { useEffect, useRef, useState } from 'react'
import {
  Plus,
  ArrowUp,
  ArrowDown,
  ArrowRightToLine,
  Filter,
  GripVertical,
  Hash,
  Type as TypeIcon,
  Tag,
  Trash2,
  X,
  ChevronDown,
  ArrowUpToLine,
  Download,
} from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { clean, handleEditableLinkClick } from '../RichText'
import {
  escapeHtml,
  parseClipboardGrid,
  gridToTSV,
  gridToCSV,
  gridToHtmlTable,
} from '../../tableClipboard'
import type { TableColumn, TableContent, TableOption } from '../../types'
import { uid } from '../../uid'
import type { ReactNode, MouseEvent as ReactMouseEvent, ClipboardEvent as ReactClipboardEvent } from 'react'

// 범주 칩 팔레트 (따뜻한 톤, InlineToolbar 하이라이트 색과 결)
const CHIP_COLORS = [
  { bg: '#f6e7b0', text: '#6b5a16' }, // 노랑
  { bg: '#f3d4d1', text: '#8a3a32' }, // 분홍
  { bg: '#d6e4cf', text: '#3f5536' }, // 초록
  { bg: '#d3e0ec', text: '#33506b' }, // 파랑
  { bg: '#f0ddc9', text: '#7a4f2b' }, // 주황
  { bg: '#e3d4ea', text: '#574569' }, // 보라
  { bg: '#e6e1d6', text: '#5a5448' }, // 회색
]
const chip = (i: number) => CHIP_COLORS[i % CHIP_COLORS.length]

function stripHtml(html: string): string {
  const d = document.createElement('div')
  d.innerHTML = html
  return (d.textContent ?? '').trim()
}

// 텍스트 필터의 한 term을 검사 (text/term 모두 소문자 가정)
// ^ = 시작, $ = 끝, ^…$ = 정확히 일치, 그 외 = 포함
function matchTerm(text: string, term: string): boolean {
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
function formatNumberHtml(html: string): string {
  const raw = stripHtml(html).replace(/,/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return html
  const neg = raw.startsWith('-')
  const [int, dec] = raw.replace('-', '').split('.')
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return escapeHtml((neg ? '-' : '') + withSep + (dec != null ? '.' + dec : ''))
}

// contentEditable 셀의 caret이 맨 앞/맨 뒤에 있는지 (화살표 셀 이동 경계 판정)
function caretAtEdge(el: HTMLElement, atStart: boolean): boolean {
  const sel = window.getSelection()
  if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return false
  const range = sel.getRangeAt(0).cloneRange()
  range.selectNodeContents(el)
  if (atStart) range.setEnd(sel.anchorNode!, sel.anchorOffset)
  else range.setStart(sel.anchorNode!, sel.anchorOffset)
  return range.toString().length === 0
}

// 셀에 포커스를 주고 caret을 맨 앞/맨 뒤로 보낸다
function focusCellEl(el: HTMLElement, atStart: boolean) {
  el.focus()
  if (!el.isContentEditable) return
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(atStart)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

type SortState = { colId: string; dir: 'asc' | 'desc' } | null
// 열 id -> select: 허용 옵션 id 배열 / text: 포함 문자열
type FilterState = Record<string, string[] | string>

interface Props {
  content: TableContent
  onChange: (next: TableContent) => void
  editable: boolean
}

export function TableBlock({ content, onChange, editable }: Props) {
  // cells/columns가 없는 손상·구버전 데이터도 크래시 없이 렌더되도록 방어적으로 읽는다
  const cells: string[][] = content.cells ?? []

  // 마이그레이션/복구: cells 또는 columns가 비어 있으면 유효한 기본 표로 1회 영속화
  useEffect(() => {
    if (content.cells && content.columns) return
    const width = content.columns?.length ?? content.cells?.[0]?.length ?? 2
    const columns: TableColumn[] =
      content.columns ??
      Array.from({ length: width }, () => ({ id: uid(), name: '', type: 'text' }))
    const filledCells =
      content.cells ?? [Array(width).fill(''), Array(width).fill('')]
    onChange({ ...content, columns, cells: filledCells })
    // 마운트 시 1회만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 마이그레이션 직전 한 프레임을 위한 폴백 (id는 effect가 곧 영속화)
  const columns: TableColumn[] =
    content.columns ??
    (cells[0] ?? []).map((_, i) => ({
      id: `c${i}`,
      name: '',
      type: 'text',
    }))

  const [sort, setSort] = useState<SortState>(null)
  const [filters, setFilters] = useState<FilterState>({})
  // 열린 팝오버: 헤더 메뉴(열 id) / select 셀 편집({r, colId})
  const [menuCol, setMenuCol] = useState<string | null>(null)
  const [editCell, setEditCell] = useState<{ r: number; colId: string } | null>(
    null
  )
  const [draftOpt, setDraftOpt] = useState('')

  // 영역 선택 (r = 화면 행 인덱스, c = 열 인덱스)
  const [sel, setSel] = useState<{
    a: { r: number; c: number }
    b: { r: number; c: number }
  } | null>(null)
  const selecting = useRef(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // 클릭과 드래그를 구분하기 위해 약간의 이동 후 열 드래그 시작
  const colSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  )

  // 드래그 종료 / 표 밖 클릭 시 선택 해제
  useEffect(() => {
    const up = () => {
      selecting.current = false
    }
    const down = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setSel(null)
    }
    window.addEventListener('mouseup', up)
    window.addEventListener('mousedown', down)
    return () => {
      window.removeEventListener('mouseup', up)
      window.removeEventListener('mousedown', down)
    }
  }, [])

  const closePops = () => {
    setMenuCol(null)
    setEditCell(null)
    setDraftOpt('')
  }

  const optionOf = (col: TableColumn, id: string) =>
    (col.options ?? []).find((o) => o.id === id)

  // 정렬/필터/셀 표시에 쓰는 평문 값
  const cellText = (r: number, col: TableColumn, c: number): string => {
    const v = cells[r]?.[c] ?? ''
    if (col.type === 'select') return optionOf(col, v)?.label ?? ''
    return stripHtml(v)
  }

  const passesFilter = (col: TableColumn, c: number, r: number): boolean => {
    const f = filters[col.id]
    if (f == null) return true
    if (col.type === 'select') return (f as string[]).includes(cells[r]?.[c] ?? '')
    const q = (f as string).trim().toLowerCase()
    if (!q) return true
    // 대소문자 무시, | = OR, & = AND (AND가 OR보다 우선)
    // term 앞 ^ = 시작, 뒤 $ = 끝, ^…$ = 정확히 일치
    const text = cellText(r, col, c).toLowerCase()
    const orParts = q.split('|').map((p) => p.trim()).filter(Boolean)
    if (orParts.length === 0) return true
    return orParts.some((part) => {
      const terms = part.split('&').map((t) => t.trim()).filter(Boolean)
      return terms.every((t) => matchTerm(text, t))
    })
  }

  // 표시할 행(원본 인덱스) = 필터 통과 + 정렬
  let viewRows = cells.map((_, r) => r)
  viewRows = viewRows.filter((r) =>
    columns.every((col, c) => passesFilter(col, c, r))
  )
  if (sort) {
    const c = columns.findIndex((col) => col.id === sort.colId)
    if (c !== -1) {
      const col = columns[c]
      const dir = sort.dir === 'asc' ? 1 : -1
      viewRows = [...viewRows].sort(
        (a, b) => cellText(a, col, c).localeCompare(cellText(b, col, c), 'ko') * dir
      )
    }
  }

  // ----- 영역 선택 & 복사/내보내기 -----
  const selBox = sel && {
    r1: Math.min(sel.a.r, sel.b.r),
    r2: Math.max(sel.a.r, sel.b.r),
    c1: Math.min(sel.a.c, sel.b.c),
    c2: Math.max(sel.a.c, sel.b.c),
  }
  const multiSel =
    !!selBox && !(selBox.r1 === selBox.r2 && selBox.c1 === selBox.c2)
  const isSelected = (vr: number, c: number) =>
    multiSel && !!selBox &&
    vr >= selBox.r1 && vr <= selBox.r2 && c >= selBox.c1 && c <= selBox.c2

  const onCellDown = (vr: number, c: number, e: ReactMouseEvent) => {
    if (e.button !== 0) return
    selecting.current = true
    setSel({ a: { r: vr, c }, b: { r: vr, c } })
  }
  const onCellEnter = (vr: number, c: number, e: ReactMouseEvent) => {
    if (!selecting.current || !(e.buttons & 1)) return
    setSel((s) => (s ? { ...s, b: { r: vr, c } } : { a: { r: vr, c }, b: { r: vr, c } }))
    window.getSelection()?.removeAllRanges()
    wrapRef.current?.focus()
  }

  // select 셀은 옵션 라벨을, text 셀은 저장된 HTML을 그대로 사용
  const cellHtml = (r: number, col: TableColumn, c: number): string =>
    col.type === 'select'
      ? escapeHtml(optionOf(col, cells[r]?.[c] ?? '')?.label ?? '')
      : cells[r]?.[c] ?? ''

  // 선택 영역을 엑셀 붙여넣기용으로 클립보드에 기록 (TSV + HTML 표)
  const handleCopy = (e: ReactClipboardEvent) => {
    if (!multiSel || !selBox) return
    e.preventDefault()
    const rowsView = viewRows.slice(selBox.r1, selBox.r2 + 1)
    const colIdx = Array.from(
      { length: selBox.c2 - selBox.c1 + 1 },
      (_, i) => selBox.c1 + i
    )
    const plain = rowsView.map((orig) => colIdx.map((c) => cellText(orig, columns[c], c)))
    const html = rowsView.map((orig) => colIdx.map((c) => cellHtml(orig, columns[c], c)))
    e.clipboardData.setData('text/plain', gridToTSV(plain))
    e.clipboardData.setData('text/html', gridToHtmlTable(html))
  }

  // 표 전체(머리글 + 모든 행)를 CSV 파일로 저장
  const exportCSV = () => {
    const header = columns.map((col) => col.name)
    const rows = cells.map((_, r) => columns.map((col, c) => cellText(r, col, c)))
    const csv = '\uFEFF' + gridToCSV([header, ...rows])
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'table.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ----- 셀/구조 변경 -----
  const setTextCell = (r: number, c: number, value: string) => {
    const next = cells.map((row) => row.slice())
    next[r][c] = value
    onChange({ columns, cells: next })
  }
  const setSelectCell = (r: number, c: number, optionId: string) => {
    const next = cells.map((row) => row.slice())
    next[r][c] = optionId
    onChange({ columns, cells: next })
    setEditCell(null)
  }
  const addRow = () => {
    onChange({ columns, cells: [...cells, Array(columns.length).fill('')] })
  }
  const insertRowBelow = (r: number) => {
    const next = cells.map((row) => row.slice())
    next.splice(r + 1, 0, Array(columns.length).fill(''))
    onChange({ columns, cells: next })
  }
  const deleteRow = (r: number) => {
    if (cells.length <= 1) return
    onChange({ columns, cells: cells.filter((_, i) => i !== r) })
  }
  // 맨 위 행의 값을 열 머리글로 올리고 그 행은 본문에서 제거
  const promoteFirstRowToHeader = () => {
    if (cells.length === 0) return
    const first = cells[0]
    const newCols = columns.map((col, c) => ({
      ...col,
      name:
        col.type === 'select'
          ? optionOf(col, first[c] ?? '')?.label ?? ''
          : stripHtml(first[c] ?? ''),
    }))
    onChange({ columns: newCols, cells: cells.slice(1) })
  }
  const addCol = () => {
    onChange({
      columns: [...columns, { id: uid(), name: '', type: 'text' }],
      cells: cells.map((row) => [...row, '']),
    })
  }
  const insertColAfter = (c: number) => {
    const cols = columns.slice()
    cols.splice(c + 1, 0, { id: uid(), name: '', type: 'text' })
    onChange({
      columns: cols,
      cells: cells.map((row) => {
        const r = row.slice()
        r.splice(c + 1, 0, '')
        return r
      }),
    })
    closePops()
  }
  // 헤더 드래그로 열 순서 바꾸기 (열 + 모든 행의 셀을 같이 이동)
  const onColDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = columns.findIndex((col) => col.id === active.id)
    const to = columns.findIndex((col) => col.id === over.id)
    if (from === -1 || to === -1) return
    onChange({
      columns: arrayMove(columns, from, to),
      cells: cells.map((row) => arrayMove(row, from, to)),
    })
  }
  const deleteCol = (c: number) => {
    if (columns.length <= 1) return
    onChange({
      columns: columns.filter((_, i) => i !== c),
      cells: cells.map((row) => row.filter((_, i) => i !== c)),
    })
    closePops()
  }
  const renameCol = (c: number, name: string) => {
    onChange({ columns: columns.map((col, i) => (i === c ? { ...col, name } : col)), cells })
  }
  // 천 단위 쉼표 표시 토글 (text 열 전용, 메뉴는 열어 둔다)
  const toggleComma = (c: number) => {
    onChange({
      columns: columns.map((col, i) => (i === c ? { ...col, comma: !col.comma } : col)),
      cells,
    })
  }

  // 화살표로 인접 셀로 포커스 이동 (vr = 화면 행, c = 열). select 열은 대상에서 제외된다.
  const navigateCell = (
    vr: number,
    c: number,
    dir: 'left' | 'right' | 'up' | 'down',
    atStart: boolean
  ) => {
    let tvr = vr
    let tc = c
    if (dir === 'left') tc -= 1
    else if (dir === 'right') tc += 1
    else if (dir === 'up') tvr -= 1
    else tvr += 1
    if (tc < 0 || tc >= columns.length || tvr < 0 || tvr >= viewRows.length) return
    const target = wrapRef.current?.querySelector<HTMLElement>(
      `[data-cell="${tvr}-${tc}"]`
    )
    if (target) focusCellEl(target, atStart)
  }

  // 스프레드시트 영역을 (ar, ac) 셀 기준으로 붙여넣기. 필요하면 행/열을 늘린다.
  const pasteIntoTable = (ar: number, ac: number, grid: string[][]) => {
    const colCount = Math.max(columns.length, ac + (grid[0]?.length ?? 0))
    const cols: TableColumn[] = columns.map((c) => ({
      ...c,
      options: c.options ? c.options.slice() : c.options,
    }))
    while (cols.length < colCount) cols.push({ id: uid(), name: '', type: 'text' })

    const rowCount = Math.max(cells.length, ar + grid.length)
    const rows: string[][] = []
    for (let r = 0; r < rowCount; r++) {
      const src = cells[r] ?? []
      rows.push(cols.map((_, c) => src[c] ?? ''))
    }

    for (let i = 0; i < grid.length; i++) {
      for (let j = 0; j < grid[i].length; j++) {
        const r = ar + i
        const c = ac + j
        const col = cols[c]
        const value = grid[i][j]
        if (col.type === 'select') {
          const label = value.trim()
          if (!label) {
            rows[r][c] = ''
            continue
          }
          // 같은 라벨의 옵션이 있으면 재사용, 없으면 새로 만든다
          let opt = (col.options ?? []).find((o) => o.label === label)
          if (!opt) {
            opt = { id: uid(), label, color: col.options?.length ?? 0 }
            col.options = [...(col.options ?? []), opt]
          }
          rows[r][c] = opt.id
        } else {
          rows[r][c] = escapeHtml(value)
        }
      }
    }
    onChange({ columns: cols, cells: rows })
  }

  // 열 타입 전환 (text <-> select). 기존 값을 최대한 보존한다.
  const convertType = (c: number, to: 'text' | 'select') => {
    const col = columns[c]
    if (col.type === to) return
    if (to === 'select') {
      const options: TableOption[] = []
      const byLabel = new Map<string, string>()
      const next = cells.map((row) => {
        const copy = row.slice()
        const text = stripHtml(row[c] ?? '')
        if (!text) {
          copy[c] = ''
          return copy
        }
        let oid = byLabel.get(text)
        if (!oid) {
          oid = uid()
          byLabel.set(text, oid)
          options.push({ id: oid, label: text, color: options.length })
        }
        copy[c] = oid
        return copy
      })
      onChange({
        columns: columns.map((x, i) => (i === c ? { ...x, type: 'select', options } : x)),
        cells: next,
      })
    } else {
      const next = cells.map((row) => {
        const copy = row.slice()
        copy[c] = escapeHtml(optionOf(col, row[c] ?? '')?.label ?? '')
        return copy
      })
      onChange({
        columns: columns.map((x, i) =>
          i === c ? { ...x, type: 'text', options: undefined } : x
        ),
        cells: next,
      })
    }
    setFilters((f) => {
      const rest = { ...f }
      delete rest[col.id]
      return rest
    })
  }

  // ----- 옵션 관리 (select 열) -----
  const createOptionAndSet = (r: number, c: number, label: string) => {
    const col = columns[c]
    const opt: TableOption = {
      id: uid(),
      label: label.trim(),
      color: col.options?.length ?? 0,
    }
    const newCols = columns.map((x, i) =>
      i === c ? { ...x, options: [...(x.options ?? []), opt] } : x
    )
    const next = cells.map((row) => row.slice())
    next[r][c] = opt.id
    onChange({ columns: newCols, cells: next })
    setEditCell(null)
    setDraftOpt('')
  }
  const deleteOption = (c: number, optId: string) => {
    const col = columns[c]
    const newCols = columns.map((x, i) =>
      i === c ? { ...x, options: (x.options ?? []).filter((o) => o.id !== optId) } : x
    )
    const next = cells.map((row) => {
      const copy = row.slice()
      if (copy[c] === optId) copy[c] = ''
      return copy
    })
    onChange({ columns: newCols, cells: next })
    setFilters((f) => {
      const cur = f[col.id]
      if (!Array.isArray(cur)) return f
      return { ...f, [col.id]: cur.filter((id) => id !== optId) }
    })
  }

  // ----- 필터 조작 -----
  const setTextFilter = (colId: string, q: string) => {
    setFilters((f) => {
      if (!q) {
        const rest = { ...f }
        delete rest[colId]
        return rest
      }
      return { ...f, [colId]: q }
    })
  }
  const toggleSelectFilter = (col: TableColumn, optId: string) => {
    setFilters((f) => {
      const all = ['', ...(col.options ?? []).map((o) => o.id)]
      const cur = (f[col.id] as string[]) ?? all
      const next = cur.includes(optId)
        ? cur.filter((x) => x !== optId)
        : [...cur, optId]
      // 전부 선택 상태면 필터 해제
      if (next.length === all.length) {
        const rest = { ...f }
        delete rest[col.id]
        return rest
      }
      return { ...f, [col.id]: next }
    })
  }

  const renderChip = (col: TableColumn, optId: string) => {
    const opt = optionOf(col, optId)
    if (!opt) return null
    const c = chip(opt.color)
    return (
      <span className="b-chip" style={{ background: c.bg, color: c.text }}>
        {opt.label}
      </span>
    )
  }

  const anyPopOpen = menuCol !== null || editCell !== null

  return (
    <div
      className={`b-table-wrap${multiSel ? ' b-table-selecting' : ''}`}
      ref={wrapRef}
      tabIndex={-1}
      onCopy={handleCopy}
    >
      {anyPopOpen && <div className="b-pop-backdrop" onMouseDown={closePops} />}
      <table className="b-table">
        <thead>
          <tr>
            {editable && <th className="b-row-gutter-th" aria-hidden />}
            <DndContext
              sensors={colSensors}
              collisionDetection={closestCenter}
              onDragEnd={onColDragEnd}
            >
              <SortableContext
                items={columns.map((col) => col.id)}
                strategy={horizontalListSortingStrategy}
              >
                {columns.map((col, c) => {
                  const sorted = sort?.colId === col.id ? sort.dir : null
                  const filtered = filters[col.id] != null
                  return (
                    <HeaderCell
                      key={col.id}
                      col={col}
                      c={c}
                      editable={editable}
                      sortDir={sorted}
                      filtered={filtered}
                      onToggleMenu={() =>
                        setMenuCol((m) => (m === col.id ? null : col.id))
                      }
                      onRename={(name) => renameCol(c, name)}
                      menu={
                        menuCol === col.id ? (
                          <ColumnMenu
                            col={col}
                            sortDir={sorted}
                            filter={filters[col.id]}
                            canDelete={columns.length > 1}
                            onSort={(dir) => {
                              setSort(dir ? { colId: col.id, dir } : null)
                              setMenuCol(null)
                            }}
                            onTextFilter={(q) => setTextFilter(col.id, q)}
                            onToggleOpt={(optId) => toggleSelectFilter(col, optId)}
                            onConvert={(to) => {
                              convertType(c, to)
                              setMenuCol(null)
                            }}
                            onDeleteOption={(optId) => deleteOption(c, optId)}
                            onInsertColAfter={() => insertColAfter(c)}
                            onToggleComma={() => toggleComma(c)}
                            onDeleteCol={() => deleteCol(c)}
                          />
                        ) : null
                      }
                    />
                  )
                })}
              </SortableContext>
            </DndContext>
          </tr>
        </thead>
        <tbody>
          {viewRows.map((r, vr) => (
            <tr key={r}>
              {editable && (
                <td className="b-row-gutter">
                  <div className="b-row-tools">
                    <button
                      className="b-row-add"
                      title="아래에 행 추가"
                      onClick={() => insertRowBelow(r)}
                    >
                      <Plus size={13} />
                    </button>
                    <button
                      className="b-row-del"
                      title="행 삭제"
                      disabled={cells.length <= 1}
                      onClick={() => deleteRow(r)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              )}
              {columns.map((col, c) => (
                <td
                  key={col.id}
                  className={isSelected(vr, c) ? 'b-cell-selected' : undefined}
                  onMouseDown={(e) => onCellDown(vr, c, e)}
                  onMouseEnter={(e) => onCellEnter(vr, c, e)}
                >
                  {col.type === 'select' ? (
                    <div className="b-cell-select-wrap">
                      <button
                        className="b-cell-select"
                        data-cell={`${vr}-${c}`}
                        disabled={!editable}
                        onClick={() => setEditCell({ r, colId: col.id })}
                        onKeyDown={(e) => {
                          // 범주 셀은 caret이 없으므로 화살표로 바로 인접 셀로 이동
                          if (e.key === 'ArrowLeft') {
                            e.preventDefault()
                            navigateCell(vr, c, 'left', false)
                          } else if (e.key === 'ArrowRight') {
                            e.preventDefault()
                            navigateCell(vr, c, 'right', true)
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault()
                            navigateCell(vr, c, 'up', false)
                          } else if (e.key === 'ArrowDown') {
                            e.preventDefault()
                            navigateCell(vr, c, 'down', true)
                          }
                        }}
                      >
                        {cells[r]?.[c]
                          ? renderChip(col, cells[r][c])
                          : editable && <span className="b-cell-empty">선택</span>}
                      </button>
                      {editCell?.r === r && editCell.colId === col.id && (
                        <div className="b-select-pop">
                          {(col.options ?? []).map((o) => {
                            const cc = chip(o.color)
                            return (
                              <div key={o.id} className="b-opt-row">
                                <button
                                  className="b-opt-pick"
                                  onClick={() => setSelectCell(r, c, o.id)}
                                >
                                  <span
                                    className="b-chip"
                                    style={{ background: cc.bg, color: cc.text }}
                                  >
                                    {o.label}
                                  </span>
                                </button>
                                <button
                                  className="b-opt-del"
                                  title="옵션 삭제"
                                  onClick={() => deleteOption(c, o.id)}
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            )
                          })}
                          {cells[r]?.[c] && (
                            <button
                              className="b-opt-clear"
                              onClick={() => setSelectCell(r, c, '')}
                            >
                              지우기
                            </button>
                          )}
                          <input
                            className="b-opt-new"
                            placeholder="새 옵션 입력 후 Enter"
                            value={draftOpt}
                            autoFocus
                            onChange={(e) => setDraftOpt(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && draftOpt.trim()) {
                                e.preventDefault()
                                createOptionAndSet(r, c, draftOpt)
                              } else if (e.key === 'Escape') {
                                setEditCell(null)
                                setDraftOpt('')
                              }
                            }}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <TextCell
                      html={cells[r]?.[c] ?? ''}
                      editable={editable}
                      comma={!!col.comma}
                      cellKey={`${vr}-${c}`}
                      onCommit={(h) => setTextCell(r, c, h)}
                      onPasteGrid={(grid) => pasteIntoTable(r, c, grid)}
                      onNav={(dir, atStart) => navigateCell(vr, c, dir, atStart)}
                    />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="b-table-actions">
        {editable && (
          <>
            <button onClick={addRow} title="행 추가">
              <Plus size={14} /> 행
            </button>
            <button onClick={addCol} title="열 추가">
              <Plus size={14} /> 열
            </button>
            <button
              onClick={promoteFirstRowToHeader}
              disabled={cells.length === 0}
              title="첫 행을 머리글로 지정"
            >
              <ArrowUpToLine size={14} /> 머리글
            </button>
          </>
        )}
        <button onClick={exportCSV} title="CSV로 저장">
          <Download size={14} /> CSV
        </button>
      </div>
    </div>
  )
}

// 텍스트 셀: 편집(포커스) 중에는 prop -> DOM 반영을 막아 입력이 지워지지 않게 한다
// (마우스로 다른 셀을 누르면 선택 상태가 바뀌며 리렌더되는데, 그때 caret/내용이 날아가던 버그 수정)
function TextCell({
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
  // 포커스 중이 아니면 표시값(comma 열이면 숫자에 쉼표)을 DOM에 반영
  useEffect(() => {
    const el = ref.current
    if (!el || document.activeElement === el) return
    const display = comma ? formatNumberHtml(html) : html
    if (el.innerHTML !== display) el.innerHTML = display
  }, [html, comma])
  return (
    <div
      ref={ref}
      className="b-table-cell"
      data-cell={cellKey}
      contentEditable={editable}
      suppressContentEditableWarning
      onClick={handleEditableLinkClick}
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
        onCommit(clean(el.innerHTML))
        // 편집 안 하고 빠져나오면 리렌더가 없을 수 있어, 표시 서식을 직접 되돌린다
        if (comma) {
          const display = formatNumberHtml(el.innerHTML)
          if (el.innerHTML !== display) el.innerHTML = display
        }
      }}
    />
  )
}

// 헤더 셀: 드래그 핸들(grip)로만 열 순서를 바꾼다 (이름 입력/메뉴 클릭과 충돌하지 않게)
function HeaderCell({
  col,
  c,
  editable,
  sortDir,
  filtered,
  onToggleMenu,
  onRename,
  menu,
}: {
  col: TableColumn
  c: number
  editable: boolean
  sortDir: 'asc' | 'desc' | null
  filtered: boolean
  onToggleMenu: () => void
  onRename: (name: string) => void
  menu: ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: col.id })
  return (
    <th
      ref={setNodeRef}
      className={`b-th${isDragging ? ' dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="b-th-inner">
        {editable && (
          <button className="b-th-drag" title="열 이동" {...attributes} {...listeners}>
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
          <button className="b-th-menu" title="열 옵션" onClick={onToggleMenu}>
            <ChevronDown size={13} />
          </button>
        )}
      </div>
      {menu}
    </th>
  )
}

interface MenuProps {
  col: TableColumn
  sortDir: 'asc' | 'desc' | null
  filter: string[] | string | undefined
  canDelete: boolean
  onSort: (dir: 'asc' | 'desc' | null) => void
  onTextFilter: (q: string) => void
  onToggleOpt: (optId: string) => void
  onConvert: (to: 'text' | 'select') => void
  onDeleteOption: (optId: string) => void
  onInsertColAfter: () => void
  onToggleComma: () => void
  onDeleteCol: () => void
}

function ColumnMenu({
  col,
  sortDir,
  filter,
  canDelete,
  onSort,
  onTextFilter,
  onToggleOpt,
  onConvert,
  onDeleteOption,
  onInsertColAfter,
  onToggleComma,
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
        {canDelete && (
          <button className="b-pop-item danger" onClick={onDeleteCol}>
            <Trash2 size={14} /> 열 삭제
          </button>
        )}
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
