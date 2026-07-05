import { useEffect, useRef, useState } from 'react'
import { PageIcon } from './PageIcon'
import type { Page } from '../types'

// '[[' 페이지 멘션 자동완성 메뉴 (포커스를 뺏지 않는 표시 전용 — 키보드는 RichText가 처리)
export function MentionMenu({
  rect,
  cands,
  active,
  onHover,
  onPick,
}: {
  rect: DOMRect
  cands: Page[]
  active: number
  onHover: (i: number) => void
  onPick: (p: Page) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: rect.bottom + 6, left: rect.left })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const margin = 8
    const { offsetHeight: h, offsetWidth: w } = el
    const top =
      window.innerHeight - rect.bottom < h + margin
        ? Math.max(margin, rect.top - h - 6)
        : rect.bottom + 6
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - w - margin))
    setPos({ top, left })
  }, [rect, cands.length])

  return (
    <div className="mention-menu" ref={ref} style={{ top: pos.top, left: pos.left }}>
      {cands.length === 0 ? (
        <div className="mention-empty">일치하는 페이지 없음</div>
      ) : (
        cands.map((p, i) => (
          <button
            key={p.id}
            className={`mention-item${i === active ? ' active' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault()
              onPick(p)
            }}
            onMouseEnter={() => onHover(i)}
          >
            <span className="mention-item-icon">
              {p.icon ? <PageIcon icon={p.icon} size={16} /> : '📄'}
            </span>
            <span className="mention-item-title">{p.title || '제목 없음'}</span>
          </button>
        ))
      )}
    </div>
  )
}
