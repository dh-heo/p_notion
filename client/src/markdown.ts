import { uid } from './uid'
import type { BlockContent, BlockType } from './types'

// 붙여넣은 마크다운 텍스트(주로 ChatGPT 답변)를 블록으로 변환한다.
// 서버 ingest.ts의 파서와 같은 규칙 + 표(| a | b |)와 번호 목록을 추가로 지원.

export interface MdBlock {
  type: BlockType
  content: BlockContent
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// 인라인 마크다운을 SANITIZE 허용 태그(strong/em/code/a)로 변환.
// 코드 스팬을 사설 영역 문자로 감싼 플레이스홀더로 빼두어 그 안은 변환하지 않는다.
export function inlineMarkdown(src: string): string {
  const codes: string[] = []
  let s = src.replace(/`([^`]+)`/g, (_m, c: string) => {
    codes.push(`<code>${escapeHtml(c)}</code>`)
    return `${codes.length - 1}`
  })
  s = escapeHtml(s)
  // [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, url: string) => {
    const safe = /^(https?:|mailto:|\/)/i.test(url) ? url : `https://${url}`
    return `<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">${text}</a>`
  })
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
  s = s.replace(/(^|[^_])_([^_]+)_/g, '$1<em>$2</em>')
  // 코드 스팬 복원
  s = s.replace(/(\d+)/g, (_m, i: string) => codes[Number(i)])
  return s
}

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l)
const isTableSep = (l: string) =>
  /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(l) && l.includes('-')

// "| a | b |" → ["a", "b"] (양끝 파이프/공백 제거)
function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim())
}

// 텍스트에 변환할 만한 마크다운 요소가 있는지 (없으면 일반 붙여넣기로 둔다)
export function looksLikeMarkdown(text: string): boolean {
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (/^\s*#{1,3}\s+/.test(l)) return true
    if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(l)) return true
    if (/^\s*>\s?/.test(l)) return true
    if (/^\s*```/.test(l)) return true
    if (/^\s*([-*_])\1{2,}\s*$/.test(l)) return true
    if (isTableRow(l) && i + 1 < lines.length && isTableSep(lines[i + 1])) return true
  }
  // 인라인 서식/링크
  return /\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[[^\]]+\]\([^)\s]+\)/.test(text)
}

export function markdownToBlocks(md: string): MdBlock[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const blocks: MdBlock[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // 코드 펜스
    const fence = line.match(/^```(\w*)\s*$/)
    if (fence) {
      const language = fence[1] || 'bash'
      const body: string[] = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        body.push(lines[i])
        i++
      }
      i++ // 닫는 펜스 소비
      blocks.push({ type: 'code', content: { code: body.join('\n'), language } })
      continue
    }

    // 표: 헤더 행 + 구분 행 + 본문 행들
    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = splitRow(line)
      i += 2 // 헤더 + 구분선 소비
      const bodyRows: string[][] = []
      while (i < lines.length && isTableRow(lines[i])) {
        bodyRows.push(splitRow(lines[i]))
        i++
      }
      const columns = header.map((name) => ({
        id: uid(),
        name,
        type: 'text' as const,
      }))
      const width = columns.length
      const normalize = (row: string[]) =>
        Array.from({ length: width }, (_, c) => inlineMarkdown(row[c] ?? ''))
      const cells = bodyRows.length
        ? bodyRows.map(normalize)
        : [Array.from({ length: width }, () => '')]
      blocks.push({ type: 'table', content: { columns, cells } })
      continue
    }

    // 빈 줄: 단락 구분
    if (line.trim() === '') {
      i++
      continue
    }

    // 구분선
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push({ type: 'divider', content: {} })
      i++
      continue
    }

    // 헤딩
    const h = line.match(/^(#{1,3})\s+(.*)$/)
    if (h) {
      blocks.push({
        type: 'heading',
        content: { html: inlineMarkdown(h[2].trim()), level: h[1].length as 1 | 2 | 3 },
      })
      i++
      continue
    }

    // 인용
    const q = line.match(/^>\s?(.*)$/)
    if (q) {
      blocks.push({ type: 'quote', content: { html: inlineMarkdown(q[1].trim()) } })
      i++
      continue
    }

    // todo: - [ ] / - [x]
    const t = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/)
    if (t) {
      blocks.push({
        type: 'todo',
        content: {
          html: inlineMarkdown(t[2].trim()),
          checked: t[1].toLowerCase() === 'x',
        },
      })
      i++
      continue
    }

    // 번호 목록: 1. / 1)
    const n = line.match(/^(\s*)\d+[.)]\s+(.*)$/)
    if (n) {
      const indent = Math.min(6, Math.floor(n[1].replace(/\t/g, '  ').length / 2))
      blocks.push({
        type: 'numbered',
        content: { html: inlineMarkdown(n[2].trim()), indent },
      })
      i++
      continue
    }

    // 불릿: 들여쓰기 2칸 = 1단계
    const b = line.match(/^(\s*)[-*+]\s+(.*)$/)
    if (b) {
      const indent = Math.min(6, Math.floor(b[1].replace(/\t/g, '  ').length / 2))
      blocks.push({
        type: 'bullet',
        content: { html: inlineMarkdown(b[2].trim()), indent },
      })
      i++
      continue
    }

    // 그 외: 단락 (연속된 비특수 줄을 <br>로 합침)
    const para: string[] = [line]
    i++
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^```/.test(lines[i]) &&
      !/^(#{1,3})\s/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^\s*(?:[-*+]|\d+[.)])\s/.test(lines[i]) &&
      !/^\s*([-*_])\1{2,}\s*$/.test(lines[i]) &&
      !(isTableRow(lines[i]) && i + 1 < lines.length && isTableSep(lines[i + 1]))
    ) {
      para.push(lines[i])
      i++
    }
    blocks.push({
      type: 'paragraph',
      content: { html: para.map((l) => inlineMarkdown(l.trim())).join('<br>') },
    })
  }

  return blocks
}
