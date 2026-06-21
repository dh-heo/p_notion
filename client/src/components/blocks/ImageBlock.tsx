import { useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { api } from '../../api'
import type { ImageContent } from '../../types'

interface Props {
  content: ImageContent
  onChange: (next: ImageContent) => void
  editable: boolean
}

export function ImageBlock({ content, onChange, editable }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const upload = async (file: File) => {
    setUploading(true)
    try {
      const { src } = await api.uploadImage(file)
      onChange({ ...content, src })
    } finally {
      setUploading(false)
    }
  }

  if (!content.src) {
    if (!editable) {
      return (
        <div className="b-image-drop">
          <ImagePlus size={20} />
          <span>이미지 없음</span>
        </div>
      )
    }
    return (
      <div
        className="b-image-drop"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files[0]
          if (f) upload(f)
        }}
      >
        <ImagePlus size={20} />
        <span>{uploading ? '업로드 중…' : '이미지를 클릭 또는 드래그하여 추가'}</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) upload(f)
          }}
        />
      </div>
    )
  }

  return (
    <figure className="b-image">
      <img src={content.src} alt={content.caption} />
      <input
        className="b-image-caption"
        placeholder={editable ? '캡션 추가' : ''}
        value={content.caption}
        readOnly={!editable}
        onChange={(e) => onChange({ ...content, caption: e.target.value })}
      />
    </figure>
  )
}
