import { useEffect, useRef, useState } from 'react'
import { api } from '../api'

// 의존성 없이 쓰는 가벼운 이모지 선택기 (자주 쓰는 묶음만 큐레이션)
const EMOJIS = [
  '📄', '📝', '📌', '📎', '🗂️', '📁', '📚', '📖', '🔖', '🗒️',
  '✅', '⭐', '🔥', '💡', '🎯', '🚀', '🧩', '🔧', '⚙️', '🛠️',
  '📈', '📊', '📅', '🗓️', '⏰', '💰', '💼', '🏦', '🧾', '🔑',
  '🏠', '🏢', '🌍', '✈️', '🚗', '🍽️', '☕', '🍱', '🎵', '🎬',
  '❤️', '💙', '💚', '💛', '💜', '🧠', '👀', '🙌', '👍', '🙏',
  '😀', '😎', '🤔', '😴', '🥳', '😅', '🤓', '😇', '🐱', '🐶',
  '🌱', '🌳', '🌸', '🍀', '🌙', '☀️', '⚡', '❄️', '🌈', '🔮',
]

export function IconPicker({
  onPick,
  onRemove,
  onClose,
  hasIcon,
}: {
  // 이모지 문자 또는 업로드된 이미지 경로를 그대로 넘긴다
  onPick: (value: string) => void
  onRemove: () => void
  onClose: () => void
  hasIcon: boolean
}) {
  const [tab, setTab] = useState<'emoji' | 'image'>('emoji')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Esc로 닫기
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  const pickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 같은 파일 다시 선택 가능하도록 초기화
    if (!file) return
    setUploading(true)
    try {
      const { src } = await api.uploadImage(file)
      onPick(src)
    } catch (err) {
      console.error('아이콘 업로드 실패:', err)
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <div className="emoji-backdrop" onMouseDown={onClose} />
      <div className="emoji-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="icon-tabs">
          <button
            className={tab === 'emoji' ? 'active' : ''}
            onClick={() => setTab('emoji')}
          >
            이모지
          </button>
          <button
            className={tab === 'image' ? 'active' : ''}
            onClick={() => setTab('image')}
          >
            이미지
          </button>
        </div>
        {tab === 'emoji' ? (
          <div className="emoji-grid">
            {EMOJIS.map((e) => (
              <button key={e} className="emoji-cell" onClick={() => onPick(e)}>
                {e}
              </button>
            ))}
          </div>
        ) : (
          <div className="icon-upload">
            <button
              className="icon-upload-btn"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? '업로드 중…' : '이미지 업로드'}
            </button>
            <input
              type="file"
              accept="image/*"
              ref={fileRef}
              hidden
              onChange={pickImage}
            />
            <p className="icon-upload-hint">정사각형 이미지를 권장합니다.</p>
          </div>
        )}
        {hasIcon && (
          <button className="emoji-remove" onClick={onRemove}>
            아이콘 제거
          </button>
        )}
      </div>
    </>
  )
}
