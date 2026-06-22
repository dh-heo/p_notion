import { useEffect } from 'react'
import { Menu } from 'lucide-react'
import { useStore } from './store'
import { Sidebar } from './components/Sidebar'
import { Editor } from './components/Editor'
import { InlineToolbar } from './components/InlineToolbar'
import { SearchModal } from './components/SearchModal'
import { Login } from './components/Login'
import './styles/components.css'

function App() {
  const authed = useStore((s) => s.authed)
  const checkAuth = useStore((s) => s.checkAuth)
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const setSidebarOpen = useStore((s) => s.setSidebarOpen)
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed)
  const showSidebar = useStore((s) => s.showSidebar)
  const pageTitle = useStore(
    (s) => s.pages.find((p) => p.id === s.currentPageId)?.title
  )
  const searchOpen = useStore((s) => s.searchOpen)
  const setSearchOpen = useStore((s) => s.setSearchOpen)

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  useEffect(() => {
    document.title = pageTitle?.trim() || 'p_notion'
  }, [pageTitle])

  // Cmd/Ctrl+K로 검색 열기 (단, 편집 중 선택 영역이 있으면 RichText의 링크 단축키에 양보)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        const ae = document.activeElement
        const sel = window.getSelection()
        const linking =
          ae instanceof HTMLElement && ae.isContentEditable && sel && !sel.isCollapsed
        if (linking) return
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setSearchOpen])

  if (authed === null) return <div className="app-loading" />
  if (!authed) return <Login />

  return (
    <div className="app">
      <button
        className={`sidebar-toggle${sidebarCollapsed ? ' collapsed' : ''}`}
        title="사이드바 열기"
        onClick={showSidebar}
      >
        <Menu size={20} />
      </button>
      <Sidebar />
      <div
        className={`sidebar-backdrop${sidebarOpen ? ' open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />
      <Editor />
      <InlineToolbar />
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
    </div>
  )
}

export default App
