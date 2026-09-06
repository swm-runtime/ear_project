# AI 서버 웹 env에 EAR_SSO_SECRET 주입 + web 재시작

| 항목 | 값 |
|---|---|
| 발행 날짜 | 2026-09-04 |
| 발행자 | BE/infra (이주호) |
| 대상 | AI 서버 EC2(54.116.31.183, admin.earcast.co.kr)의 `pipeline/deploy` env(`env.prod`) |
| 선행 | 제품 서버 측은 완료 — `/auth/pipeline-login` 배포·`PIPELINE_SSO_SECRET` 주입 끝(2026-09-04) |

## 배경

발행 콘솔 이중 로그인 제거(SSO, PR #100)가 머지·배포됐지만, 파이프라인 웹 서버에 서명 키
`EAR_SSO_SECRET`이 없어 `/publish`에서 "EAR_SSO_SECRET 미설정 — 서버 env 확인"이 뜬다.
제품 서버 쪽 절반(코드 배포 + `PIPELINE_SSO_SECRET`)은 완료된 상태다. **키 값은 이주호
로컬 `backend/deploy/aws/out/sso-secret.txt`가 유일 사본** — 비밀 채널로 전달받을 것
(레포·티켓에 값 기재 금지). `ear-ai-isb.pem` 보유자가 수행해야 한다(이주호 로컬에 pem 없음).

## 작업

1. AI EC2 접속(ear-ai-isb.pem) → 파이프라인 배포 디렉토리의 `env.prod`에 한 줄 추가:
   `EAR_SSO_SECRET=<전달받은 값>` (제품 서버 `PIPELINE_SSO_SECRET`과 같은 값이어야 함)
2. `docker compose -f docker-compose.prod.yml --env-file env.prod up -d web` (또는 restart web)
3. 확인: admin.earcast.co.kr `/publish` 진입 시 구글 로그인 없이 "제품 서버 연결" 자동 완료.
   전제: 파이프라인(Supabase) 계정 이메일 == 제품 관리자 계정(role=admin) 이메일.

## 완료 조건 (Given/When/Then)

- Given 파이프라인 웹에 팀원 계정으로 로그인한 상태에서, When `/publish`에 진입하면,
  Then 추가 로그인 없이 발행 목록이 뜬다(연결 실패 카드 없음).
- Given 제품 관리자 계정이 없는 이메일로 접속하면, When `/publish`에 진입하면,
  Then "제품 서버 연결 실패" 카드에 403 사유가 뜬다(500 아님).
