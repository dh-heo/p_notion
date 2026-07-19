import { create } from 'zustand'
import { api } from './api'
import { defaultContent } from './types'
import type { Block, BlockContent, BlockType, Page } from './types'

// 블록별 디바운스 자동저장
const timers = new Map<string, ReturnType<typeof setTimeout>>()
function debounceSave(id: string, fn: () => void, ms = 600) {
  const t = timers.get(id)
  if (t) clearTimeout(t)
  timers.set(id, setTimeout(() => {
    timers.delete(id)
    fn()
  }, ms))
}
// 대기 중인 디바운스 저장 취소 — 변환 직후 옛 content 저장이 뒤늦게 덮어쓰지 않도록
function cancelSave(id: string) {
  const t = timers.get(id)
  if (t) {
    clearTimeout(t)
    timers.delete(id)
  }
}

function bySort(a: { sort_order: number }, b: { sort_order: number }) {
  return a.sort_order - b.sort_order
}

// 캐럿(텍스트 입력)이 있는 블록 종류 — 이 유형으로의 변환엔 끝 빈 문단을 붙이지 않는다
const TEXT_TYPES = new Set<BlockType>([
  'paragraph', 'heading', 'bullet', 'numbered', 'todo', 'quote', 'callout',
])

// 끝에 자동 유지할 "빈 문단" 판정 (RichText.isEmptyHtml와 동일 규칙, 순환 import 회피용 로컬)
function isEmptyParaBlock(b: Block): boolean {
  if (b.type !== 'paragraph') return false
  const html = (b.content as { html?: string }).html ?? ''
  return html.replace(/<br\s*\/?>/gi, '').replace(/&nbsp;/gi, '').trim() === ''
}

// 마지막으로 보던 페이지 (localStorage 영속, 재접속 시 복원)
const LAST_PAGE_KEY = 'pnotion:last-page'

// 페이지별 편집 잠금 상태 (localStorage 영속, 기본 편집 가능)
const LOCK_KEY = 'pnotion:locked-pages'
function loadLocked(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(LOCK_KEY) ?? '{}')
  } catch {
    return {}
  }
}

// 넓은 화면에서 사이드바 접힘 상태 (localStorage 영속, 기본 펼침)
const COLLAPSE_KEY = 'pnotion:sidebar-collapsed'
// 좁은 화면 판정 — 좁으면 오버레이(sidebarOpen), 넓으면 인라인 접힘(sidebarCollapsed)으로 동작
const isNarrow = () => window.matchMedia('(max-width: 720px)').matches

let initStarted = false

interface AppState {
  // 인증: null=확인 중, false=로그인 필요, true=로그인됨
  authed: boolean | null
  needsSetup: boolean

  pages: Page[]
  currentPageId: string | null
  blocks: Block[]
  // 현재 페이지를 참조(멘션)하는 곳
  backlinks: Array<{ pageId: string; title: string; icon: string | null; snippet: string }>
  // 렌더 후 포커스를 줄 블록
  focusId: string | null
  focusAtStart: boolean
  // 페이지별 편집 잠금 (pageId -> true)
  lockedPages: Record<string, boolean>
  // 좁은 화면에서 사이드바 오버레이 열림 (데스크톱 CSS에선 무시됨)
  sidebarOpen: boolean
  // 넓은 화면에서 사이드바 접힘 (좁은 화면 CSS에선 무시됨)
  sidebarCollapsed: boolean
  // 검색 모달 열림 (Cmd+K / 사이드바 버튼)
  searchOpen: boolean
  // 드래그로 다중 선택된 블록 id들
  selectedBlockIds: string[]

  checkAuth: () => Promise<void>
  login: (password: string) => Promise<void>
  setupPassword: (password: string) => Promise<void>
  logout: () => Promise<void>

  init: () => Promise<void>
  selectPage: (id: string) => Promise<void>

  addPage: (parentId: string | null) => Promise<void>
  renamePage: (id: string, title: string) => void
  setPageIcon: (id: string, icon: string | null) => void
  setPageColor: (id: string, color: string | null) => void
  deletePage: (id: string) => Promise<void>
  reorderPages: (
    items: Array<{ id: string; sort_order: number; parent_id: string | null }>
  ) => Promise<void>

  // 휴지통 (소프트 삭제된 페이지)
  trash: Page[]
  loadTrash: () => Promise<void>
  restorePage: (id: string) => Promise<void>
  purgePage: (id: string) => Promise<void>
  emptyTrash: () => Promise<void>

  addBlockAfter: (
    afterId: string,
    type?: BlockType,
    content?: BlockContent
  ) => Promise<string | undefined>
  addBlockAtEnd: (
    type: BlockType,
    content?: BlockContent
  ) => Promise<string | undefined>
  insertBlocksAfter: (
    afterId: string,
    items: Array<{ type: BlockType; content: BlockContent }>
  ) => Promise<void>
  // 마지막 블록이 빈 문단이 아니면(예: 이미지/표로 끝남) 끝에 빈 문단 하나를 붙여
  // 항상 이어서 입력할 자리를 남긴다. 블록이 생성/변환/로드되는 경로에서 호출한다.
  ensureTrailingEmpty: () => Promise<void>
  updateContent: (id: string, content: BlockContent) => void
  convertBlock: (id: string, type: BlockType, content?: BlockContent) => Promise<void>
  // 다중선택된 텍스트 블록들을 한 번에 불릿/번호 목록으로 변환 (각 블록의 html은 보존)
  convertBlocks: (ids: string[], type: 'bullet' | 'numbered') => Promise<void>
  // 다중선택된 텍스트 블록들에 서식(굵게/글자색/배경색)을 한 번에 적용
  formatBlocks: (
    ids: string[],
    format: { kind: 'bold' | 'color' | 'bg'; value?: string }
  ) => Promise<void>
  deleteBlock: (id: string, focusPrev?: boolean) => Promise<void>
  deleteBlocks: (ids: string[]) => Promise<void>
  setSelectedBlocks: (ids: string[]) => void
  clearSelection: () => void
  mergeIntoPrev: (id: string, html: string) => Promise<void>
  reorderBlocks: (orderedIds: string[]) => Promise<void>

  setFocus: (id: string | null, atStart?: boolean) => void
  toggleLock: (pageId: string) => void
  setSidebarOpen: (open: boolean) => void
  // 화면 폭에 맞춰 사이드바를 보이거나(showSidebar) 숨긴다(hideSidebar)
  showSidebar: () => void
  hideSidebar: () => void
  setSearchOpen: (open: boolean) => void
}

export const useStore = create<AppState>((set, get) => ({
  authed: null,
  needsSetup: false,
  pages: [],
  currentPageId: null,
  blocks: [],
  backlinks: [],
  trash: [],
  focusId: null,
  focusAtStart: false,
  lockedPages: loadLocked(),
  sidebarOpen: false,
  sidebarCollapsed: localStorage.getItem(COLLAPSE_KEY) === 'true',
  searchOpen: false,
  selectedBlockIds: [],

  checkAuth: async () => {
    try {
      const s = await api.auth.status()
      set({ authed: s.authenticated, needsSetup: s.needsSetup })
      if (s.authenticated) await get().init()
    } catch {
      set({ authed: false, needsSetup: false })
    }
  },

  login: async (password) => {
    await api.auth.login(password) // 실패 시 throw → 호출부에서 에러 표시
    set({ authed: true, needsSetup: false })
    await get().init()
  },

  setupPassword: async (password) => {
    await api.auth.setup(password)
    set({ authed: true, needsSetup: false })
    await get().init()
  },

  logout: async () => {
    await api.auth.logout()
    initStarted = false // 재로그인 시 init()이 다시 실행되도록
    set({
      authed: false,
      needsSetup: false,
      pages: [],
      blocks: [],
      currentPageId: null,
    })
  },

  init: async () => {
    // StrictMode의 이펙트 이중 실행로 인한 중복 생성 방지
    if (initStarted) return
    initStarted = true
    let pages = await api.getTree()
    if (pages.length === 0) {
      const p = await api.createPage(null, '')
      pages = [p]
    }
    set({ pages })
    const savedId = localStorage.getItem(LAST_PAGE_KEY)
    const target =
      pages.find((p) => p.id === savedId) ??
      pages.find((p) => p.parent_page_id === null) ??
      pages[0]
    await get().selectPage(target.id)
  },

  selectPage: async (id) => {
    localStorage.setItem(LAST_PAGE_KEY, id)
    set({
      currentPageId: id,
      blocks: [],
      backlinks: [],
      sidebarOpen: false,
      selectedBlockIds: [],
    })
    api.getBacklinks(id).then((backlinks) => {
      // 늦게 도착한 응답이 다른 페이지를 덮어쓰지 않게 확인
      if (get().currentPageId === id) set({ backlinks })
    })
    let blocks = await api.getBlocks(id)
    // 빈 페이지면 입력을 시작할 수 있도록 빈 문단 1개 생성
    if (blocks.length === 0) {
      const b = await api.createBlock({
        page_id: id,
        type: 'paragraph',
        content: { html: '' },
        sort_order: 1,
      })
      blocks = [b]
    }
    set({ blocks: blocks.sort(bySort) })
    // 이미지/표 등으로 끝나는 페이지엔 입력 자리를 위해 끝에 빈 문단을 보장
    await get().ensureTrailingEmpty()
  },

  addPage: async (parentId) => {
    const p = await api.createPage(parentId, '')
    set((s) => ({ pages: [...s.pages, p] }))
    await get().selectPage(p.id)
  },

  renamePage: (id, title) => {
    set((s) => ({
      pages: s.pages.map((p) => (p.id === id ? { ...p, title } : p)),
    }))
    debounceSave(`page:${id}`, () => api.updatePage(id, { title }))
  },

  setPageIcon: (id, icon) => {
    set((s) => ({
      pages: s.pages.map((p) => (p.id === id ? { ...p, icon } : p)),
    }))
    api.updatePage(id, { icon })
  },

  setPageColor: (id, color) => {
    set((s) => ({
      pages: s.pages.map((p) => (p.id === id ? { ...p, color } : p)),
    }))
    api.updatePage(id, { color })
  },

  deletePage: async (id) => {
    await api.deletePage(id)
    // 삭제된 페이지와 그 하위(서버 CASCADE)를 로컬에서도 제거
    const removeSet = new Set<string>([id])
    let grew = true
    const all = get().pages
    while (grew) {
      grew = false
      for (const p of all) {
        if (p.parent_page_id && removeSet.has(p.parent_page_id) && !removeSet.has(p.id)) {
          removeSet.add(p.id)
          grew = true
        }
      }
    }
    const pages = all.filter((p) => !removeSet.has(p.id))
    set({ pages })
    if (get().currentPageId && removeSet.has(get().currentPageId!)) {
      const next = pages.find((p) => p.parent_page_id === null) ?? pages[0]
      if (next) await get().selectPage(next.id)
      else set({ currentPageId: null, blocks: [] })
    }
  },

  reorderPages: async (items) => {
    set((s) => ({
      pages: s.pages.map((p) => {
        const it = items.find((i) => i.id === p.id)
        return it
          ? { ...p, sort_order: it.sort_order, parent_page_id: it.parent_id }
          : p
      }),
    }))
    await api.reorder('page', items)
  },

  loadTrash: async () => {
    set({ trash: await api.getTrash() })
  },

  restorePage: async (id) => {
    await api.restorePage(id)
    // 복원으로 트리 구조(부모 끊김 포함)가 바뀔 수 있어 트리/휴지통을 다시 읽는다
    const [pages, trash] = await Promise.all([api.getTree(), api.getTrash()])
    set({ pages, trash })
  },

  purgePage: async (id) => {
    await api.purgePage(id)
    set((s) => ({ trash: s.trash.filter((p) => p.id !== id) }))
  },

  emptyTrash: async () => {
    await api.emptyTrash()
    set({ trash: [] })
  },

  addBlockAfter: async (afterId, type = 'paragraph', content) => {
    const { blocks, currentPageId } = get()
    if (!currentPageId) return
    const idx = blocks.findIndex((b) => b.id === afterId)
    const a = blocks[idx]
    const next = blocks[idx + 1]
    const sort = next ? (a.sort_order + next.sort_order) / 2 : a.sort_order + 1
    const created = await api.createBlock({
      page_id: currentPageId,
      type,
      content: content ?? defaultContent(type),
      sort_order: sort,
    })
    set((s) => ({
      blocks: [...s.blocks, created].sort(bySort),
      focusId: created.id,
      focusAtStart: true,
    }))
    return created.id
  },

  addBlockAtEnd: async (type, content) => {
    const { blocks, currentPageId } = get()
    if (!currentPageId) return
    const last = blocks[blocks.length - 1]
    const sort = last ? last.sort_order + 1 : 1
    const created = await api.createBlock({
      page_id: currentPageId,
      type,
      content: content ?? defaultContent(type),
      sort_order: sort,
    })
    set((s) => ({ blocks: [...s.blocks, created].sort(bySort) }))
    return created.id
  },

  insertBlocksAfter: async (afterId, items) => {
    const { blocks, currentPageId } = get()
    if (!currentPageId || items.length === 0) return
    const idx = blocks.findIndex((b) => b.id === afterId)
    const a = blocks[idx]
    const next = blocks[idx + 1]
    const start = a ? a.sort_order : 0
    const end = next ? next.sort_order : start + items.length + 1
    // a와 next 사이에 분수 인덱싱으로 균등 배치 (한 번에 여러 블록 삽입)
    const step = (end - start) / (items.length + 1)
    const created: Block[] = []
    for (let i = 0; i < items.length; i++) {
      const c = await api.createBlock({
        page_id: currentPageId,
        type: items[i].type,
        content: items[i].content,
        sort_order: start + step * (i + 1),
      })
      created.push(c)
    }
    set((s) => ({
      blocks: [...s.blocks, ...created].sort(bySort),
      focusId: created[created.length - 1].id,
      focusAtStart: false,
    }))
    // 표 등 비-텍스트 블록을 붙여넣어 끝났다면 끝에 빈 문단을 보장
    await get().ensureTrailingEmpty()
  },

  ensureTrailingEmpty: async () => {
    const { blocks, currentPageId, lockedPages } = get()
    // 잠긴(읽기 전용) 페이지는 건드리지 않는다
    if (!currentPageId || lockedPages[currentPageId]) return
    if (blocks.length === 0) return // 빈 페이지는 selectPage/deleteBlocks가 처리
    const last = blocks[blocks.length - 1]
    if (isEmptyParaBlock(last)) return // 이미 끝이 빈 문단
    const created = await api.createBlock({
      page_id: currentPageId,
      type: 'paragraph',
      content: { html: '' },
      sort_order: last.sort_order + 1,
    })
    // 그 사이 다른 페이지로 넘어갔으면 반영하지 않는다
    set((s) =>
      s.currentPageId === currentPageId
        ? { blocks: [...s.blocks, created].sort(bySort) }
        : s
    )
  },

  updateContent: (id, content) => {
    const pageId = get().currentPageId
    set((s) => ({
      blocks: s.blocks.map((b) => (b.id === id ? { ...b, content } : b)),
    }))
    debounceSave(id, () => {
      api.updateBlock(id, { content })
      // 저장 시점에 소속 페이지의 updated_at을 올려 "최근 편집" 목록에 반영 (서버도 touchPage).
      // 입력마다가 아니라 디바운스 시점에만 갱신해 사이드바 재렌더를 줄인다.
      if (pageId)
        set((s) => ({
          pages: s.pages.map((p) =>
            p.id === pageId ? { ...p, updated_at: Date.now() } : p
          ),
        }))
    })
  },

  convertBlock: async (id, type, content) => {
    // 입력 중 예약된 옛 content 저장이 변환 결과를 덮어쓰지 않도록 먼저 취소
    cancelSave(id)
    const c = content ?? defaultContent(type)
    set((s) => ({
      blocks: s.blocks.map((b) => (b.id === id ? { ...b, type, content: c } : b)),
      focusId: id,
      focusAtStart: false,
    }))
    await api.updateBlock(id, { type, content: c })
    // 마지막 블록을 이미지/표 등 비-텍스트로 바꿨다면 끝에 빈 문단을 보장.
    // 텍스트 변환(불릿/제목 등)엔 붙이지 않고, divider는 자체적으로 뒤에 문단을 만든다.
    if (!TEXT_TYPES.has(type) && type !== 'divider') await get().ensureTrailingEmpty()
  },

  convertBlocks: async (ids, type) => {
    const idset = new Set(ids)
    const { blocks } = get()
    // html을 가진 텍스트 계열 블록만 대상 (표/코드/이미지 등은 그대로 둔다)
    const TEXT = new Set(['paragraph', 'heading', 'bullet', 'numbered', 'todo', 'quote', 'callout'])
    const targets = blocks.filter((b) => idset.has(b.id) && TEXT.has(b.type))
    if (targets.length === 0) {
      set({ selectedBlockIds: [] })
      return
    }
    // 입력 중 예약된 옛 content 저장이 변환 결과를 덮어쓰지 않도록 먼저 취소
    targets.forEach((b) => cancelSave(b.id))
    const contentOf = (b: Block): BlockContent => ({
      html: (b.content as { html?: string }).html ?? '',
      indent: 0,
    })
    set((s) => ({
      blocks: s.blocks.map((b) =>
        idset.has(b.id) && TEXT.has(b.type) ? { ...b, type, content: contentOf(b) } : b
      ),
      selectedBlockIds: [],
    }))
    await Promise.all(
      targets.map((b) => api.updateBlock(b.id, { type, content: contentOf(b) }))
    )
  },

  formatBlocks: async (ids, format) => {
    const idset = new Set(ids)
    const { blocks } = get()
    const TEXT = new Set(['paragraph', 'heading', 'bullet', 'numbered', 'todo', 'quote', 'callout'])
    // html이 비어있지 않은 텍스트 블록만 대상
    const targets = blocks.filter(
      (b) => idset.has(b.id) && TEXT.has(b.type) && !!(b.content as { html?: string }).html
    )
    if (targets.length === 0) return
    targets.forEach((b) => cancelSave(b.id))
    // 블록 html 전체를 서식 태그로 감싼다 (색은 SANITIZE 허용 span)
    const wrap = (html: string): string => {
      if (format.kind === 'bold') return `<strong>${html}</strong>`
      const prop = format.kind === 'color' ? 'color' : 'background-color'
      return `<span style="${prop}:${format.value}">${html}</span>`
    }
    const nextContent = (b: Block): BlockContent => {
      const c = b.content as { html: string }
      return { ...b.content, html: wrap(c.html) } as BlockContent
    }
    const patched = new Map(targets.map((b) => [b.id, nextContent(b)]))
    set((s) => ({
      blocks: s.blocks.map((b) =>
        patched.has(b.id) ? { ...b, content: patched.get(b.id)! } : b
      ),
    }))
    await Promise.all(
      targets.map((b) => api.updateBlock(b.id, { content: patched.get(b.id)! }))
    )
  },

  deleteBlock: async (id, focusPrev = true) => {
    const { blocks } = get()
    if (blocks.length <= 1) return // 마지막 한 블록은 유지
    const idx = blocks.findIndex((b) => b.id === id)
    const prev = blocks[idx - 1]
    set((s) => ({
      blocks: s.blocks.filter((b) => b.id !== id),
      focusId: focusPrev && prev ? prev.id : s.focusId,
      focusAtStart: false,
    }))
    await api.deleteBlock(id)
  },

  deleteBlocks: async (ids) => {
    const idset = new Set(ids)
    const { blocks, currentPageId } = get()
    if (!currentPageId || ids.length === 0) return
    const remaining = blocks.filter((b) => !idset.has(b.id))
    set({ blocks: remaining, selectedBlockIds: [] })
    await Promise.all(ids.map((id) => api.deleteBlock(id)))
    // 전부 지워졌으면 입력을 이어갈 수 있도록 빈 문단 1개를 만든다
    if (remaining.length === 0) {
      const b = await api.createBlock({
        page_id: currentPageId,
        type: 'paragraph',
        content: { html: '' },
        sort_order: 1,
      })
      set({ blocks: [b], focusId: b.id, focusAtStart: true })
    }
  },

  setSelectedBlocks: (ids) => set({ selectedBlockIds: ids }),
  clearSelection: () =>
    set((s) => (s.selectedBlockIds.length ? { selectedBlockIds: [] } : s)),

  mergeIntoPrev: async (id, html) => {
    const { blocks } = get()
    const idx = blocks.findIndex((b) => b.id === id)
    const prev = blocks[idx - 1]
    if (!prev) return
    // 텍스트 계열 블록끼리만 병합
    const textTypes = ['paragraph', 'heading', 'bullet', 'todo']
    if (!textTypes.includes(prev.type)) {
      set({ focusId: prev.id, focusAtStart: false })
      return
    }
    const prevHtml = (prev.content as { html?: string }).html ?? ''
    const merged = { ...(prev.content as object), html: prevHtml + html }
    set((s) => ({
      blocks: s.blocks
        .filter((b) => b.id !== id)
        .map((b) =>
          b.id === prev.id ? { ...b, content: merged as BlockContent } : b
        ),
      focusId: prev.id,
      focusAtStart: false,
    }))
    api.updateBlock(prev.id, { content: merged as BlockContent })
    await api.deleteBlock(id)
  },

  reorderBlocks: async (orderedIds) => {
    set((s) => {
      const map = new Map(s.blocks.map((b) => [b.id, b]))
      return {
        blocks: orderedIds.map((id, i) => ({ ...map.get(id)!, sort_order: i })),
      }
    })
    await api.reorder(
      'block',
      orderedIds.map((id, i) => ({ id, sort_order: i }))
    )
  },

  setFocus: (id, atStart = false) => set({ focusId: id, focusAtStart: atStart }),

  toggleLock: (pageId) =>
    set((s) => {
      const next = { ...s.lockedPages }
      if (next[pageId]) delete next[pageId]
      else next[pageId] = true
      localStorage.setItem(LOCK_KEY, JSON.stringify(next))
      return { lockedPages: next }
    }),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  showSidebar: () => {
    if (isNarrow()) set({ sidebarOpen: true })
    else {
      localStorage.setItem(COLLAPSE_KEY, 'false')
      set({ sidebarCollapsed: false })
    }
  },
  hideSidebar: () => {
    if (isNarrow()) set({ sidebarOpen: false })
    else {
      localStorage.setItem(COLLAPSE_KEY, 'true')
      set({ sidebarCollapsed: true })
    }
  },
  setSearchOpen: (open) => set({ searchOpen: open }),
}))
