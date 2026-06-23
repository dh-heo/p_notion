import express from "express";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pages } from "./routes/pages.js";
import { blocks } from "./routes/blocks.js";
import { search } from "./routes/search.js";
import { bookmark } from "./routes/bookmark.js";
import { upload, UPLOAD_DIR } from "./routes/upload.js";
import { ingest } from "./routes/ingest.js";
import { auth } from "./routes/auth.js";
import { requireAuth } from "./auth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(express.json({ limit: "5mb" }));

// 공개 엔드포인트 (인증 게이트 앞)
app.use("/api/auth", auth);
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// 이 지점 이후의 모든 데이터/업로드는 로그인 필요
app.use("/api", requireAuth);
app.use("/api", pages);
app.use("/api", blocks);
app.use("/api", search);
app.use("/api", bookmark);
app.use("/api", upload);
app.use("/api", ingest);

// 업로드된 파일도 인증된 사용자만 읽을 수 있게 정적 서빙
app.use("/uploads", requireAuth, express.static(UPLOAD_DIR));

// 프로덕션: 빌드된 클라이언트를 같은 프로세스에서 서빙 (원-프로세스 배포).
// 개발 땐 Vite(:5173)가 클라이언트를 서빙하므로 비활성.
if (process.env.NODE_ENV === "production") {
  const CLIENT_DIST = join(__dirname, "..", "client", "dist");
  app.use(express.static(CLIENT_DIST));
  // SPA 폴백: /api·/uploads 가 아닌 GET 은 index.html 로 (클라이언트 라우팅)
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) {
      next();
      return;
    }
    res.sendFile(join(CLIENT_DIST, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}`);
});
