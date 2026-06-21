import { FileText, Download } from 'lucide-react'
import type { FileContent } from '../../types'

function formatSize(bytes: number): string {
  if (!bytes) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${i === 0 ? n : n.toFixed(1)} ${units[i]}`
}

interface Props {
  content: FileContent
}

export function FileBlock({ content }: Props) {
  if (!content.src) return null
  const size = formatSize(content.size)
  return (
    <a
      className="b-file"
      href={content.src}
      download={content.name || undefined}
      target="_blank"
      rel="noreferrer"
    >
      <FileText size={20} className="b-file-icon" />
      <span className="b-file-meta">
        <span className="b-file-name">{content.name || '파일'}</span>
        {size && <span className="b-file-size">{size}</span>}
      </span>
      <Download size={16} className="b-file-dl" />
    </a>
  )
}
