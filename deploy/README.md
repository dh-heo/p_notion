# deploy/

단일 인스턴스(EC2/Lightsail) 배포용 예시 설정. 전체 배경·주의사항은 루트 `CLAUDE.md`의 **Deployment (AWS, single instance)** 참고.

- `p_notion.service` — 서버를 상시 실행하는 systemd 유닛 (`npm start`).
- `nginx.conf` — TLS 종료 후 Node(:3001)로 전부 프록시하는 Nginx 사이트 설정.

## 순서 요약

```bash
# 1) 코드 받기 + 빌드 (대상 Linux 에서 실행 — better-sqlite3 네이티브 빌드)
git clone <repo> && cd p_notion
npm ci
npm --prefix client ci
npm run build                      # → client/dist

# 2) 서버 상시 실행 (systemd)
sudo cp deploy/p_notion.service /etc/systemd/system/p_notion.service
#   User / WorkingDirectory / ExecStart(npm 경로) 를 환경에 맞게 수정
sudo systemctl daemon-reload
sudo systemctl enable --now p_notion

# 3) Nginx + TLS
sudo cp deploy/nginx.conf /etc/nginx/sites-available/p_notion
sudo ln -s /etc/nginx/sites-available/p_notion /etc/nginx/sites-enabled/p_notion
#   nginx.conf 의 your.domain.com 치환
sudo certbot --nginx -d your.domain.com
sudo nginx -t && sudo systemctl reload nginx
```

## 첫 비밀번호 (레이스 회피)

1. 보안그룹을 **내 IP만** 허용한 상태로 띄운다.
2. 앱에 접속해 setup 화면에서 비밀번호를 설정한다.
3. 그 후 보안그룹을 넓힌다.

비밀번호 분실 시 복구 경로는 `app_user` 초기화(= `npm run reset`, **모든 데이터도 삭제됨**) 후 재설정.
