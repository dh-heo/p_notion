import { useEffect, useRef } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { useStore } from '../store'
import { escapeHtml } from '../tableClipboard'
import { BlockRow } from './BlockRow'
import type { Block } from '../types'

// 같은 들여쓰기 단계의 연속된 numbered 블록끼리 1부터 번호를 매긴다.
// 더 깊은 단계는 건너뛰고, 더 얕은 단계나 비-numbered 블록을 만나면 끊는다.
function indentOf(b: Block): number {
  return (b.content as { indent?: number }).indent ?? 0
}
function computeOrdinal(blocks: Block[], index: number): number {
  const level = indentOf(blocks[index])
  let n = 1
  for (let i = index - 1; i >= 0; i--) {
    const b = blocks[i]
    if (b.type !== 'numbered') break
    const bl = indentOf(b)
    if (bl < level) break
    if (bl === level) n++
  }
  return n
}

function stripHtml(html: string): string {
  const d = document.createElement('div')
  d.innerHTML = html
  return d.textContent ?? ''
}

// Enter로 바로 다음 블록을 이어 쓸 수 있는 텍스트 블록들. 그 외(표/코드/이미지/구분선/토글 등)는
// 마지막에 오면 뒤에 이어 쓸 방법이 없으므로 빈 문단을 자동으로 덧붙인다.
const CONTINUABLE = new Set([
  'paragraph',
  'heading',
  'bullet',
  'numbered',
  'todo',
  'quote',
  'callout',
])

function isEmptyParagraph(b: Block): boolean {
  return b.type === 'paragraph' && !stripHtml((b.content as { html?: string }).html ?? '').trim()
}

// 다중선택된 블록들을 복사용 일반 텍스트로 직렬화 (문서 순서대로)
function selectedBlocksToText(blocks: Block[], ids: string[]): string {
  const idset = new Set(ids)
  const out: string[] = []
  blocks.forEach((b, i) => {
    if (!idset.has(b.id)) return
    const c = b.content as Record<string, unknown>
    switch (b.type) {
      case 'code':
        out.push((c.code as string) ?? '')
        break
      case 'divider':
        out.push('---')
        break
      case 'image':
        out.push((c.caption as string) ?? '')
        break
      case 'equation':
        out.push((c.latex as string) ?? '')
        break
      case 'bullet':
        out.push('• ' + stripHtml((c.html as string) ?? ''))
        break
      case 'numbered':
        out.push(`${computeOrdinal(blocks, i)}. ` + stripHtml((c.html as string) ?? ''))
        break
      case 'todo':
        out.push((c.checked ? '[x] ' : '[ ] ') + stripHtml((c.html as string) ?? ''))
        break
      case 'table':
        out.push(
          ((c.cells as string[][]) ?? [])
            .map((row) => row.map(stripHtml).join('\t'))
            .join('\n')
        )
        break
      default:
        out.push(stripHtml((c.html as string) ?? ''))
    }
  })
  return out.join('\n')
}

// 앱 내부 블록 복사/붙여넣기용: 선택 블록을 text/html에 마커로 끼워 넣는다.
// (커스텀 MIME 타입은 브라우저별 지원이 들쭉날쭉해 text/html 속성에 인코딩)
function selectedBlocksPayload(blocks: Block[], ids: string[]): string {
  const idset = new Set(ids)
  const items = blocks
    .filter((b) => idset.has(b.id))
    .map((b) => ({ type: b.type, content: b.content }))
  return encodeURIComponent(JSON.stringify(items))
}

export function BlockList() {
  const blocks = useStore((s) => s.blocks)
  const reorderBlocks = useStore((s) => s.reorderBlocks)
  const selectedBlockIds = useStore((s) => s.selectedBlockIds)
  const setSelectedBlocks = useStore((s) => s.setSelectedBlocks)
  const clearSelection = useStore((s) => s.clearSelection)
  const deleteBlocks = useStore((s) => s.deleteBlocks)
  const addBlockAtEnd = useStore((s) => s.addBlockAtEnd)
  const setFocus = useStore((s) => s.setFocus)
  const locked = useStore(
    (s) => !!(s.currentPageId && s.lockedPages[s.currentPageId])
  )

  // 마지막 블록이 이어 쓸 수 없는 블록(표/코드/이미지/구분선/토글 등)이면 끝에 빈 문단을 자동 추가
  const appendingRef = useRef(false)
  useEffect(() => {
    if (locked || appendingRef.current || blocks.length === 0) return
    const last = blocks[blocks.length - 1]
    if (CONTINUABLE.has(last.type)) return
    appendingRef.current = true
    Promise.resolve(addBlockAtEnd('paragraph')).finally(() => {
      appendingRef.current = false
    })
  }, [blocks, locked, addBlockAtEnd])

  // 블록 리스트 아래 빈 영역 클릭 → 끝의 빈 문단으로 포커스, 없으면 새 문단 생성
  const onTailClick = async () => {
    if (locked) return
    const last = blocks[blocks.length - 1]
    if (last && isEmptyParagraph(last)) {
      setFocus(last.id, true)
      return
    }
    const id = await addBlockAtEnd('paragraph')
    if (id) setFocus(id, true)
  }

  // 클릭과 드래그를 구분하기 위해 약간의 이동 후 드래그 시작
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  )

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = blocks.map((b) => b.id)
    const from = ids.indexOf(active.id as string)
    const to = ids.indexOf(over.id as string)
    reorderBlocks(arrayMove(ids, from, to))
  }

  // 블록을 가로질러 드래그하면 (단일 블록 안의 텍스트 선택이 아니라) 블록 단위로 선택
  const startRef = useRef<string | null>(null)
  const draggingRef = useRef(false)

  const rowIdAt = (target: EventTarget | null): string | null =>
    (target as HTMLElement | null)
      ?.closest?.('[data-row-id]')
      ?.getAttribute('data-row-id') ?? null

  const onMouseDown = (e: ReactMouseEvent) => {
    if (e.button !== 0) return
    // 거터(추가/드래그/삭제 버튼)는 dnd-kit이 처리하므로 제외
    if ((e.target as HTMLElement).closest('.block-gutter')) return
    startRef.current = rowIdAt(e.target)
    draggingRef.current = false
    clearSelection()

    const move = (ev: MouseEvent) => {
      if (ev.buttons !== 1 || !startRef.current) return
      const cur = rowIdAt(ev.target)
      if (!cur) return
      // 같은 블록 안에서는 (아직 드래그 모드가 아니면) 기본 텍스트 선택을 허용
      if (cur === startRef.current && !draggingRef.current) return
      if (!draggingRef.current) {
        draggingRef.current = true
        ;(document.activeElement as HTMLElement | null)?.blur?.()
        document.body.style.userSelect = 'none'
      }
      window.getSelection()?.removeAllRanges()
      const ids = blocks.map((b) => b.id)
      const a = ids.indexOf(startRef.current)
      const b = ids.indexOf(cur)
      const [lo, hi] = a <= b ? [a, b] : [b, a]
      setSelectedBlocks(ids.slice(lo, hi + 1))
    }
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      document.body.style.userSelect = ''
      startRef.current = null
      draggingRef.current = false
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  // 선택된 블록에 대한 키보드(삭제/Esc)와 복사 처리
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selectedBlockIds.length === 0) return
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        deleteBlocks(selectedBlockIds)
      } else if (e.key === 'Escape') {
        clearSelection()
      }
    }
    const onCopy = (e: ClipboardEvent) => {
      if (selectedBlockIds.length === 0) return
      e.preventDefault()
      const text = selectedBlocksToText(blocks, selectedBlockIds)
      e.clipboardData?.setData('text/plain', text)
      // 앱 내부 붙여넣기 시 블록 구조를 복원하기 위한 마커
      const payload = selectedBlocksPayload(blocks, selectedBlockIds)
      const htmlBody = escapeHtml(text).replace(/\n/g, '<br>')
      e.clipboardData?.setData(
        'text/html',
        `<div data-pnotion-blocks="${payload}">${htmlBody}</div>`
      )
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('copy', onCopy)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('copy', onCopy)
    }
  }, [selectedBlockIds, blocks, deleteBlocks, clearSelection])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={blocks.map((b) => b.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="block-list" onMouseDown={onMouseDown}>
          {blocks.map((b, i) => (
            <BlockRow
              key={b.id}
              block={b}
              ordinal={b.type === 'numbered' ? computeOrdinal(blocks, i) : undefined}
              selected={selectedBlockIds.includes(b.id)}
            />
          ))}
          {!locked && (
            <div className="block-list-tail" onClick={onTailClick} />
          )}
        </div>
      </SortableContext>
    </DndContext>
  )
}
