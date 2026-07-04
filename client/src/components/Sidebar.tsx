import { useState } from 'react'
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
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ChevronRight,
  Plus,
  FileText,
  Trash2,
  LogOut,
  RotateCcw,
  Search,
  X,
  PanelLeftClose,
} from 'lucide-react'
import { useStore } from '../store'
import type { Page } from '../types'

interface TreeNode extends Page {
  children: TreeNode[]
}

function buildTree(pages: Page[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  pages.forEach((p) => map.set(p.id, { ...p, children: [] }))
  const roots: TreeNode[] = []
  for (const p of pages) {
    const node = map.get(p.id)!
    const parent = p.parent_page_id ? map.get(p.parent_page_id) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  const sortRec = (arr: TreeNode[]) => {
    arr.sort((a, b) => a.sort_order - b.sort_order)
    arr.forEach((n) => sortRec(n.children))
  }
  sortRec(roots)
  return roots
}

// 계층(깊이)별로 살짝 다른 색의 왼쪽 바로 강조해 단계 구분을 돕는다 (최상위는 바 없음)
const DEPTH_COLORS = ['#b9603a', '#5b7553', '#3f6184', '#6b5b8a', '#b0392e']
function depthColor(depth: number): string | undefined {
  if (depth <= 0) return undefined
  return DEPTH_COLORS[(depth - 1) % DEPTH_COLORS.length]
}

function PageRow({ node, depth }: { node: TreeNode; depth: number }) {
  const currentPageId = useStore((s) => s.currentPageId)
  const selectPage = useStore((s) => s.selectPage)
  const addPage = useStore((s) => s.addPage)
  const deletePage = useStore((s) => s.deletePage)
  const [expanded, setExpanded] = useState(true)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: node.id })

  const hasChildren = node.children.length > 0

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <div
        className={`tree-row${currentPageId === node.id ? ' active' : ''}${
          isDragging ? ' dragging' : ''
        }`}
        style={{
          paddingLeft: 8 + depth * 16,
          boxShadow: depthColor(depth) ? `inset 3px 0 0 ${depthColor(depth)}` : undefined,
        }}
        onClick={() => selectPage(node.id)}
        {...attributes}
        {...listeners}
      >
        <button
          className={`tree-chevron${hasChildren ? '' : ' hidden'}`}
          onClick={(e) => {
            e.stopPropagation()
            setExpanded((v) => !v)
          }}
        >
          <ChevronRight
            size={14}
            style={{ transform: expanded ? 'rotate(90deg)' : 'none' }}
          />
        </button>
        {node.icon ? (
          <span className="tree-icon tree-emoji">{node.icon}</span>
        ) : (
          <FileText size={15} className="tree-icon" />
        )}
        <span className="tree-title">{node.title || '제목 없음'}</span>
        <span className="tree-actions">
          <button
            title="하위 페이지 추가"
            onClick={(e) => {
              e.stopPropagation()
              addPage(node.id)
              setExpanded(true)
            }}
          >
            <Plus size={14} />
          </button>
          <button
            title="삭제"
            onClick={(e) => {
              e.stopPropagation()
              if (confirm('이 페이지와 하위 페이지를 휴지통으로 보낼까요?'))
                deletePage(node.id)
            }}
          >
            <Trash2 size={14} />
          </button>
        </span>
      </div>
      {hasChildren && expanded && (
        <PageBranch nodes={node.children} depth={depth + 1} />
      )}
    </div>
  )
}

function PageBranch({ nodes, depth }: { nodes: TreeNode[]; depth: number }) {
  return (
    <SortableContext
      items={nodes.map((n) => n.id)}
      strategy={verticalListSortingStrategy}
    >
      {nodes.map((n) => (
        <PageRow key={n.id} node={n} depth={depth} />
      ))}
    </SortableContext>
  )
}

export function Sidebar() {
  const pages = useStore((s) => s.pages)
  const addPage = useStore((s) => s.addPage)
  const reorderPages = useStore((s) => s.reorderPages)
  const logout = useStore((s) => s.logout)
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed)
  const hideSidebar = useStore((s) => s.hideSidebar)
  const loadTrash = useStore((s) => s.loadTrash)
  const setSearchOpen = useStore((s) => s.setSearchOpen)
  const [trashOpen, setTrashOpen] = useState(false)

  const openTrash = () => {
    loadTrash()
    setTrashOpen(true)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const tree = buildTree(pages)

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const a = pages.find((p) => p.id === active.id)
    const o = pages.find((p) => p.id === over.id)
    if (!a || !o) return
    const parent = a.parent_page_id ?? null
    // 같은 부모(같은 레벨) 안에서만 재정렬
    if (parent !== (o.parent_page_id ?? null)) return
    const siblings = pages
      .filter((p) => (p.parent_page_id ?? null) === parent)
      .sort((x, y) => x.sort_order - y.sort_order)
    const ids = siblings.map((p) => p.id)
    const next = arrayMove(ids, ids.indexOf(a.id), ids.indexOf(o.id))
    reorderPages(next.map((id, i) => ({ id, sort_order: i, parent_id: parent })))
  }

  return (
    <aside
      className={`sidebar${sidebarOpen ? ' open' : ''}${
        sidebarCollapsed ? ' collapsed' : ''
      }`}
    >
      <div className="sidebar-header">
        <span className="sidebar-title">My Workspace</span>
        <button
          className="sidebar-new"
          title="검색 (⌘K)"
          onClick={() => setSearchOpen(true)}
        >
          <Search size={16} />
        </button>
        <button className="sidebar-new" title="사이드바 접기" onClick={hideSidebar}>
          <PanelLeftClose size={16} />
        </button>
        <button
          className="sidebar-new"
          title="새 페이지"
          onClick={() => addPage(null)}
        >
          <Plus size={16} />
        </button>
        <button className="sidebar-new" title="휴지통" onClick={openTrash}>
          <Trash2 size={16} />
        </button>
        <button className="sidebar-new" title="로그아웃" onClick={() => logout()}>
          <LogOut size={16} />
        </button>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <PageBranch nodes={tree} depth={0} />
      </DndContext>
      {trashOpen && <TrashModal onClose={() => setTrashOpen(false)} />}
    </aside>
  )
}

function TrashModal({ onClose }: { onClose: () => void }) {
  const trash = useStore((s) => s.trash)
  const restorePage = useStore((s) => s.restorePage)
  const purgePage = useStore((s) => s.purgePage)
  const emptyTrash = useStore((s) => s.emptyTrash)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal trash-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">휴지통</span>
          {trash.length > 0 && (
            <button
              className="trash-empty"
              onClick={() => {
                if (confirm('휴지통을 비우면 영구 삭제됩니다. 진행할까요?'))
                  emptyTrash()
              }}
            >
              비우기
            </button>
          )}
          <button className="modal-close" title="닫기" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        {trash.length === 0 ? (
          <div className="trash-empty-msg">휴지통이 비어 있습니다.</div>
        ) : (
          <ul className="trash-list">
            {trash.map((p) => (
              <li key={p.id} className="trash-item">
                <FileText size={14} className="tree-icon" />
                <span className="trash-item-title">{p.title || '제목 없음'}</span>
                <button
                  className="trash-action"
                  title="복원"
                  onClick={() => restorePage(p.id)}
                >
                  <RotateCcw size={14} />
                </button>
                <button
                  className="trash-action danger"
                  title="영구 삭제"
                  onClick={() => {
                    if (confirm('이 페이지를 영구 삭제할까요? (하위 페이지 포함)'))
                      purgePage(p.id)
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
