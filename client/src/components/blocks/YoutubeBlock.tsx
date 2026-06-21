import { useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { SquarePlay } from 'lucide-react'
import type { YoutubeContent } from '../../types'

// 다양한 YouTube 링크 형태에서 11자리 영상 id를 뽑는다 (없으면 null)
function parseYoutubeId(url: string): string | null {
  const u = url.trim()
  if (!u) return null
  const patterns = [
    /youtube\.com\/watch\?(?:.*&)?v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/embed\/([\w-]{11})/,
    /youtube\.com\/shorts\/([\w-]{11})/,
  ]
  for (const re of patterns) {
    const m = u.match(re)
    if (m) return m[1]
  }
  // id만 그대로 붙여넣은 경우
  return /^[\w-]{11}$/.test(u) ? u : null
}

interface Props {
  content: YoutubeContent
  onChange: (next: YoutubeContent) => void
  editable: boolean
}

export function YoutubeBlock({ content, onChange, editable }: Props) {
  const videoId = parseYoutubeId(content.url)
  const [editing, setEditing] = useState(!videoId)
  const [draft, setDraft] = useState(content.url)

  const commit = () => {
    onChange({ url: draft.trim() })
    setEditing(false)
  }

  if (editing || !videoId) {
    if (!editable) {
      return (
        <div className="b-yt-empty">
          <SquarePlay size={20} />
          <span>동영상 없음</span>
        </div>
      )
    }
    return (
      <div className="b-yt-empty">
        <SquarePlay size={20} />
        <input
          className="b-yt-input"
          placeholder="YouTube 링크 붙여넣기"
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Escape') {
              setDraft(content.url)
              setEditing(false)
            }
          }}
          onBlur={commit}
        />
      </div>
    )
  }

  return (
    <div className="b-yt">
      <div className="b-yt-frame">
        <iframe
          src={`https://www.youtube.com/embed/${videoId}`}
          title="YouTube"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      {editable && (
        <button
          className="b-yt-change"
          onClick={() => {
            setDraft(content.url)
            setEditing(true)
          }}
        >
          링크 변경
        </button>
      )}
    </div>
  )
}
