import { useEffect, useRef, useState } from 'react'
import {
  Plus,
  Trash2,
  X,
  ArrowUpToLine,
  Download,
  EyeOff,
  Eye,
  Palette,
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
} from '@dnd-kit/sortable'
import {
  escapeHtml,
  gridToTSV,
  gridToCSV,
  gridToHtmlTable,
} from '../../tableClipboard'
import type { TableColumn, TableContent, TableOption } from '../../types'
import { uid } from '../../uid'
import type { MouseEvent as ReactMouseEvent, ClipboardEvent as ReactClipboardEvent } from 'react'
import {
  chip,
  bgColor,
  stripHtml,
  matchTerm,
  focusCellEl,
} from './table/tableShared'
import type { SortState, FilterState } from './table/tableShared'
import { TextCell } from './table/TextCell'
import { ColorSwatches } from './table/ColorSwatches'
import { HeaderCell } from './table/HeaderCell'
import { ColumnMenu } from './table/ColumnMenu'
interface Props {
  content: TableContent
  onChange: (next: TableContent) => void
  editable: boolean
}

export function TableBlock({ content, onChange, editable }: Props) {
  // cells/columns가 없는 손상·구버전 데이터도 크래시 없이 렌더되도록 방어적으로 읽는다
  const cells: string[][] = content.cells ?? []
  const rowColors: (number | null)[] = content.rowColors ?? []

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

  // 모든 변경은 이 헬퍼를 거쳐 rowColors 등 지정하지 않은 필드를 보존한다
  const commit = (next: {
    columns?: TableColumn[]
    cells?: string[][]
    rowColors?: (number | null)[]
  }) =>
    onChange({
      columns: next.columns ?? columns,
      cells: next.cells ?? cells,
      rowColors: next.rowColors ?? rowColors,
    })

  const [sort, setSort] = useState<SortState>(null)
  const [filters, setFilters] = useState<FilterState>({})
  // 열린 팝오버: 헤더 메뉴(열 id) / select 셀 편집({r, colId})
  const [menuCol, setMenuCol] = useState<string | null>(null)
  const [editCell, setEditCell] = useState<{ r: number; colId: string } | null>(
    null
  )
  const [draftOpt, setDraftOpt] = useState('')
  // 하단 "숨긴 열" 팝오버 열림 여부
  const [hiddenPop, setHiddenPop] = useState(false)
  // 행 배경색 팝오버가 열린 원본 행 인덱스
  const [colorRow, setColorRow] = useState<number | null>(null)

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
    setHiddenPop(false)
    setColorRow(null)
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
  // 헤더 행을 선택 좌표에 편입 (본문 행은 0.., 헤더 행은 -1)
  const HEADER_ROW = -1
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
  // 선택이 헤더 행(-1)까지 걸치면 열 이름 행을 맨 위에 함께 넣는다.
  const handleCopy = (e: ReactClipboardEvent) => {
    if (!multiSel || !selBox) return
    e.preventDefault()
    const rowsRange = Array.from(
      { length: selBox.r2 - selBox.r1 + 1 },
      (_, i) => selBox.r1 + i
    )
    const colIdx = Array.from(
      { length: selBox.c2 - selBox.c1 + 1 },
      (_, i) => selBox.c1 + i
    ).filter((c) => !columns[c].hidden) // 숨긴 열은 복사에서 제외 (exportCSV와 동일)
    const plain = rowsRange.map((vr) =>
      colIdx.map((c) =>
        vr === HEADER_ROW ? columns[c].name : cellText(viewRows[vr], columns[c], c)
      )
    )
    const html = rowsRange.map((vr) =>
      colIdx.map((c) =>
        vr === HEADER_ROW ? escapeHtml(columns[c].name) : cellHtml(viewRows[vr], columns[c], c)
      )
    )
    e.clipboardData.setData('text/plain', gridToTSV(plain))
    e.clipboardData.setData('text/html', gridToHtmlTable(html))
  }

  // 표 전체(머리글 + 모든 행)를 CSV 파일로 저장 — 숨긴 열은 제외
  const exportCSV = () => {
    const vis = columns.map((col, c) => ({ col, c })).filter(({ col }) => !col.hidden)
    const header = vis.map(({ col }) => col.name)
    const rows = cells.map((_, r) => vis.map(({ col, c }) => cellText(r, col, c)))
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
    commit({ cells: next })
  }
  const setSelectCell = (r: number, c: number, optionId: string) => {
    const next = cells.map((row) => row.slice())
    next[r][c] = optionId
    commit({ cells: next })
    setEditCell(null)
  }
  // rowColors를 원본 행 인덱스에 맞춰 재구성하는 헬퍼 (op 함수가 배열을 변형)
  const rebuildRowColors = (fn: (rc: (number | null)[]) => (number | null)[]) =>
    fn(cells.map((_, i) => rowColors[i] ?? null))
  const addRow = () => {
    commit({
      cells: [...cells, Array(columns.length).fill('')],
      rowColors: [...rebuildRowColors((rc) => rc), null],
    })
  }
  const insertRowBelow = (r: number) => {
    const next = cells.map((row) => row.slice())
    next.splice(r + 1, 0, Array(columns.length).fill(''))
    commit({
      cells: next,
      rowColors: rebuildRowColors((rc) => {
        rc.splice(r + 1, 0, null)
        return rc
      }),
    })
  }
  const deleteRow = (r: number) => {
    if (cells.length <= 1) return
    commit({
      cells: cells.filter((_, i) => i !== r),
      rowColors: rebuildRowColors((rc) => rc.filter((_, i) => i !== r)),
    })
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
    commit({
      columns: newCols,
      cells: cells.slice(1),
      rowColors: rebuildRowColors((rc) => rc.slice(1)),
    })
  }
  const addCol = () => {
    commit({
      columns: [...columns, { id: uid(), name: '', type: 'text' }],
      cells: cells.map((row) => [...row, '']),
    })
  }
  const insertColAfter = (c: number) => {
    const cols = columns.slice()
    cols.splice(c + 1, 0, { id: uid(), name: '', type: 'text' })
    commit({
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
    commit({
      columns: arrayMove(columns, from, to),
      cells: cells.map((row) => arrayMove(row, from, to)),
    })
  }
  const deleteCol = (c: number) => {
    if (columns.length <= 1) return
    commit({
      columns: columns.filter((_, i) => i !== c),
      cells: cells.map((row) => row.filter((_, i) => i !== c)),
    })
    closePops()
  }
  const renameCol = (c: number, name: string) => {
    commit({ columns: columns.map((col, i) => (i === c ? { ...col, name } : col)) })
  }
  // 열 숨김 / 다시 표시 (데이터는 그대로, hidden 플래그만 토글)
  const hideCol = (c: number) => {
    commit({
      columns: columns.map((col, i) => (i === c ? { ...col, hidden: true } : col)),
    })
    closePops()
  }
  // 지정한 원본 인덱스들의 열을 다시 표시 (헤더 사이 마커·하단 목록 공용)
  const showCols = (indices: number[]) => {
    const set = new Set(indices)
    commit({
      columns: columns.map((col, i) => (set.has(i) ? { ...col, hidden: false } : col)),
    })
  }
  // 숨긴 열을 모두 표시 (완전 원복구)
  const showAllCols = () => {
    commit({
      columns: columns.map((col) => (col.hidden ? { ...col, hidden: false } : col)),
    })
    setHiddenPop(false)
  }
  // 천 단위 쉼표 표시 토글 (text 열 전용, 메뉴는 열어 둔다)
  const toggleComma = (c: number) => {
    commit({
      columns: columns.map((col, i) => (i === c ? { ...col, comma: !col.comma } : col)),
    })
  }
  // 열 배경색 설정 (팔레트 인덱스, null = 없음). 메뉴는 열어 둔다.
  const setColBg = (c: number, bg: number | null) => {
    commit({
      columns: columns.map((col, i) =>
        i === c ? { ...col, bg: bg ?? undefined } : col
      ),
    })
  }
  // 행 배경색 설정 (원본 행 인덱스, null = 없음)
  const setRowBg = (r: number, bg: number | null) => {
    commit({
      rowColors: rebuildRowColors((rc) => {
        rc[r] = bg
        return rc
      }),
    })
  }
  // 셀에 적용할 배경색: 행 색이 우선, 없으면 열 색
  const bgFor = (r: number, c: number): string | undefined => {
    const rc = rowColors[r]
    if (rc != null) return bgColor(rc)
    const cb = columns[c]?.bg
    if (cb != null) return bgColor(cb)
    return undefined
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
    if (dir === 'left' || dir === 'right') {
      const step = dir === 'left' ? -1 : 1
      tc += step
      // 숨긴 열은 렌더되지 않으므로 건너뛴다
      while (tc >= 0 && tc < columns.length && columns[tc].hidden) tc += step
    } else if (dir === 'up') tvr -= 1
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
    commit({
      columns: cols,
      cells: rows,
      // 붙여넣기로 행이 늘어날 수 있으므로 rowColors를 새 행 수에 맞춰 채운다
      rowColors: rows.map((_, r) => rowColors[r] ?? null),
    })
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
      commit({
        columns: columns.map((x, i) => (i === c ? { ...x, type: 'select', options } : x)),
        cells: next,
      })
    } else {
      const next = cells.map((row) => {
        const copy = row.slice()
        copy[c] = escapeHtml(optionOf(col, row[c] ?? '')?.label ?? '')
        return copy
      })
      commit({
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
    commit({ columns: newCols, cells: next })
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
    commit({ columns: newCols, cells: next })
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

  // 렌더에는 숨기지 않은 열만 쓰되, 셀은 원본 인덱스로 저장되므로 원본 c를 함께 보존한다
  const withIndex = columns.map((col, c) => ({ col, c }))
  const visibleColumns = withIndex.filter(({ col }) => !col.hidden)
  const hiddenColumns = withIndex.filter(({ col }) => col.hidden)
  const canHide = visibleColumns.length > 1

  const anyPopOpen =
    menuCol !== null || editCell !== null || hiddenPop || colorRow !== null

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
                items={visibleColumns.map(({ col }) => col.id)}
                strategy={horizontalListSortingStrategy}
              >
                {visibleColumns.map(({ col, c }, i) => {
                  const sorted = sort?.colId === col.id ? sort.dir : null
                  const filtered = filters[col.id] != null
                  // 이 열 바로 앞(원본 순서상)에 숨겨진 열들 = 직전 보이는 열과 이 열 사이의 열들
                  const prevC = i > 0 ? visibleColumns[i - 1].c : -1
                  const gap = withIndex.slice(prevC + 1, c)
                  return (
                    <HeaderCell
                      key={col.id}
                      col={col}
                      c={c}
                      editable={editable}
                      sortDir={sorted}
                      filtered={filtered}
                      hiddenBefore={gap.map(({ col: h, c: hc }) => h.name || `열 ${hc + 1}`)}
                      selected={isSelected(HEADER_ROW, c)}
                      onShowGap={() => showCols(gap.map(({ c: hc }) => hc))}
                      onToggleMenu={() =>
                        setMenuCol((m) => (m === col.id ? null : col.id))
                      }
                      onRename={(name) => renameCol(c, name)}
                      onSelDown={(e) => onCellDown(HEADER_ROW, c, e)}
                      onSelEnter={(e) => onCellEnter(HEADER_ROW, c, e)}
                      menu={
                        menuCol === col.id ? (
                          <ColumnMenu
                            col={col}
                            sortDir={sorted}
                            filter={filters[col.id]}
                            canDelete={columns.length > 1}
                            canHide={canHide}
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
                            onSetBg={(bg) => setColBg(c, bg)}
                            onHideCol={() => hideCol(c)}
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
                    <button
                      className="b-row-color"
                      title="행 배경색"
                      onClick={() =>
                        setColorRow((cr) => (cr === r ? null : r))
                      }
                    >
                      <Palette size={13} />
                    </button>
                    {colorRow === r && (
                      <div
                        className="b-row-color-pop"
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <ColorSwatches
                          value={rowColors[r] ?? null}
                          onPick={(i) => {
                            setRowBg(r, i)
                            setColorRow(null)
                          }}
                        />
                      </div>
                    )}
                  </div>
                </td>
              )}
              {visibleColumns.map(({ col, c }) => (
                <td
                  key={col.id}
                  className={isSelected(vr, c) ? 'b-cell-selected' : undefined}
                  // 선택 하이라이트가 배경색을 덮도록 선택 중엔 인라인 배경을 넣지 않는다
                  style={isSelected(vr, c) ? undefined : { background: bgFor(r, c) }}
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
        {editable && hiddenColumns.length > 0 && (
          <div className="b-hidden-wrap">
            <button
              onClick={() => setHiddenPop((v) => !v)}
              title="숨긴 열 보기"
            >
              <EyeOff size={14} /> 숨긴 열 {hiddenColumns.length}
            </button>
            {hiddenPop && (
              <div
                className="b-hidden-pop"
                onMouseDown={(e) => e.stopPropagation()}
              >
                {hiddenColumns.map(({ col, c }) => (
                  <button
                    key={col.id}
                    className="b-pop-item"
                    onClick={() => showCols([c])}
                  >
                    <Eye size={14} /> {col.name || `열 ${c + 1}`}
                  </button>
                ))}
                <button className="b-pop-item b-pop-showall" onClick={showAllCols}>
                  <Eye size={14} /> 모두 보이기
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
