// 리팩터 전후 행위 보존을 고정하는 characterization 테스트.
// 설치 없이 Node 내장 러너로 실행: `npm run test:unit` (= tsx tests/characterization.test.ts)
// 여기서 다루는 것은 브라우저 DOM에 의존하지 않는 순수 함수뿐이다
// (DOM/시각 동작은 tests/MANUAL_CHECKLIST.md 의 수동 절차로 확인).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  markdownToBlocks,
  looksLikeMarkdown,
  inlineMarkdown,
} from '../client/src/markdown.ts'
import {
  gridToTSV,
  gridToCSV,
  gridToHtmlTable,
  parseDelimitedFile,
  isTableFile,
} from '../client/src/tableClipboard.ts'
import { escapeHtml } from '../client/src/escapeHtml.ts'

// table 블록의 랜덤 컬럼 id는 비교에서 제외한다.
const norm = (blocks: any[]) =>
  blocks.map((b) =>
    b.type === 'table'
      ? {
          type: b.type,
          content: {
            columns: b.content.columns.map((c: any) => ({ ...c, id: 'ID' })),
            cells: b.content.cells,
          },
        }
      : b
  )

test('markdownToBlocks: 전체 문서 → 블록 배열', () => {
  const md =
    '# Title\n\nHello **bold** and `co de` and [x](http://a.com)\n\n' +
    '- a\n  - b\n1. one\n2. two\n\n- [ ] todo1\n- [x] done1\n\n' +
    '> quote line\n\n```js\nconst x=1\n```\n\n---\n\n' +
    '| a | b |\n| --- | --- |\n| 1 | 2 |'
  assert.deepEqual(norm(markdownToBlocks(md)), [
    { type: 'heading', content: { html: 'Title', level: 1 } },
    {
      type: 'paragraph',
      content: {
        html:
          'Hello <strong>bold</strong> and <code>co de</code> and ' +
          '<a href="http://a.com" target="_blank" rel="noopener noreferrer">x</a>',
      },
    },
    { type: 'bullet', content: { html: 'a', indent: 0 } },
    { type: 'bullet', content: { html: 'b', indent: 1 } },
    { type: 'numbered', content: { html: 'one', indent: 0 } },
    { type: 'numbered', content: { html: 'two', indent: 0 } },
    { type: 'todo', content: { html: 'todo1', checked: false } },
    { type: 'todo', content: { html: 'done1', checked: true } },
    { type: 'quote', content: { html: 'quote line' } },
    { type: 'code', content: { code: 'const x=1', language: 'js' } },
    { type: 'divider', content: {} },
    {
      type: 'table',
      content: {
        columns: [
          { id: 'ID', name: 'a', type: 'text' },
          { id: 'ID', name: 'b', type: 'text' },
        ],
        cells: [['1', '2']],
      },
    },
  ])
})

test('inlineMarkdown: 코드 스팬 옆 숫자(2024) 보존 (U+E000 sentinel)', () => {
  assert.equal(
    inlineMarkdown('use `x` in 2024 and **bold**'),
    'use <code>x</code> in 2024 and <strong>bold</strong>'
  )
})

test('inlineMarkdown: 링크는 절대 URL로 정규화 + italic', () => {
  assert.equal(
    inlineMarkdown('[t](example.com) and *it*'),
    '<a href="https://example.com" target="_blank" rel="noopener noreferrer">t</a> and <em>it</em>'
  )
})

test('looksLikeMarkdown', () => {
  assert.equal(looksLikeMarkdown('# hi'), true)
  assert.equal(looksLikeMarkdown('a **b** c'), true)
  assert.equal(looksLikeMarkdown('just plain text here'), false)
})

test('gridToTSV / gridToCSV: RFC4180 인용', () => {
  assert.equal(gridToTSV([['a', 'b,c'], ['d\te', 'f']]), 'a\tb,c\n"d\te"\tf')
  assert.equal(gridToCSV([['a', 'b,c'], ['d"e', 'f']]), 'a,"b,c"\r\n"d""e",f')
})

test('gridToHtmlTable: 빈 셀은 &nbsp;', () => {
  assert.equal(
    gridToHtmlTable([['a', ''], ['<b>', 'c']]),
    '<table><tr><td>a</td><td>&nbsp;</td></tr><tr><td><b></td><td>c</td></tr></table>'
  )
})

test('parseDelimitedFile: CSV(BOM+인용) / TSV', () => {
  assert.deepEqual(parseDelimitedFile('x.csv', '﻿a,b\n1,"2,3"\n'), [
    ['a', 'b'],
    ['1', '2,3'],
  ])
  assert.deepEqual(parseDelimitedFile('x.tsv', 'a\tb\n1\t2\n'), [
    ['a', 'b'],
    ['1', '2'],
  ])
})

test('isTableFile: 확장자 대소문자 무시', () => {
  assert.equal(isTableFile(new File([''], 'x.CSV')), true)
  assert.equal(isTableFile(new File([''], 'x.txt')), false)
})

test('escapeHtml: &, <, > 를 이스케이프 (공유 유틸)', () => {
  assert.equal(escapeHtml('a & b < c > d'), 'a &amp; b &lt; c &gt; d')
  assert.equal(escapeHtml('<a href="x">'), '&lt;a href="x"&gt;')
})
