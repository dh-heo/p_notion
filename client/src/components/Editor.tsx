import { useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent } from 'react'
import { Lock, LockOpen, ImagePlus, Smile, X } from 'lucide-react'
import { useStore } from '../store'
import { api } from '../api'
import {
  escapeHtml,
  isTableFile,
  parseDelimitedFile,
} from '../tableClipboard'
import { uid } from '../uid'
import { BlockList } from './BlockList'
import { EmojiPicker } from './EmojiPicker'

export function Editor() {
  const currentPageId = useStore((s) => s.currentPageId)
  const page = useStore((s) =>
    s.pages.find((p) => p.id === s.currentPageId)
  )
  const renamePage = useStore((s) => s.renamePage)
  const setPageIcon = useStore((s) => s.setPageIcon)
  const setPageCover = useStore((s) => s.setPageCover)
  const backlinks = useStore((s) => s.backlinks)
  const selectPage = useStore((s) => s.selectPage)
  const addBlockAtEnd = useStore((s) => s.addBlockAtEnd)
  const toggleLock = useStore((s) => s.toggleLock)
  const locked = useStore(
    (s) => !!(s.currentPageId && s.lockedPages[s.currentPageId])
  )
  const [fileOver, setFileOver] = useState(false)
  const [iconOpen, setIconOpen] = useState(false)
  const coverInputRef = useRef<HTMLInputElement>(null)

  const pickCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 같은 파일 다시 선택 가능하도록 초기화
    if (!file || !page) return
    try {
      const { src } = await api.uploadImage(file)
      setPageCover(page.id, src)
    } catch (err) {
      console.error('커버 업로드 실패:', err)
    }
  }

  const isFileDrag = (e: ReactDragEvent) =>
    Array.from(e.dataTransfer.types).includes('Files')

  const handleDrop = async (e: ReactDragEvent) => {
    if (locked || !isFileDrag(e)) return
    e.preventDefault()
    setFileOver(false)
    const files = Array.from(e.dataTransfer.files)
    for (const file of files) {
      try {
        // .csv/.tsv 파일은 업로드 대신 표 블록으로 변환
        if (isTableFile(file)) {
          const grid = parseDelimitedFile(file.name, await file.text())
          if (grid) {
            const columns = grid[0].map(() => ({
              id: uid(),
              name: '',
              type: 'text' as const,
            }))
            await addBlockAtEnd('table', {
              columns,
              cells: grid.map((row) => row.map(escapeHtml)),
            })
            continue
          }
          // 파싱 실패 시 아래 일반 파일 처리로 폴백
        }
        const meta = await api.uploadFile(file)
        if (file.type.startsWith('image/')) {
          await addBlockAtEnd('image', {
            src: meta.src,
            caption: '',
            width: null,
          })
        } else {
          await addBlockAtEnd('file', {
            src: meta.src,
            name: meta.name,
            size: meta.size,
          })
        }
      } catch (err) {
        console.error('파일 업로드 실패:', file.name, err)
      }
    }
  }

  if (!currentPageId || !page) {
    return (
      <main className="main">
        <div className="editor empty">페이지를 선택하거나 새로 만들어 보세요.</div>
      </main>
    )
  }

  return (
    <main className="main">
      <div
        className={`editor${fileOver ? ' file-over' : ''}`}
        onDragOver={(e) => {
          if (locked || !isFileDrag(e)) return
          e.preventDefault()
          setFileOver(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node))
            setFileOver(false)
        }}
        onDrop={handleDrop}
      >
        {page.cover && (
          <div className="page-cover">
            <img src={page.cover} alt="" />
            {!locked && (
              <div className="cover-actions">
                <button onClick={() => coverInputRef.current?.click()}>
                  변경
                </button>
                <button onClick={() => setPageCover(page.id, null)}>제거</button>
              </div>
            )}
          </div>
        )}
        <input
          type="file"
          accept="image/*"
          ref={coverInputRef}
          hidden
          onChange={pickCover}
        />
        <div className="editor-toolbar">
          <button
            className={`lock-toggle${locked ? ' locked' : ''}`}
            onClick={() => toggleLock(page.id)}
            title={locked ? '편집 잠금 해제' : '편집 잠금'}
          >
            {locked ? <Lock size={14} /> : <LockOpen size={14} />}
            {locked ? '잠금됨' : '편집 가능'}
          </button>
          {!locked && !page.cover && (
            <button
              className="page-meta-add"
              onClick={() => coverInputRef.current?.click()}
            >
              <ImagePlus size={14} /> 커버 추가
            </button>
          )}
          {!locked && !page.icon && (
            <button
              className="page-meta-add"
              onClick={() => setIconOpen((v) => !v)}
            >
              <Smile size={14} /> 아이콘 추가
            </button>
          )}
        </div>
        {page.icon && (
          <div className="page-icon-row">
            <button
              className="page-icon"
              disabled={locked}
              onClick={() => !locked && setIconOpen((v) => !v)}
              title={locked ? undefined : '아이콘 변경'}
            >
              {page.icon}
            </button>
            {!locked && (
              <button
                className="page-icon-clear"
                title="아이콘 제거"
                onClick={() => setPageIcon(page.id, null)}
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}
        {iconOpen && !locked && (
          <EmojiPicker
            hasIcon={!!page.icon}
            onPick={(emoji) => {
              setPageIcon(page.id, emoji)
              setIconOpen(false)
            }}
            onRemove={() => {
              setPageIcon(page.id, null)
              setIconOpen(false)
            }}
            onClose={() => setIconOpen(false)}
          />
        )}
        <input
          className="page-title"
          placeholder="제목 없음"
          value={page.title}
          readOnly={locked}
          onChange={(e) => renamePage(page.id, e.target.value)}
        />
        <BlockList key={currentPageId} />
        {backlinks.length > 0 && (
          <div className="backlinks">
            <div className="backlinks-title">이 페이지를 참조하는 곳</div>
            {backlinks.map((b) => (
              <button
                key={b.pageId}
                className="backlink-item"
                onClick={() => selectPage(b.pageId)}
              >
                <span className="backlink-icon">{b.icon ?? '📄'}</span>
                <span className="backlink-text">
                  <span className="backlink-title">{b.title || '제목 없음'}</span>
                  {b.snippet && (
                    <span className="backlink-snippet">{b.snippet}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
        {fileOver && (
          <div className="editor-drop-overlay">파일을 놓아 추가</div>
        )}
      </div>
    </main>
  )
}
