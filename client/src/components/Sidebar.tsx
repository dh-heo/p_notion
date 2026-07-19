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
import { PageIcon } from './PageIcon'
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

// 접어둔(펼치지 않은) 페이지 id를 localStorage에 저장해 새로고침 후에도 폴딩 상태를 유지한다.
// 기본값은 펼침이므로 "접힌" id만 저장한다.
const COLLAPSED_KEY = 'pnotion:collapsed-pages'
function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY)
    return new Set<string>(raw ? JSON.parse(raw) : [])
  } catch {
    return new Set<string>()
  }
}
function persistExpanded(id: string, expanded: boolean) {
  const set = loadCollapsed()
  if (expanded) set.delete(id)
  else set.add(id)
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...set]))
}

// 최상위(루트) 페이지에만 왼쪽 색 바를 붙여 최상위 계층을 구분한다 (하위는 바 없음)
const ROOT_BAR_COLOR = '#b9603a'
function depthColor(depth: number): string | undefined {
  return depth === 0 ? ROOT_BAR_COLOR : undefined
}

// 페이지 제목 왼쪽에 붙이는 색상 플래그 팔레트 (우클릭 메뉴에서 지정)
const FLAG_COLORS: { label: string; value: string }[] = [
  { label: '빨강', value: '#c0392b' },
  { label: '주황', value: '#c9702e' },
  { label: '노랑', value: '#c9a227' },
  { label: '초록', value: '#4f8a4f' },
  { label: '파랑', value: '#3f6184' },
  { label: '보라', value: '#7a5aa0' },
  { label: '분홍', value: '#c65d8a' },
]

function PageRow({ node, depth }: { node: TreeNode; depth: number }) {
  const currentPageId = useStore((s) => s.currentPageId)
  const selectPage = useStore((s) => s.selectPage)
  const addPage = useStore((s) => s.addPage)
  const deletePage = useStore((s) => s.deletePage)
  const setPageColor = useStore((s) => s.setPageColor)
  const [expanded, setExpanded] = useState(() => !loadCollapsed().has(node.id))
  // 우클릭 색상 메뉴 위치 (null = 닫힘)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

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
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY })
        }}
        {...attributes}
        {...listeners}
      >
        <button
          className={`tree-chevron${hasChildren ? '' : ' hidden'}`}
          onClick={(e) => {
            e.stopPropagation()
            setExpanded((v) => {
              persistExpanded(node.id, !v)
              return !v
            })
          }}
        >
          <ChevronRight
            size={14}
            style={{ transform: expanded ? 'rotate(90deg)' : 'none' }}
          />
        </button>
        {node.icon ? (
          <span className="tree-icon tree-emoji">
            <PageIcon icon={node.icon} size={15} />
          </span>
        ) : (
          <FileText size={15} className="tree-icon" />
        )}
        {node.color && (
          <span className="tree-flag" style={{ background: node.color }} />
        )}
        <span className="tree-title">{node.title || '제목 없음'}</span>
        <span className="tree-actions">
          <button
            title="하위 페이지 추가"
            onClick={(e) => {
              e.stopPropagation()
              addPage(node.id)
              persistExpanded(node.id, true)
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
      {menu && (
        <>
          <div className="ctx-backdrop" onClick={() => setMenu(null)} />
          <div
            className="ctx-menu"
            style={{ top: menu.y, left: menu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ctx-swatches">
              {FLAG_COLORS.map((c) => (
                <button
                  key={c.value}
                  className="ctx-swatch"
                  style={{ background: c.value }}
                  title={c.label}
                  onClick={() => {
                    setPageColor(node.id, c.value)
                    setMenu(null)
                  }}
                />
              ))}
            </div>
            <button
              className="ctx-item"
              onClick={() => {
                setPageColor(node.id, null)
                setMenu(null)
              }}
            >
              색상 제거
            </button>
          </div>
        </>
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
          title="새 페이지"
          onClick={() => addPage(null)}
        >
          <Plus size={16} />
        </button>
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
        <button className="sidebar-new" title="휴지통" onClick={openTrash}>
          <Trash2 size={16} />
        </button>
        <button className="sidebar-new" title="로그아웃" onClick={() => logout()}>
          <LogOut size={16} />
        </button>
      </div>
      <RecentSection />
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

// 가장 최근에 수정된 5개 페이지를 사이드바 상단에 따로 보여준다
function RecentSection() {
  const pages = useStore((s) => s.pages)
  const currentPageId = useStore((s) => s.currentPageId)
  const selectPage = useStore((s) => s.selectPage)
  const recent = [...pages]
    .sort((a, b) => b.updated_at - a.updated_at)
    .slice(0, 5)
  if (recent.length === 0) return null
  return (
    <div className="recent-section">
      <div className="recent-title">최근 편집</div>
      {recent.map((p) => (
        <div
          key={p.id}
          className={`recent-row${currentPageId === p.id ? ' active' : ''}`}
          onClick={() => selectPage(p.id)}
        >
          {p.icon ? (
            <span className="tree-icon tree-emoji">
              <PageIcon icon={p.icon} size={14} />
            </span>
          ) : (
            <FileText size={14} className="tree-icon" />
          )}
          {p.color && (
            <span className="tree-flag" style={{ background: p.color }} />
          )}
          <span className="tree-title">{p.title || '제목 없음'}</span>
        </div>
      ))}
    </div>
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
