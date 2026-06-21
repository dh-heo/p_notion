import { useEffect, useRef, useState } from 'react'
import { Search, FileText } from 'lucide-react'
import { useStore } from '../store'
import { api } from '../api'

type Hit = {
  pageId: string
  title: string
  icon: string | null
  snippet: string
}

export function SearchModal({ onClose }: { onClose: () => void }) {
  const selectPage = useStore((s) => s.selectPage)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  // 입력 디바운스 검색 (빈 입력이면 결과 목록 자체를 숨기므로 상태를 비울 필요 없음)
  useEffect(() => {
    const term = q.trim()
    if (!term) return
    const t = setTimeout(async () => {
      try {
        const res = await api.search(term)
        setHits(res)
        setActive(0)
      } catch (err) {
        console.error('검색 실패:', err)
      }
    }, 180)
    return () => clearTimeout(t)
  }, [q])

  const open = (pageId: string) => {
    selectPage(pageId)
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, hits.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' && hits[active]) {
      e.preventDefault()
      open(hits[active].pageId)
    }
  }

  // 활성 항목이 보이도록 스크롤
  useEffect(() => {
    const el = listRef.current?.children[active] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal search-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="search-input-row">
          <Search size={16} className="search-icon" />
          <input
            className="search-input"
            placeholder="페이지·내용 검색"
            value={q}
            autoFocus
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {q.trim() && (
          <ul className="search-list" ref={listRef}>
            {hits.length === 0 ? (
              <li className="search-empty">결과 없음</li>
            ) : (
              hits.map((h, i) => (
                <li
                  key={h.pageId}
                  className={`search-item${i === active ? ' active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => open(h.pageId)}
                >
                  {h.icon ? (
                    <span className="search-item-icon">{h.icon}</span>
                  ) : (
                    <FileText size={15} className="search-item-icon" />
                  )}
                  <span className="search-item-text">
                    <span className="search-item-title">
                      {h.title || '제목 없음'}
                    </span>
                    {h.snippet && (
                      <span className="search-item-snippet">{h.snippet}</span>
                    )}
                  </span>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  )
}
