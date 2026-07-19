// HTML 특수문자(&, <, >)를 이스케이프한다.
// 평문을 셀/블록 HTML로 저장하기 전에 쓰는 공용 유틸 (markdown.ts, tableClipboard.ts 공유).
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
