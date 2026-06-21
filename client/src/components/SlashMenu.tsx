import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode, KeyboardEvent as ReactKeyboardEvent } from 'react'
import {
  Type,
  Heading1,
  Heading2,
  Heading3,
  List,
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
}

const CHOICES: SlashChoice[] = [
  { type: 'paragraph', label: '텍스트', hint: '일반 문단', icon: <Type size={18} /> },
  { type: 'heading', level: 1, label: '제목 1', hint: '큰 제목', icon: <Heading1 size={18} /> },
  { type: 'heading', level: 2, label: '제목 2', hint: '중간 제목', icon: <Heading2 size={18} /> },
  { type: 'heading', level: 3, label: '제목 3', hint: '작은 제목', icon: <Heading3 size={18} /> },
  { type: 'bullet', label: '글머리 기호', hint: '불릿 목록', icon: <List size={18} /> },
  { type: 'todo', label: '할 일', hint: '체크박스', icon: <CheckSquare size={18} /> },
  { type: 'quote', label: '인용', hint: '인용구', icon: <Quote size={18} /> },
  { type: 'callout', label: '콜아웃', hint: '강조 박스', icon: <Lightbulb size={18} /> },
  { type: 'toggle', label: '토글', hint: '접고 펼치는 블록', icon: <ChevronRight size={18} /> },
  { type: 'bookmark', label: '북마크', hint: '링크 미리보기 카드', icon: <Bookmark size={18} /> },
  { type: 'equation', label: '수식', hint: 'LaTeX 수식', icon: <Sigma size={18} /> },
  { type: 'code', label: '코드', hint: '코드 블록', icon: <Code size={18} /> },
  { type: 'image', label: '이미지', hint: '업로드 / 붙여넣기', icon: <Image size={18} /> },
  { type: 'youtube', label: 'YouTube', hint: '링크로 동영상 임베드', icon: <SquarePlay size={18} /> },
  { type: 'divider', label: '구분선', hint: '가로 줄', icon: <Minus size={18} /> },
  { type: 'table', label: '표', hint: '간단한 표', icon: <Table size={18} /> },
]

interface Props {
  rect: DOMRect
  onSelect: (choice: SlashChoice) => void
  onClose: () => void
}

export function SlashMenu({ rect, onSelect, onClose }: Props) {
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState({ top: rect.bottom + 6, left: rect.left })
  const ref = useRef<HTMLDivElement>(null)

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
  }, [rect])

  useEffect(() => {
    ref.current?.focus()
  }, [])

  const handleKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (a + 1) % CHOICES.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a - 1 + CHOICES.length) % CHOICES.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onSelect(CHOICES[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div
      ref={ref}
      className="slash-menu"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      onBlur={onClose}
      style={{ top: pos.top, left: pos.left }}
    >
      {CHOICES.map((c, i) => (
        <button
          key={`${c.type}-${c.level ?? ''}`}
          className={`slash-item${i === active ? ' active' : ''}`}
          // onBlur(onClose)보다 먼저 실행되도록 mousedown 사용
          onMouseDown={(e) => {
            e.preventDefault()
            onSelect(c)
          }}
          onMouseEnter={() => setActive(i)}
        >
          <span className="slash-icon">{c.icon}</span>
          <span className="slash-text">
            <span className="slash-label">{c.label}</span>
            <span className="slash-hint">{c.hint}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
