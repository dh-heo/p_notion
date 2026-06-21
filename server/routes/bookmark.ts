import { Router } from "express";

export const bookmark = Router();

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

// <meta property|name="KEY" content="..."> 에서 content 추출 (속성 순서 무관)
function metaContent(html: string, keys: string[]): string {
  for (const key of keys) {
    const a = html.match(
      new RegExp(
        `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`,
        "i"
      )
    );
    if (a?.[1]) return decode(a[1]);
    const b = html.match(
      new RegExp(
        `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`,
        "i"
      )
    );
    if (b?.[1]) return decode(b[1]);
  }
  return "";
}

// POST /api/bookmark { url } → 페이지 메타데이터 (제목/설명/대표이미지)
bookmark.post("/bookmark", async (req, res) => {
  const raw = String(req.body?.url ?? "").trim();
  if (!raw) {
    res.status(400).json({ error: "no url" });
    return;
  }
  const target = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(target, {
      signal: ctrl.signal,
      headers: { "user-agent": "Mozilla/5.0 (p_notion bookmark)" },
    });
    clearTimeout(timer);
    const html = (await r.text()).slice(0, 500_000); // 본문이 거대할 수 있어 앞부분만
    const title =
      metaContent(html, ["og:title", "twitter:title"]) ||
      decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "");
    const description = metaContent(html, [
      "og:description",
      "twitter:description",
      "description",
    ]);
    let image = metaContent(html, ["og:image", "twitter:image"]);
    if (image && !/^https?:\/\//i.test(image)) {
      try {
        image = new URL(image, target).href;
      } catch {
        image = "";
      }
    }
    res.json({ url: target, title: title || target, description, image });
  } catch {
    // fetch 실패해도 url만 담아 카드로는 표시되게 한다
    res.json({ url: target, title: target, description: "", image: "" });
  }
});
