import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Type,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Code,
  Image,
  Minus,
  Table,
  SquarePlay,
  Quote,
  Lightbulb,
  ChevronRight,
  Bookmark,
  Sigma,
} from 'lucide-react'
import type { BlockType } from '../types'

export interface SlashChoice {
  type: BlockType
  level?: 1 | 2 | 3
  label: string
  hint: string
  icon: ReactNode
  // 타이핑 필터용 영문/별칭 키워드 (한글은 label/hint로 매칭됨)
  keywords: string
}

const CHOICES: SlashChoice[] = [
  { type: 'paragraph', label: '텍스트', hint: '일반 문단', icon: <Type size={18} />, keywords: 'text paragraph p' },
  { type: 'heading', level: 1, label: '제목 1', hint: '큰 제목', icon: <Heading1 size={18} />, keywords: 'heading h1 title' },
  { type: 'heading', level: 2, label: '제목 2', hint: '중간 제목', icon: <Heading2 size={18} />, keywords: 'heading h2 title' },
  { type: 'heading', level: 3, label: '제목 3', hint: '작은 제목', icon: <Heading3 size={18} />, keywords: 'heading h3 title' },
  { type: 'bullet', label: '글머리 기호', hint: '불릿 목록', icon: <List size={18} />, keywords: 'bullet list ul' },
  { type: 'numbered', label: '번호 매기기 목록', hint: '숫자 목록', icon: <ListOrdered size={18} />, keywords: 'numbered ordered list ol number' },
  { type: 'todo', label: '할 일', hint: '체크박스', icon: <CheckSquare size={18} />, keywords: 'todo check checkbox task' },
  { type: 'quote', label: '인용', hint: '인용구', icon: <Quote size={18} />, keywords: 'quote' },
  { type: 'callout', label: '콜아웃', hint: '강조 박스', icon: <Lightbulb size={18} />, keywords: 'callout' },
  { type: 'toggle', label: '토글', hint: '접고 펼치는 블록', icon: <ChevronRight size={18} />, keywords: 'toggle collapse' },
  { type: 'bookmark', label: '북마크', hint: '링크 미리보기 카드', icon: <Bookmark size={18} />, keywords: 'bookmark link' },
  { type: 'equation', label: '수식', hint: 'LaTeX 수식', icon: <Sigma size={18} />, keywords: 'equation latex math' },
  { type: 'code', label: '코드', hint: '코드 블록', icon: <Code size={18} />, keywords: 'code' },
  { type: 'image', label: '이미지', hint: '업로드 / 붙여넣기', icon: <Image size={18} />, keywords: 'image img picture' },
  { type: 'youtube', label: 'YouTube', hint: '링크로 동영상 임베드', icon: <SquarePlay size={18} />, keywords: 'youtube video' },
  { type: 'divider', label: '구분선', hint: '가로 줄', icon: <Minus size={18} />, keywords: 'divider hr line' },
  { type: 'table', label: '표', hint: '간단한 표', icon: <Table size={18} />, keywords: 'table grid' },
]

// 슬래시 뒤에 입력한 질의로 후보를 필터링한다 (빈 질의는 전체)
export function filterSlashChoices(query: string): SlashChoice[] {
  const q = query.trim().toLowerCase()
  if (!q) return CHOICES
  return CHOICES.filter((c) =>
    `${c.label} ${c.hint} ${c.type} ${c.keywords}`.toLowerCase().includes(q)
  )
}

interface Props {
  rect: DOMRect
  choices: SlashChoice[]
  active: number
  onHover: (i: number) => void
  onPick: (choice: SlashChoice) => void
}

// 슬래시 메뉴 (포커스를 뺏지 않는 표시 전용 — 키보드는 RichText가 처리)
export function SlashMenu({ rect, choices, active, onHover, onPick }: Props) {
  const [pos, setPos] = useState({ top: rect.bottom + 6, left: rect.left })
  const ref = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  // 실제 렌더 크기를 측정해, 아래 공간이 부족하면 캐럿 위로 띄운다
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const margin = 8
    const { offsetHeight: h, offsetWidth: w } = el
    const below = rect.bottom + 6
    const top =
      window.innerHeight - rect.bottom < h + margin
        ? Math.max(margin, rect.top - h - 6)
        : below
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - w - margin))
    setPos({ top, left })
  }, [rect, choices.length])

  // 화살표로 선택이 이동하면 해당 항목을 메뉴 스크롤 영역 안으로 보이게 한다
  useEffect(() => {
    itemRefs.current[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])

  return (
    <div ref={ref} className="slash-menu" style={{ top: pos.top, left: pos.left }}>
      {choices.length === 0 ? (
        <div className="mention-empty">일치하는 블록 없음</div>
      ) : (
        choices.map((c, i) => (
          <button
            key={`${c.type}-${c.level ?? ''}`}
            ref={(el) => {
              itemRefs.current[i] = el
            }}
            className={`slash-item${i === active ? ' active' : ''}`}
            // onBlur 등보다 먼저 실행되도록 mousedown 사용
            onMouseDown={(e) => {
              e.preventDefault()
              onPick(c)
            }}
            onMouseEnter={() => onHover(i)}
          >
            <span className="slash-icon">{c.icon}</span>
            <span className="slash-text">
              <span className="slash-label">{c.label}</span>
              <span className="slash-hint">{c.hint}</span>
            </span>
          </button>
        ))
      )}
    </div>
  )
}
