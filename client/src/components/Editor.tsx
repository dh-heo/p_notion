import { useState } from 'react'
import type { DragEvent as ReactDragEvent } from 'react'
import { Lock, LockOpen, Smile } from 'lucide-react'
import { useStore } from '../store'
import { api } from '../api'
import {
  escapeHtml,
  isTableFile,
  parseDelimitedFile,
} from '../tableClipboard'
import { uid } from '../uid'
import { BlockList } from './BlockList'
import { IconPicker } from './IconPicker'
import { PageIcon } from './PageIcon'

export function Editor() {
  const currentPageId = useStore((s) => s.currentPageId)
  const page = useStore((s) =>
    s.pages.find((p) => p.id === s.currentPageId)
  )
  const renamePage = useStore((s) => s.renamePage)
  const setPageIcon = useStore((s) => s.setPageIcon)
  const setFocus = useStore((s) => s.setFocus)
  const blocks = useStore((s) => s.blocks)
  const backlinks = useStore((s) => s.backlinks)
  const selectPage = useStore((s) => s.selectPage)
  const addBlockAtEnd = useStore((s) => s.addBlockAtEnd)
  const ensureTrailingEmpty = useStore((s) => s.ensureTrailingEmpty)
  const toggleLock = useStore((s) => s.toggleLock)
  const locked = useStore(
    (s) => !!(s.currentPageId && s.lockedPages[s.currentPageId])
  )
  const [fileOver, setFileOver] = useState(false)
  const [iconOpen, setIconOpen] = useState(false)

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
    // 드롭한 파일들이 이미지/파일 블록으로 끝났으면 끝에 빈 문단을 보장
    await ensureTrailingEmpty()
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
        <div className="editor-toolbar">
          <button
            className={`lock-toggle${locked ? ' locked' : ''}`}
            onClick={() => toggleLock(page.id)}
            title={locked ? '편집 잠금 해제' : '편집 잠금'}
          >
            {locked ? <Lock size={14} /> : <LockOpen size={14} />}
            {locked ? '잠금됨' : '편집 가능'}
          </button>
          {!locked && (
            <button
              className="page-meta-add"
              onClick={() => setIconOpen((v) => !v)}
            >
              <Smile size={14} /> {page.icon ? '아이콘 변경' : '아이콘 추가'}
            </button>
          )}
        </div>
        {iconOpen && !locked && (
          <IconPicker
            hasIcon={!!page.icon}
            onPick={(value) => {
              setPageIcon(page.id, value)
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
          onKeyDown={(e) => {
            // 제목에서 Enter → 본문 첫 블록으로 커서 이동
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              if (blocks.length) setFocus(blocks[0].id, true)
            }
          }}
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
                <span className="backlink-icon">
                  {b.icon ? <PageIcon icon={b.icon} size={16} /> : '📄'}
                </span>
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
