import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, GripVertical, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { RichText, isEmptyHtml } from './RichText'
import { escapeHtml } from '../tableClipboard'
import { uid } from '../uid'
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
  BlockContent,
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

// 슬래시 변환 시 기존 텍스트(html)를 그대로 보존해도 되는 블록 종류.
// 표/코드/이미지 등은 content 형태가 달라 html을 넣으면 렌더가 깨지므로 제외한다.
const HTML_KEEP_TYPES = new Set<BlockType>(['paragraph', 'quote', 'callout'])

// 캐럿이 있어 Enter로 아래 블록을 만들고 Backspace로 지울 수 있는 텍스트 계열 블록.
// 이 블록들은 gutter의 "+"/삭제가 키보드와 중복이라 드래그 핸들만 노출한다.
// 그 외(표/코드/이미지/구분선/토글 등)는 캐럿 진입점이 없어 "+"/삭제 버튼을 함께 노출한다.
const TEXT_BLOCK_TYPES = new Set<BlockType>([
  'paragraph',
  'heading',
  'bullet',
  'numbered',
  'todo',
  'quote',
  'callout',
])

interface Props {
  block: Block
  // numbered 블록일 때 표시할 항목 번호 (BlockList에서 계산)
  ordinal?: number
  // 블록 다중선택(드래그) 시 강조
  selected?: boolean
}

export function BlockRow({ block, ordinal, selected }: Props) {
  const updateContent = useStore((s) => s.updateContent)
  const convertBlock = useStore((s) => s.convertBlock)
  const addBlockAfter = useStore((s) => s.addBlockAfter)
  const insertBlocksAfter = useStore((s) => s.insertBlocksAfter)
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
    navId: id,
    shouldFocus: focusId === id,
    focusAtStart,
    onFocusConsumed: () => setFocus(null),
    onInput: (next: string) =>
      updateContent(id, { ...block.content, html: next }),
    onEnter: (after: string, beforeEmpty: boolean) => {
      const t = block.type
      if (
        (t === 'bullet' || t === 'todo' || t === 'numbered') &&
        beforeEmpty &&
        after === ''
      ) {
        // 들여쓴 빈 목록은 문단 변환 대신 한 단계 내어쓰기
        if ((t === 'bullet' || t === 'numbered') && bulletIndent > 0) setIndent(-1)
        else convertBlock(id, 'paragraph', { html: '' })
        return
      }
      const newType: BlockType =
        t === 'bullet' || t === 'todo' || t === 'numbered' ? t : 'paragraph'
      const content =
        newType === 'todo'
          ? { html: after, checked: false }
          : newType === 'bullet' || newType === 'numbered'
            ? { html: after, indent: bulletIndent }
            : { html: after }
      addBlockAfter(id, newType, content)
    },
    onBackspaceStart: (h: string, empty: boolean) => {
      const t = block.type
      // 들여쓴 목록은 문단 변환 전에 먼저 내어쓰기
      if ((t === 'bullet' || t === 'numbered') && bulletIndent > 0) {
        setIndent(-1)
        return
      }
      if (
        t === 'heading' ||
        t === 'bullet' ||
        t === 'numbered' ||
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
    onSlashSelect: (choice: SlashChoice, keepHtml: string) =>
      handleSlashSelect(choice, keepHtml),
    onMarkdown: (type: BlockType, level?: 1 | 2 | 3, keepHtml = '') => {
      if (type === 'heading') convertBlock(id, 'heading', { html: keepHtml, level: level ?? 1 })
      else if (type === 'divider') insertDivider()
      else if (type === 'todo') convertBlock(id, 'todo', { html: keepHtml, checked: false })
      else if (type === 'bullet' || type === 'numbered')
        convertBlock(id, type, { html: keepHtml, indent: 0 })
      else convertBlock(id, type, { html: keepHtml })
    },
    onPasteBlocks: (items: Array<{ type: BlockType; content: BlockContent }>) => {
      // 빈 문단에 붙여넣으면 첫 항목으로 교체하고 나머지는 아래에 삽입
      if (block.type === 'paragraph' && isEmptyHtml(html) && items.length) {
        convertBlock(id, items[0].type, items[0].content)
        if (items.length > 1) insertBlocksAfter(id, items.slice(1))
      } else {
        insertBlocksAfter(id, items)
      }
    },
    onPasteGrid: (grid: string[][]) => {
      const columns = grid[0].map(() => ({
        id: uid(),
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

  // keepHtml: 이미 작성된 행에서 맨 앞에 '/'를 쳐 슬래시 메뉴를 연 경우, 슬래시 뒤에 남아 있던 텍스트.
  // 텍스트 계열 블록은 이를 보존하고, 그 외(표/코드/이미지 등)는 defaultContent로 변환한다.
  const handleSlashSelect = (choice: SlashChoice, keepHtml = '') => {
    const t = choice.type
    if (t === 'heading') convertBlock(id, 'heading', { html: keepHtml, level: choice.level ?? 1 })
    else if (t === 'code') convertBlock(id, 'code', { code: '', language: getLastCodeLang() })
    else if (t === 'divider') insertDivider()
    else if (t === 'todo') convertBlock(id, 'todo', { html: keepHtml, checked: false })
    else if (t === 'bullet' || t === 'numbered') convertBlock(id, t, { html: keepHtml, indent: 0 })
    else if (HTML_KEEP_TYPES.has(t)) convertBlock(id, t, { html: keepHtml })
    else convertBlock(id, t)
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
      case 'numbered':
        return (
          <div className="b-numbered" style={{ marginLeft: bulletIndent * 24 }}>
            <span className="b-num-dot">{ordinal ?? 1}.</span>
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
      data-row-id={block.id}
      className={`block-row${isDragging ? ' dragging' : ''}${selected ? ' selected' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {editable && (
        <div className="block-gutter">
          {!TEXT_BLOCK_TYPES.has(block.type) && (
            <button
              className="gutter-btn"
              title="아래에 블록 추가"
              onClick={() => addBlockAfter(id)}
            >
              <Plus size={16} />
            </button>
          )}
          <button
            className="gutter-btn handle"
            title="드래그하여 이동"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={16} />
          </button>
          {!TEXT_BLOCK_TYPES.has(block.type) && (
            <button className="gutter-btn" title="블록 삭제" onClick={handleDelete}>
              <Trash2 size={16} />
            </button>
          )}
        </div>
      )}
      <div className="block-body">{renderBlock()}</div>
    </div>
  )
}
