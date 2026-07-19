import { uid } from './uid'

export type BlockType =
  | 'paragraph'
  | 'heading'
  | 'bullet'
  | 'numbered'
  | 'todo'
  | 'code'
  | 'image'
  | 'file'
  | 'divider'
  | 'table'
  | 'youtube'
  | 'quote'
  | 'callout'
  | 'toggle'
  | 'bookmark'
  | 'equation'

export interface Page {
  id: string
  workspace_id: string
  parent_page_id: string | null
  title: string
  icon: string | null
  cover: string | null
  color: string | null
  sort_order: number
  created_at: number
  updated_at: number
}

// 블록 type별 content 형태
export interface ParagraphContent {
  html: string
}
export interface HeadingContent {
  html: string
  level: 1 | 2 | 3
}
export interface BulletContent {
  html: string
  // 들여쓰기 단계 (0 = 최상위). 계층적 목록 표현에 사용
  indent?: number
}
export interface NumberedContent {
  html: string
  // bullet과 동일한 들여쓰기 단계 (번호는 같은 단계끼리 매겨짐)
  indent?: number
}
export interface TodoContent {
  html: string
  checked: boolean
}
export interface CodeContent {
  code: string
  language: string
}
export interface ImageContent {
  src: string
  caption: string
  width: number | null
}
export interface FileContent {
  src: string
  name: string
  size: number
}
export interface YoutubeContent {
  // 사용자가 입력한 원본 링크 (영상 id는 렌더 시 파싱)
  url: string
}
export interface QuoteContent {
  html: string
}
export interface CalloutContent {
  html: string
}
export interface ToggleContent {
  // html = 토글 제목, body = 펼쳤을 때 본문 (둘 다 HTML)
  html: string
  body: string
  collapsed?: boolean
}
export interface BookmarkContent {
  url: string
  title: string
  description: string
  image: string
}
export interface EquationContent {
  latex: string
}
export type DividerContent = Record<string, never>
// 범주형(select) 열의 선택지. color는 칩 팔레트 인덱스.
export interface TableOption {
  id: string
  label: string
  color: number
}
export interface TableColumn {
  id: string
  name: string
  type: 'text' | 'select'
  options?: TableOption[]
  // text 열 전용: 숫자 셀을 1000단위 쉼표로 표시 (저장값은 원본 그대로)
  comma?: boolean
  // 열 숨김: 데이터는 유지한 채 렌더링에서만 제외 (하단 "숨긴 열"에서 다시 표시)
  hidden?: boolean
  // 열 배경색 팔레트 인덱스 (undefined = 없음). 행 배경색(rowColors)이 우선한다.
  bg?: number
}
export interface TableContent {
  // text 셀은 HTML 문자열, select 셀은 옵션 id를 담는다 (빈 문자열 = 미지정)
  cells: string[][]
  columns?: TableColumn[]
  // 행별 배경색 팔레트 인덱스 (원본 행 인덱스 기준, null = 없음). 열 배경색보다 우선한다.
  rowColors?: (number | null)[]
}

export type BlockContent =
  | ParagraphContent
  | HeadingContent
  | BulletContent
  | NumberedContent
  | TodoContent
  | CodeContent
  | ImageContent
  | FileContent
  | DividerContent
  | TableContent
  | YoutubeContent
  | QuoteContent
  | CalloutContent
  | ToggleContent
  | BookmarkContent
  | EquationContent

export interface Block {
  id: string
  page_id: string
  parent_block_id: string | null
  type: BlockType
  content: BlockContent
  sort_order: number
  created_at: number
  updated_at: number
}

export function defaultContent(type: BlockType): BlockContent {
  switch (type) {
    case 'heading':
      return { html: '', level: 1 }
    case 'todo':
      return { html: '', checked: false }
    case 'code':
      return { code: '', language: 'bash' }
    case 'image':
      return { src: '', caption: '', width: null }
    case 'file':
      return { src: '', name: '', size: 0 }
    case 'divider':
      return {}
    case 'youtube':
      return { url: '' }
    case 'toggle':
      return { html: '', body: '', collapsed: false }
    case 'bookmark':
      return { url: '', title: '', description: '', image: '' }
    case 'equation':
      return { latex: '' }
    case 'table':
      return {
        columns: [
          { id: uid(), name: '', type: 'text' },
          { id: uid(), name: '', type: 'text' },
        ],
        cells: [
          ['', ''],
          ['', ''],
        ],
      }
    default:
      return { html: '' }
  }
}
