import { useEffect } from 'react'

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

export function EmojiPicker({
  onPick,
  onRemove,
  onClose,
  hasIcon,
}: {
  onPick: (emoji: string) => void
  onRemove: () => void
  onClose: () => void
  hasIcon: boolean
}) {
  // Esc로 닫기
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  return (
    <>
      <div className="emoji-backdrop" onMouseDown={onClose} />
      <div className="emoji-pop" onMouseDown={(e) => e.stopPropagation()}>
        <div className="emoji-grid">
          {EMOJIS.map((e) => (
            <button key={e} className="emoji-cell" onClick={() => onPick(e)}>
              {e}
            </button>
          ))}
        </div>
        {hasIcon && (
          <button className="emoji-remove" onClick={onRemove}>
            아이콘 제거
          </button>
        )}
      </div>
    </>
  )
}
