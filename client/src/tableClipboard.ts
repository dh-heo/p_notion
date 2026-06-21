// 스프레드시트(엑셀/구글시트) 영역 붙여넣기 파싱.
// 클립보드의 text/html <table> 또는 text/plain TSV를 평문 2차원 배열로 변환한다.

export function escapeHtml(text: string): string {
  const d = document.createElement('div')
  d.textContent = text
  return d.innerHTML
}

// 모든 행을 가장 넓은 열 수에 맞춰 빈 칸으로 패딩 (사각형 보장)
function normalize(rows: string[][]): string[][] {
  const w = Math.max(...rows.map((r) => r.length))
  return rows.map((r) =>
    r.length < w ? [...r, ...Array(w - r.length).fill('')] : r
  )
}

function parseHtmlTable(html: string): string[][] | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const table = doc.querySelector('table')
  if (!table) return null
  const rows: string[][] = []
  table.querySelectorAll('tr').forEach((tr) => {
    const cells: string[] = []
    tr.querySelectorAll('td,th').forEach((td) =>
      cells.push((td.textContent ?? '').trim())
    )
    if (cells.length) rows.push(cells)
  })
  return rows.length ? normalize(rows) : null
}

function parseTsv(text: string): string[][] {
  const body = text.replace(/\r\n/g, '\n').replace(/\n+$/, '')
  return normalize(body.split('\n').map((line) => line.split('\t')))
}

// 붙여넣기 데이터가 표 영역이면 평문 2차원 배열, 아니면 null(=일반 붙여넣기).
// 단일 셀(1x1)은 표로 보지 않는다.
export function parseClipboardGrid(dt: DataTransfer | null): string[][] | null {
  if (!dt) return null
  let grid: string[][] | null = null
  const html = dt.getData('text/html')
  if (html) grid = parseHtmlTable(html)
  if (!grid) {
    const text = dt.getData('text/plain')
    if (text && /\t/.test(text)) grid = parseTsv(text)
  }
  if (!grid) return null
  if (grid.length === 1 && grid[0].length <= 1) return null
  return grid
}

// ----- 내보내기(직렬화) -----

// 구분자 형식에서 따옴표가 필요한 값을 감싼다 (RFC4180식: " -> "")
function quoteField(v: string, delim: string): string {
  return new RegExp(`[${delim === '\t' ? '\\t' : delim}"\\n\\r]`).test(v)
    ? `"${v.replace(/"/g, '""')}"`
    : v
}

// 평문 2차원 배열 -> 탭 구분(TSV). 엑셀 붙여넣기용 text/plain.
export function gridToTSV(grid: string[][]): string {
  return grid.map((row) => row.map((v) => quoteField(v, '\t')).join('\t')).join('\n')
}

// 평문 2차원 배열 -> CSV(쉼표 구분, CRLF). 엑셀 호환.
export function gridToCSV(grid: string[][]): string {
  return grid.map((row) => row.map((v) => quoteField(v, ',')).join(',')).join('\r\n')
}

// 셀 HTML 2차원 배열 -> <table>. 엑셀 붙여넣기용 text/html(서식 보존).
export function gridToHtmlTable(grid: string[][]): string {
  const body = grid
    .map((row) => `<tr>${row.map((h) => `<td>${h || '&nbsp;'}</td>`).join('')}</tr>`)
    .join('')
  return `<table>${body}</table>`
}

// ----- CSV/TSV 파일 드롭용 -----

export function isTableFile(file: File): boolean {
  const n = file.name.toLowerCase()
  return (
    n.endsWith('.csv') ||
    n.endsWith('.tsv') ||
    file.type === 'text/csv' ||
    file.type === 'text/tab-separated-values'
  )
}

// 구분자 기반(RFC4180식) 파서: 따옴표 안의 구분자/개행/이스케이프("") 처리
function parseDelimited(text: string, delim: string): string[][] {
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delim) {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  row.push(field)
  rows.push(row)
  // 파일 끝 개행으로 생긴 빈 행 제거
  while (rows.length && rows[rows.length - 1].every((c) => c === '')) rows.pop()
  return rows.length ? normalize(rows) : []
}

// 첫 비어있지 않은 줄에서 구분자 추정 (쉼표/세미콜론/탭)
function detectDelimiter(text: string): string {
  const line = text.split('\n').find((l) => l.trim() !== '') ?? ''
  const count = (re: RegExp) => (line.match(re) ?? []).length
  const tabs = count(/\t/g)
  const commas = count(/,/g)
  const semis = count(/;/g)
  if (tabs > 0 && tabs >= commas && tabs >= semis) return '\t'
  return semis > commas ? ';' : ','
}

// .csv/.tsv 파일 본문을 2차원 배열로. 표로 볼 수 없으면 null.
export function parseDelimitedFile(name: string, text: string): string[][] | null {
  const body = text.replace(/^\uFEFF/, '') // BOM 제거
  const delim = name.toLowerCase().endsWith('.tsv') ? '\t' : detectDelimiter(body)
  const grid = parseDelimited(body, delim)
  if (!grid.length || (grid.length === 1 && grid[0].length <= 1)) return null
  return grid
}
