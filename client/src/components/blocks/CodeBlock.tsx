import { useEffect, useRef, useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { EditorState, Compartment } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  StreamLanguage,
} from '@codemirror/language'
import { python } from '@codemirror/lang-python'
import { html } from '@codemirror/lang-html'
import { markdown } from '@codemirror/lang-markdown'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { r } from '@codemirror/legacy-modes/mode/r'

// 선택 드롭다운 순서 = 정의 순서: bash, python, R, markdown, 그 외
const LANGS: Record<string, () => Extension> = {
  bash: () => StreamLanguage.define(shell),
  python: () => python(),
  r: () => StreamLanguage.define(r),
  markdown: () => markdown(),
  html: () => html(),
}

// 드롭다운 표시 라벨 (키와 다를 때만)
const LANG_LABELS: Record<string, string> = { r: 'R' }

// 마지막에 사용한 코드 언어 기억 (새 코드 블록의 기본값)
const LAST_LANG_KEY = 'pnotion:last-code-lang'
export function getLastCodeLang(): string {
  const v = localStorage.getItem(LAST_LANG_KEY)
  return v && v in LANGS ? v : 'bash'
}
function setLastCodeLang(lang: string) {
  localStorage.setItem(LAST_LANG_KEY, lang)
}

// 따뜻한 톤에 맞춘 가벼운 테마
const warmTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent', color: 'var(--text)', fontSize: '14px' },
  '.cm-content': {
    fontFamily: 'var(--font-mono)',
    padding: '14px 16px',
    caretColor: 'var(--accent)',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--text-faint)',
    border: 'none',
  },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'transparent' },
  '&.cm-focused': { outline: 'none' },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--accent-soft)',
  },
})

interface Props {
  code: string
  language: string
  onChange: (next: { code: string; language: string }) => void
  editable: boolean
}

export function CodeBlock({ code, language, onChange, editable }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const langComp = useRef(new Compartment())
  const editComp = useRef(new Compartment())
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const langRef = useRef(language)
  langRef.current = language
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!host.current) return
    const state = EditorState.create({
      doc: code,
      extensions: [
        lineNumbers(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        warmTheme,
        EditorView.lineWrapping,
        langComp.current.of((LANGS[language] ?? LANGS.bash)()),
        editComp.current.of(EditorView.editable.of(editable)),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            onChangeRef.current({
              code: u.state.doc.toString(),
              language: langRef.current,
            })
          }
        }),
      ],
    })
    const view = new EditorView({ state, parent: host.current })
    viewRef.current = view
    return () => view.destroy()
    // 마운트 시 1회만 생성 (code/language 갱신은 별도 처리)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 페이지 잠금 토글 시 편집 가능 여부 반영
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: editComp.current.reconfigure(EditorView.editable.of(editable)),
    })
  }, [editable])

  const changeLanguage = (lang: string) => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: langComp.current.reconfigure((LANGS[lang] ?? LANGS.bash)()),
    })
    setLastCodeLang(lang)
    onChange({ code: view.state.doc.toString(), language: lang })
  }

  const copy = async () => {
    const text = viewRef.current?.state.doc.toString() ?? code
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      /* 클립보드 권한 없음 등은 조용히 무시 */
    }
  }

  return (
    <div className="b-code">
      <div className="b-code-bar">
        <button
          className="b-code-copy"
          onClick={copy}
          title="클립보드에 복사"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? '복사됨' : '복사'}
        </button>
        <select
          value={language}
          onChange={(e) => changeLanguage(e.target.value)}
          className="b-code-lang"
        >
          {Object.keys(LANGS).map((l) => (
            <option key={l} value={l}>
              {LANG_LABELS[l] ?? l}
            </option>
          ))}
        </select>
      </div>
      <div ref={host} className="b-code-editor" />
    </div>
  )
}
