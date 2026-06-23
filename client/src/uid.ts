// crypto.randomUUID()는 보안 컨텍스트(HTTPS/localhost)에서만 존재한다.
// http로 띄운 배포(예: AWS IP 접속)에서는 undefined라 표 컬럼 id 생성 등이 터진다.
// getRandomValues는 비보안 컨텍스트에서도 동작하므로 그걸로 폴백한다.
export function uid(): string {
  const c = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID()
  if (c?.getRandomValues) {
    const b = c.getRandomValues(new Uint8Array(16))
    b[6] = (b[6] & 0x0f) | 0x40
    b[8] = (b[8] & 0x3f) | 0x80
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0'))
    return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10, 16).join('')}`
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`
}
