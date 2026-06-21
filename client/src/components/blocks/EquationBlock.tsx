import { useState } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import type { EquationContent } from '../../types'

function render(latex: string): string {
  try {
    return katex.renderToString(latex, { displayMode: true, throwOnError: false })
  } catch {
    return latex
  }
}

export function EquationBlock({
  content,
  editable,
  onChange,
}: {
  content: EquationContent
  editable: boolean
  onChange: (next: EquationContent) => void
}) {
  const [editing, setEditing] = useState(editable && !content.latex)
  const [draft, setDraft] = useState(content.latex)

  if (editable && editing) {
    return (
      <div className="b-equation-edit">
        <textarea
          className="b-equation-input"
          value={draft}
          autoFocus
          placeholder="LaTeX 입력 (예: e = mc^2)"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            onChange({ latex: draft })
            setEditing(false)
          }}
        />
        <div
          className="b-equation-preview"
          dangerouslySetInnerHTML={{ __html: render(draft) }}
        />
      </div>
    )
  }

  return (
    <div
      className={`b-equation${editable ? ' editable' : ''}`}
      onClick={() => editable && setEditing(true)}
      dangerouslySetInnerHTML={{
        __html: content.latex
          ? render(content.latex)
          : '<span class="b-equation-empty">수식 (클릭하여 입력)</span>',
      }}
    />
  )
}
