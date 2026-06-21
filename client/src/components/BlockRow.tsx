import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, GripVertical, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { RichText, isEmptyHtml } from './RichText'
import { escapeHtml } from '../tableClipboard'
import { SlashMenu } from './SlashMenu'
import type { SlashChoice } from './SlashMenu'
import { CodeBlock, getLastCodeLang } from './blocks/CodeBlock'
import { ImageBlock } from './blocks/ImageBlock'
import { FileBlock } from './blocks/FileBlock'
import { TableBlock } from './blocks/TableBlock'
import { YoutubeBlock } from './blocks/YoutubeBlock'
import { ToggleBlock } from './blocks/ToggleBlock'
import { BookmarkBlock } from './blocks/BookmarkBlock'
import { EquationBlock } from './blocks/EquationBlock'
import type {
  Block,
  BlockType,
  BookmarkContent,
  BulletContent,
  CodeContent,
  EquationContent,
  FileContent,
  HeadingContent,
  ImageContent,
  TableContent,
  ToggleContent,
  TodoContent,
  YoutubeContent,
} from '../types'

// 들여쓰기 단계별 불릿 마커 (3단계 순환)
const BULLET_MARKERS = ['•', '◦', '▪']

interface Props {
  block: Block
}

export function BlockRow({ block }: Props) {
  const updateContent = useStore((s) => s.updateContent)
  const convertBlock = useStore((s) => s.convertBlock)
  const addBlockAfter = useStore((s) => s.addBlockAfter)
  const deleteBlock = useStore((s) => s.deleteBlock)
  const mergeIntoPrev = useStore((s) => s.mergeIntoPrev)
  const setFocus = useStore((s) => s.setFocus)
  const focusId = useStore((s) => s.focusId)
  const focusAtStart = useStore((s) => s.focusAtStart)
  const blockCount = useStore((s) => s.blocks.length)
  const locked = useStore(
    (s) => !!(s.currentPageId && s.lockedPages[s.currentPageId])
  )
  const editable = !locked

  const [menuRect, setMenuRect] = useState<DOMRect | null>(null)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id })

  const id = block.id
  const html = (block.content as { html?: string }).html ?? ''
  const bulletIndent = (block.content as BulletContent).indent ?? 0

  // bullet 들여쓰기 단계 변경 (0~6)
  const setIndent = (dir: 1 | -1) => {
    const next = Math.max(0, Math.min(6, bulletIndent + dir))
    if (next !== bulletIndent)
      updateContent(id, { ...(block.content as BulletContent), indent: next })
  }

  // 텍스트 계열 블록 공통 핸들러
  const textProps = {
    html,
    editable,
    shouldFocus: focusId === id,
    focusAtStart,
    onFocusConsumed: () => setFocus(null),
    onInput: (next: string) =>
      updateContent(id, { ...block.content, html: next }),
    onEnter: (after: string, beforeEmpty: boolean) => {
      const t = block.type
      if ((t === 'bullet' || t === 'todo') && beforeEmpty && after === '') {
        // 들여쓴 빈 bullet은 문단 변환 대신 한 단계 내어쓰기
        if (t === 'bullet' && bulletIndent > 0) setIndent(-1)
        else convertBlock(id, 'paragraph', { html: '' })
        return
      }
      const newType: BlockType = t === 'bullet' || t === 'todo' ? t : 'paragraph'
      const content =
        newType === 'todo'
          ? { html: after, checked: false }
          : newType === 'bullet'
            ? { html: after, indent: bulletIndent }
            : { html: after }
      addBlockAfter(id, newType, content)
    },
    onBackspaceStart: (h: string, empty: boolean) => {
      const t = block.type
      // 들여쓴 bullet은 문단 변환 전에 먼저 내어쓰기
      if (t === 'bullet' && bulletIndent > 0) {
        setIndent(-1)
        return
      }
      if (
        t === 'heading' ||
        t === 'bullet' ||
        t === 'todo' ||
        t === 'quote' ||
        t === 'callout'
      ) {
        convertBlock(id, 'paragraph', { html: h })
        return
      }
      if (empty) deleteBlock(id)
      else mergeIntoPrev(id, h)
    },
    onSlash: (rect: DOMRect) => setMenuRect(rect),
    onMarkdown: (type: BlockType, level?: 1 | 2 | 3) => {
      if (type === 'heading') convertBlock(id, 'heading', { html: '', level: level ?? 1 })
      else if (type === 'divider') insertDivider()
      else convertBlock(id, type)
    },
    onPasteGrid: (grid: string[][]) => {
      const columns = grid[0].map(() => ({
        id: crypto.randomUUID(),
        name: '',
        type: 'text' as const,
      }))
      const content = { columns, cells: grid.map((row) => row.map(escapeHtml)) }
      // 빈 문단이면 그 자리를 표로 바꾸고, 아니면 아래에 표를 추가
      if (block.type === 'paragraph' && isEmptyHtml(html)) {
        convertBlock(id, 'table', content)
      } else {
        addBlockAfter(id, 'table', content)
      }
    },
  }

  const handleDelete = () => {
    // 마지막 한 블록이면 빈 문단으로 되돌려 입력을 이어갈 수 있게 한다
    if (blockCount <= 1) convertBlock(id, 'paragraph', { html: '' })
    else deleteBlock(id)
  }

  // 현재 블록을 구분선으로 바꾸고, 이어서 입력하도록 아래에 빈 문단을 만들어 포커스
  const insertDivider = () => {
    convertBlock(id, 'divider')
    addBlockAfter(id, 'paragraph')
  }

  const handleSlashSelect = (choice: SlashChoice) => {
    setMenuRect(null)
    if (choice.type === 'heading') {
      convertBlock(id, 'heading', { html: '', level: choice.level ?? 1 })
    } else if (choice.type === 'code') {
      convertBlock(id, 'code', { code: '', language: getLastCodeLang() })
    } else if (choice.type === 'divider') {
      insertDivider()
    } else {
      convertBlock(id, choice.type)
    }
  }

  const renderBlock = () => {
    switch (block.type) {
      case 'heading': {
        const c = block.content as HeadingContent
        return (
          <RichText
            {...textProps}
            className={`b-heading h${c.level}`}
            placeholder={`제목 ${c.level}`}
          />
        )
      }
      case 'bullet':
        return (
          <div
            className="b-bullet"
            style={{ marginLeft: bulletIndent * 24 }}
          >
            <span className="b-bullet-dot">
              {BULLET_MARKERS[bulletIndent % BULLET_MARKERS.length]}
            </span>
            <RichText
              {...textProps}
              onIndent={editable ? setIndent : undefined}
              className="b-text"
              placeholder="목록"
            />
          </div>
        )
      case 'todo': {
        const c = block.content as TodoContent
        return (
          <div className="b-todo">
            <input
              type="checkbox"
              checked={c.checked}
              disabled={locked}
              onChange={() => updateContent(id, { ...c, checked: !c.checked })}
            />
            <RichText
              {...textProps}
              className={`b-text${c.checked ? ' checked' : ''}`}
              placeholder="할 일"
            />
          </div>
        )
      }
      case 'code': {
        const c = block.content as CodeContent
        return (
          <CodeBlock
            code={c.code}
            language={c.language}
            editable={editable}
            onChange={(next) => updateContent(id, next)}
          />
        )
      }
      case 'image':
        return (
          <ImageBlock
            content={block.content as ImageContent}
            editable={editable}
            onChange={(next) => updateContent(id, next)}
          />
        )
      case 'file':
        return <FileBlock content={block.content as FileContent} />
      case 'divider':
        return <hr className="b-divider" />
      case 'quote':
        return (
          <blockquote className="b-quote">
            <RichText {...textProps} className="b-text" placeholder="인용" />
          </blockquote>
        )
      case 'callout':
        return (
          <div className="b-callout">
            <span className="b-callout-icon">💡</span>
            <RichText {...textProps} className="b-text" placeholder="콜아웃" />
          </div>
        )
      case 'youtube':
        return (
          <YoutubeBlock
            content={block.content as YoutubeContent}
            editable={editable}
            onChange={(next) => updateContent(id, next)}
          />
        )
      case 'table':
        return (
          <TableBlock
            content={block.content as TableContent}
            editable={editable}
            onChange={(next) => updateContent(id, next)}
          />
        )
      case 'toggle':
        return (
          <ToggleBlock
            content={block.content as ToggleContent}
            editable={editable}
            onChange={(next) => updateContent(id, next)}
          />
        )
      case 'bookmark':
        return (
          <BookmarkBlock
            content={block.content as BookmarkContent}
            editable={editable}
            onChange={(next) => updateContent(id, next)}
          />
        )
      case 'equation':
        return (
          <EquationBlock
            content={block.content as EquationContent}
            editable={editable}
            onChange={(next) => updateContent(id, next)}
          />
        )
      default:
        return <RichText {...textProps} className="b-paragraph" placeholder="" />
    }
  }

  return (
    <div
      ref={setNodeRef}
      className={`block-row${isDragging ? ' dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {editable && (
        <div className="block-gutter">
          <button
            className="gutter-btn"
            title="아래에 블록 추가"
            onClick={() => addBlockAfter(id)}
          >
            <Plus size={16} />
          </button>
          <button
            className="gutter-btn handle"
            title="드래그하여 이동"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={16} />
          </button>
          <button className="gutter-btn" title="블록 삭제" onClick={handleDelete}>
            <Trash2 size={16} />
          </button>
        </div>
      )}
      <div className="block-body">{renderBlock()}</div>
      {menuRect && (
        <SlashMenu
          rect={menuRect}
          onSelect={handleSlashSelect}
          onClose={() => {
            setMenuRect(null)
            setFocus(id)
          }}
        />
      )}
    </div>
  )
}
