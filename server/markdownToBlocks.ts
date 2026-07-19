// 마크다운 → 블록 변환 (DB 비의존 순수 로직). routes/ingest.ts가 사용.
// 지원: heading(#/##/###), bullet(-,*,+, 들여쓰기), todo(- [ ]/- [x]),
//       code(```lang ... ```), quote(>), divider(---), 나머지는 paragraph.
// 인라인: **bold** *italic* `code` [text](url) → RichText가 저장하는 HTML 태그로.
//
// 주의: 클라이언트의 src/markdown.ts와 규칙은 "닮았지만" 동일하지 않다(의도된 별도 구현).
// 예: 여기 inline()은 코드 스팬 플레이스홀더를 공백+숫자로, 클라이언트는 U+E000 sentinel로 처리하며,
//     클라이언트는 표(| a | b |)·번호목록도 파싱한다. 두 구현의 현재 동작은
//     tests/parser-drift.test.ts가 고정한다 — 한쪽만 바꾸면 그 테스트가 drift를 알려준다.

export type Block = { type: string; content: Record<string, unknown> };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// 인라인 마크다운을 SANITIZE 허용 태그(strong/em/code/a)로 변환.
// 먼저 escape한 뒤, 코드 스팬을 플레이스홀더로 빼두어 그 안은 변환하지 않는다.
export function inline(src: string): string {
  const codes: string[] = [];
  let s = src.replace(/`([^`]+)`/g, (_m, c: string) => {
    codes.push(`<code>${escapeHtml(c)}</code>`);
    return ` ${codes.length - 1} `;
  });
  s = escapeHtml(s);
  // [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, url: string) => {
    const safe = /^(https?:|mailto:|\/)/i.test(url) ? url : `https://${url}`;
    return `<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  });
  // **bold** / __bold__
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  // *italic* / _italic_
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^_])_([^_]+)_/g, "$1<em>$2</em>");
  // 코드 스팬 복원
  s = s.replace(/ (\d+) /g, (_m, i: string) => codes[Number(i)]);
  return s;
}

export function markdownToBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 코드 펜스
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const language = fence[1] || "bash";
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // 닫는 펜스 소비
      blocks.push({ type: "code", content: { code: body.join("\n"), language } });
      continue;
    }

    // 빈 줄: 단락 구분
    if (line.trim() === "") {
      i++;
      continue;
    }

    // 구분선
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push({ type: "divider", content: {} });
      i++;
      continue;
    }

    // 헤딩
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      blocks.push({
        type: "heading",
        content: { html: inline(h[2].trim()), level: h[1].length },
      });
      i++;
      continue;
    }

    // 인용
    const q = line.match(/^>\s?(.*)$/);
    if (q) {
      blocks.push({ type: "quote", content: { html: inline(q[1].trim()) } });
      i++;
      continue;
    }

    // todo: - [ ] / - [x]
    const t = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/);
    if (t) {
      blocks.push({
        type: "todo",
        content: {
          html: inline(t[3].trim()),
          checked: t[2].toLowerCase() === "x",
        },
      });
      i++;
      continue;
    }

    // 불릿: 들여쓰기 2칸 = 1단계
    const b = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (b) {
      const indent = Math.min(6, Math.floor(b[1].replace(/\t/g, "  ").length / 2));
      blocks.push({
        type: "bullet",
        content: { html: inline(b[2].trim()), indent },
      });
      i++;
      continue;
    }

    // 그 외: 단락 (연속된 비특수 줄을 <br>로 합침)
    const para: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^```/.test(lines[i]) &&
      !/^(#{1,3})\s/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^\s*[-*+]\s/.test(lines[i]) &&
      !/^\s*([-*_])\1{2,}\s*$/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push({
      type: "paragraph",
      content: { html: para.map((l) => inline(l.trim())).join("<br>") },
    });
  }

  return blocks;
}
