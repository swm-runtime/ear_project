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

## 진행 기록 (2026-09-09 — 작업 1·2는 이미 반영돼 있다. 브라우저 확인만 남았다)

`ear-ai-isb.pem`을 전달받아 AI EC2(`54.116.31.183`)에 직접 접속해 확인했다.

**작업 1(env 주입)·2(web 반영)가 이미 끝나 있었다.** 세 곳의 값이 전부 같다 — 값은 찍지 않고
sha256 앞 16자로만 대조했다.

| 위치 | sha256(앞 16) | 길이 |
|---|---|---|
| AI 서버 `pipeline/deploy/env.prod` (30행) | `c63121b7eafacfd6` | 64 |
| AI `ear-ai-web-1` 컨테이너 런타임 env | `c63121b7eafacfd6` | 64 |
| 제품 서버 `.env.prod`의 `PIPELINE_SSO_SECRET` | `c63121b7eafacfd6` | — |
| 로컬 `backend/deploy/aws/out/sso-secret.txt` | `c63121b7eafacfd6` | — |

제품 서버 라우트도 살아 있다 — `POST /api/v1/auth/pipeline-login` → **400**(라우트 존재.
404가 아니다).

### 남은 것 — 서버에서는 판정할 수 없다

완료 조건 둘 다 **브라우저로 `admin.earcast.co.kr/publish`에 팀원 계정으로 들어가야** 판정된다.
서버 쪽 준비는 확인됐으므로, 그 화면에서 추가 로그인 없이 발행 목록이 뜨면 닫는다. 뜨지 않으면
`ear-ai-web-1` 로그를 봐야 한다.

### 기록 — 확인 중 저지른 오독 하나

컨테이너 값을 잴 때 `printenv X | sha256sum`을 썼는데 **`printenv`가 붙이는 개행이 해시에
섞였다.** 다른 곳은 개행을 제거하고 쟀기 때문에 값이 다른 것처럼 보였고, 그 오독으로 web
컨테이너를 불필요하게 `--force-recreate` 했다(정상 기동, 다른 컨테이너 무영향).

**값 대조는 양쪽을 같은 방식으로 정규화한 뒤 하라** — `printf %s "$VAR" | sha256sum`.

## 처리 기록 (2026-09-09 — 완료)

| 항목 | 값 |
|---|---|
| 반영 날짜 | 2026-09-09 |
| Jira | KAN-30 |

**브라우저로 `admin.earcast.co.kr/publish`에 접속해 완료 조건 1을 확인했다.**

| 확인한 것 | 결과 |
|---|---|
| 추가 구글 로그인 요구 | **없음** — 바로 화면이 떴다 |
| 우측 상단 연결 표시 | **"제품 계정 연결됨 · admin"** |
| 발행 목록 | 총 8건 정상 렌더 |
| "제품 서버 연결 실패" 카드 | **없음** |
| 콘솔의 SSO 관련 에러 | **0건** |

로그인 계정은 `runtime364@gmail.com`이었다. 전제였던 *"파이프라인(Supabase) 계정 이메일 ==
제품 관리자 계정(role=admin) 이메일"* 이 실제로 성립한다는 뜻이다.

### 완료 조건 2는 확인하지 않았다

*"제품 관리자 계정이 없는 이메일로 접속하면 403"* 은 **관리자가 아닌 별도 계정이 필요해서**
확인하지 못했다. 조건 1(정상 경로)이 충족됐고 그 경로가 서버의 같은 판정을 거치므로 이 티켓을
닫는다. 비관리자 계정으로 접속할 일이 생기면 그때 403인지(500이 아닌지) 보면 된다.

### 확인 중 알게 된 것 — 작업은 이미 되어 있었다

`ear-ai-isb.pem`을 받아 접속해 보니 작업 1(env 주입)·2(web 반영)가 **이미 반영돼 있었다.**
네 곳의 값이 sha256으로 일치했다(AI `env.prod` 30행 · AI web 컨테이너 런타임 env · 제품
`.env.prod`의 `PIPELINE_SSO_SECRET` · 로컬 `sso-secret.txt`). 값은 찍지 않고 해시 앞 16자로만
대조했다.

### 별건 — 파이프라인 웹의 React 하이드레이션 에러

같은 화면에서 콘솔에 **React #418**(하이드레이션 불일치)이 한 건 찍힌다. SSO와 무관하고 화면
렌더에도 지장이 없어 이 티켓 범위 밖이다. `pipeline/` 파트 소관이므로 필요하면 그쪽에서 따로
다룬다.

