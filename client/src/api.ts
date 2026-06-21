import type { Block, BlockContent, BlockType, Page } from './types'

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${url} → ${res.status}`)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  auth: {
    status: () =>
      req<{ authenticated: boolean; needsSetup: boolean }>('/api/auth/status'),
    setup: (password: string) =>
      req<{ ok: true }>('/api/auth/setup', {
        method: 'POST',
        body: JSON.stringify({ password }),
      }),
    login: (password: string) =>
      req<{ ok: true }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      }),
    logout: () => req<void>('/api/auth/logout', { method: 'POST' }),
  },

  getTree: () => req<Page[]>('/api/tree'),

  createPage: (parent_page_id: string | null, title = '') =>
    req<Page>('/api/pages', {
      method: 'POST',
      body: JSON.stringify({ parent_page_id, title }),
    }),

  updatePage: (
    id: string,
    patch: Partial<Pick<Page, 'title' | 'icon' | 'cover'>>
  ) =>
    req<Page>(`/api/pages/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  deletePage: (id: string) =>
    req<void>(`/api/pages/${id}`, { method: 'DELETE' }),

  getTrash: () => req<Page[]>('/api/trash'),

  restorePage: (id: string) =>
    req<Page>(`/api/pages/${id}/restore`, { method: 'POST' }),

  purgePage: (id: string) =>
    req<void>(`/api/trash/${id}`, { method: 'DELETE' }),

  emptyTrash: () => req<void>('/api/trash', { method: 'DELETE' }),

  search: (q: string) =>
    req<
      Array<{ pageId: string; title: string; icon: string | null; snippet: string }>
    >(`/api/search?q=${encodeURIComponent(q)}`),

  getBacklinks: (pageId: string) =>
    req<
      Array<{ pageId: string; title: string; icon: string | null; snippet: string }>
    >(`/api/pages/${pageId}/backlinks`),

  fetchBookmark: (url: string) =>
    req<{ url: string; title: string; description: string; image: string }>(
      '/api/bookmark',
      { method: 'POST', body: JSON.stringify({ url }) }
    ),

  getBlocks: (pageId: string) => req<Block[]>(`/api/pages/${pageId}/blocks`),

  createBlock: (input: {
    page_id: string
    type?: BlockType
    content?: BlockContent
    sort_order?: number
    parent_block_id?: string | null
  }) =>
    req<Block>('/api/blocks', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  updateBlock: (
    id: string,
    patch: { type?: BlockType; content?: BlockContent }
  ) =>
    req<Block>(`/api/blocks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  deleteBlock: (id: string) =>
    req<void>(`/api/blocks/${id}`, { method: 'DELETE' }),

  reorder: (
    kind: 'block' | 'page',
    items: Array<{ id: string; sort_order: number; parent_id?: string | null }>
  ) =>
    req<void>('/api/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ kind, items }),
    }),

  uploadImage: async (file: File): Promise<{ src: string }> => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body: form })
    if (!res.ok) throw new Error(`upload failed: ${res.status}`)
    return res.json()
  },

  uploadFile: async (
    file: File
  ): Promise<{ src: string; name: string; size: number }> => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/upload', { method: 'POST', body: form })
    if (!res.ok) throw new Error(`upload failed: ${res.status}`)
    return res.json()
  },
}
