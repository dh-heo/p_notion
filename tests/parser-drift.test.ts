// client(src/markdown.ts)와 server(server/markdownToBlocks.ts)의 마크다운 파서는
// 의도적으로 별도 구현이다(공유 코드 인프라 없음 — 두 반쪽 아키텍처 유지).
// 물리적으로 병합하지 않는 대신, 이 테스트가 (1)공유 규칙이 계속 일치하는지와
// (2)알려진 차이가 그대로인지를 고정한다. 한쪽만 바꾸면 여기서 실패해 drift를 알린다.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { markdownToBlocks as client } from '../client/src/markdown.ts'
import { markdownToBlocks as server } from '../server/markdownToBlocks.ts'

const types = (blocks: { type: string }[]) => blocks.map((b) => b.type)

test('공유 규칙(heading/bullet/todo/quote/code/divider + inline)은 client·server가 동일해야 한다', () => {
  const shared =
    '# Head **b**\n\n- item `c`\n\n- [x] done\n\n' +
    '> quote [x](a.com)\n\n```js\nconst x=1\n```\n\n---'
  // 두 파서가 지원하는 공통 블록만 쓰면 출력이 완전히 일치한다.
  // 한쪽에서 공유 규칙(헤딩/불릿/인라인 등)을 바꾸면 이 assertion이 깨진다.
  assert.deepEqual(client(shared), server(shared))
})

test('알려진 차이: 마크다운 표는 client만 table로 파싱, server는 paragraph', () => {
  const md = '| h1 | h2 |\n| --- | --- |\n| 1 | 2 |'
  assert.deepEqual(types(client(md)), ['table'])
  assert.deepEqual(types(server(md)), ['paragraph'])
})

test('알려진 차이: 번호목록(1.)은 client만 numbered, server는 paragraph', () => {
  const md = '1. one\n2. two'
  // client: 각 줄이 numbered
  assert.deepEqual(types(client(md)), ['numbered', 'numbered'])
  // server: 번호목록 규칙이 없어 하나의 paragraph로 합쳐진다
  assert.deepEqual(types(server(md)), ['paragraph'])
})
