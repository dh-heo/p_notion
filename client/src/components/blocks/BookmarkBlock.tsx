import { useState } from 'react'
import { X } from 'lucide-react'
import { api } from '../../api'
import type { BookmarkContent } from '../../types'

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

export function BookmarkBlock({
  content,
  editable,
  onChange,
}: {
  content: BookmarkContent
  editable: boolean
  onChange: (next: BookmarkContent) => void
}) {
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)

  const load = async (url: string) => {
    const u = url.trim()
    if (!u) return
    setLoading(true)
    try {
      onChange(await api.fetchBookmark(u))
    } catch (err) {
      console.error('북마크 불러오기 실패:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!content.url) {
    if (!editable) return null
    return (
      <div className="b-bookmark-input">
        <input
          value={draft}
          placeholder="링크 URL 붙여넣고 Enter"
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              load(draft)
            }
          }}
        />
        {loading && <span className="b-bookmark-loading">불러오는 중…</span>}
      </div>
    )
  }

  return (
    <div className="b-bookmark-wrap">
      <a
        className="b-bookmark"
        href={content.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        <div className="b-bookmark-text">
          <div className="b-bookmark-title">{content.title || content.url}</div>
          {content.description && (
            <div className="b-bookmark-desc">{content.description}</div>
          )}
          <div className="b-bookmark-url">{hostOf(content.url)}</div>
        </div>
        {content.image && (
          <img className="b-bookmark-img" src={content.image} alt="" />
        )}
      </a>
      {editable && (
        <button
          className="b-bookmark-clear"
          title="다시 입력"
          onClick={() =>
            onChange({ url: '', title: '', description: '', image: '' })
          }
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
