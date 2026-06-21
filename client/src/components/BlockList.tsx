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
import { BlockRow } from './BlockRow'

export function BlockList() {
  const blocks = useStore((s) => s.blocks)
  const reorderBlocks = useStore((s) => s.reorderBlocks)

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
        {blocks.map((b) => (
          <BlockRow key={b.id} block={b} />
        ))}
      </SortableContext>
    </DndContext>
  )
}
