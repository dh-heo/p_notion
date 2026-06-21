import { ChevronRight } from 'lucide-react'
import { RichText } from '../RichText'
import type { ToggleContent } from '../../types'

// 간단형 토글: 제목 + 펼침/접힘 본문(하나의 리치텍스트). 자식 블록 중첩은 없음.
export function ToggleBlock({
  content,
  editable,
  onChange,
}: {
  content: ToggleContent
  editable: boolean
  onChange: (next: ToggleContent) => void
}) {
  const collapsed = content.collapsed ?? false
  return (
    <div className="b-toggle">
      <div className="b-toggle-head">
        <button
          className="b-toggle-caret"
          title={collapsed ? '펼치기' : '접기'}
          onClick={() => onChange({ ...content, collapsed: !collapsed })}
        >
          <ChevronRight
            size={16}
            style={{ transform: collapsed ? 'none' : 'rotate(90deg)' }}
          />
        </button>
        <RichText
          html={content.html}
          editable={editable}
          className="b-text b-toggle-title"
          placeholder="토글 제목"
          onInput={(h) => onChange({ ...content, html: h })}
        />
      </div>
      {!collapsed && (
        <div className="b-toggle-body">
          <RichText
            html={content.body}
            editable={editable}
            className="b-text"
            placeholder="내용 (비어 있음)"
            onInput={(h) => onChange({ ...content, body: h })}
          />
        </div>
      )}
    </div>
  )
}
