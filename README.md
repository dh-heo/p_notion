# p_notion

개인용 단일 사용자 Notion 클론. 따뜻하고 읽기 좋은 로컬 웹앱으로, 데이터는 SQLite로 디스크에 영속됩니다.
멀티유저·실시간 동시편집은 의도적으로 배제했고, **비밀번호 게이트(계정 1개, 최초 실행 시 설정)**로 잠가 둡니다.

> 구조: **workspace > page > block**

## 주요 기능

- **블록 편집** — 문단 · 제목(H1–H3) · 불릿(들여쓰기 계층) · 할 일 · 코드 · 이미지 · 파일 · 구분선 · 표 · YouTube 임베드
- **마크다운 단축** — `# `/`## `/`### `, `- `, `[] `, 그리고 줄에 `----`만 입력 시 구분선
- **슬래시 메뉴**(`/`)로 블록 삽입, **인라인 서식 툴바**(굵게·기울임·밑줄·취소선·코드·링크·글자 크기·글자/형광 색)
- **표** — 텍스트/선택(칩) 열, 정렬·필터, 행·열 추가/삭제, 첫 행 머리글 지정, 영역 드래그 복사(엑셀/시트 붙여넣기 호환), CSV 가져오기/내보내기(UTF-8 BOM), 스프레드시트 붙여넣기
- **코드 블록** — CodeMirror 6, 언어: bash(기본) · python · R · markdown · html
- **드래그앤드롭** — 이미지/파일은 업로드, `.csv`/`.tsv`는 표로 변환
- **페이지 트리** 사이드바(드래그 정렬, 하위 페이지), **페이지 편집 잠금**
- **마지막 본 페이지 복원**, **반응형**(좁은 화면에서 사이드바 오버레이)

## 기술 스택

- **클라이언트**: React 19 · TypeScript · Vite · Zustand · dnd-kit · CodeMirror 6 · DOMPurify · lucide-react
- **서버**: Node · Express · better-sqlite3(WAL) · multer
- **인증**: scrypt 비밀번호 해시 + HMAC 서명 stateless 쿠키

## 빠른 시작 (개발)

요구사항: **Node 20+** (better-sqlite3 네이티브 빌드를 위해 `build-essential`/`python3` 등 빌드 도구 필요).

```bash
npm install                 # 루트(서버) 의존성
npm --prefix client install # 클라이언트 의존성
npm run dev                 # 서버(:3001) + 클라이언트(:5173) 동시 실행
```

브라우저에서 http://localhost:5173 접속 → 최초 1회 비밀번호를 설정하면 시작됩니다.
(Vite dev 서버가 `/api`·`/uploads`를 `:3001`로 프록시합니다.)

## 빌드 & 프로덕션 실행

```bash
npm run build   # 클라이언트 빌드 → client/dist
npm start       # 단일 프로세스로 API + 빌드된 클라이언트를 함께 서빙 (NODE_ENV=production, 기본 :3001)
```

`npm start`는 `NODE_ENV=production`이라 Express가 `client/dist`와 SPA 폴백까지 직접 서빙합니다(별도 정적 서버 불필요). 실행 전에 `npm run build`로 `client/dist`가 있어야 합니다.

### 환경 변수

| 변수 | 설명 |
|---|---|
| `PORT` | 리슨 포트 (기본 3001) |
| `NODE_ENV=production` | 단일 프로세스 클라이언트 서빙 활성화 (`npm start`가 설정) |
| `COOKIE_SECURE=true` | 세션 쿠키에 `Secure` 부여 — **HTTPS를 앞단에 둔 뒤에만** 켤 것 |

## 배포

단일 인스턴스(EC2/Lightsail) + 영구 볼륨 전제입니다. better-sqlite3(WAL)는 **단일 프로세스 전용**이라 오토스케일/다중 레플리카는 불가합니다. TLS는 앞단(Nginx/Caddy 또는 ALB)에서 종료해 Node 포트로 프록시하세요.

바로 수정해 쓸 수 있는 예시가 `deploy/`에 있습니다:

- `deploy/p_notion.service` — systemd 유닛(`npm start` 상시 실행)
- `deploy/nginx.conf` — TLS 종료 리버스 프록시(업로드 위해 `client_max_body_size 50m`)
- `deploy/README.md` — 설치 순서 및 첫 비밀번호(보안그룹 잠금) 절차

상태성 경로는 `server/data.db*`와 `server/uploads/` 둘뿐이라 이 두 가지만 백업하면 됩니다.

## 데이터 초기화

```bash
npm run reset   # 모든 페이지·블록·업로드 삭제 후 빈 스키마 재생성
```

> 주의: 파괴적입니다. better-sqlite3가 `data.db`를 점유하므로 **개발 서버를 멈춘 뒤** 실행하세요.

## 프로젝트 구조

```
.
├── server/            # Express + better-sqlite3 (REST API, 인증, 업로드)
│   ├── index.ts       # 앱 진입점 (인증 게이트 / 프로덕션 정적 서빙)
│   ├── db.ts          # SQLite 스키마/연결
│   ├── auth.ts        # 비밀번호 해시 + 세션 쿠키
│   └── routes/        # pages / blocks / upload / auth
├── client/            # Vite + React + Zustand 단일 페이지 앱
│   └── src/
│       ├── store.ts   # 상태 허브 (낙관적 업데이트 + 디바운스 저장)
│       └── components/# Editor / Sidebar / RichText / blocks/*
└── deploy/            # systemd · nginx 예시
```
