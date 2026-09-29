# [BE] 가입 알림 + DAU·완청률·리텐션 Slack 연동

| 항목 | 값 |
|---|---|
| 요청 파트 | backend |
| 요청자 | 이주호(PM) — 2026-09-27 주간 계획 · 2026-09-29 범위 추가 |
| 담당 | 박준현 |
| 발행 날짜 | 2026-09-27 |
| 시작 날짜 | 2026-09-27 |
| 기한 | 2026-09-30 (Medium — 3일 안). 1단계 코드는 2026-09-29 반영, env 설정만 남았다 |
| 선행 | **1단계**: Slack 수신 웹훅 생성 + **운영·개발계 양쪽** env 설정(`SLACK_SIGNUP_WEBHOOK_URL`) — 사람 손, AWS 접근 필요. **2단계**: 없음 |
| Jira | [KAN-107](https://runtime364.atlassian.net/browse/KAN-107) (담당: 박준현) |
| 중요도 | Medium — PM 이 중요도를 따로 정하지 않아 기본값. **Jira 우선순위가 Low 로 되어 있어 불일치** — 기한 09-30 은 Medium(+3일) 환산값이므로 Jira 쪽을 Medium 으로 맞춰야 한다 |
| 상태 | **진행 중**(2026-09-29 전환) |

## 요청 — 2단계로 나눈다

### 1단계 — 가입 건별 Slack 알림 (2026-09-29 추가)

GA4 `sign_up` 이벤트를 받아 Slack 에 게시한다. "하루 한 번"으로 줄이기 전에 **우선 들어올 때마다** 보고 싶다는 PM 요청이다.

- 메시지는 **`가입 · 카카오 · 시각`** 수준으로 짧게.
- **이메일·닉네임 등 신원 값은 넣지 않는다**(`backend/convention.md` 8.4 — 로그에 신원 값 금지). 제공자(`method`)와 시각만으로 충분하다.
- 빈도가 부담스러워지면 같은 경로로 일일 집계로 바꾼다 — 그것이 2단계다.

### 2단계 — DAU·완청률·리텐션 일일 보고 (원래 요청)

지표를 집계해 Slack 에 정기 보고한다 — 지표 정의(서비스 날짜 04시 경계, 완청 판정 기준)를 문서에 맞추고 일일(또는 주간) 자동 게시.

## 1단계 — 구현 방식을 서버 직접 발송으로 바꿨다 (2026-09-29)

처음에는 GA4 `sign_up` 이벤트를 받아 오는 쪽으로 잡았다가 **서버에서 직접 보내는 쪽으로 되돌렸다.**

**GA4 에는 이벤트 웹훅이 없다.** "이벤트가 들어오면 URL 호출" 기능이 아예 없어서, 알림을 받으려면 Data API 를 5분마다 폴링하거나(집계 수치만 나온다) BigQuery 스트리밍 내보내기를 붙여야 한다(GCP 결제 필요). 게다가 GA4 는 **1.1.0 스토어 게시** 이후에야 이벤트가 들어온다 — 지금 스토어 빌드는 1.0.0 이고 GA4 는 2026-09-23(runtime 7)에 들어갔다.

서버는 그 모든 것과 무관하다. 가입은 `auth.service.ts` 의 `signUp()` 을 반드시 거치고, 그 시점이 **가입의 진실**이다. 스토어 게시를 기다릴 필요도, 앱 버전을 가릴 필요도, 새 인프라도 없다.

앱에서 직접 Slack 을 부르는 안은 **쓰지 않는다** — 웹훅 URL 이 앱 번들에 박혀 누구나 뜯어 채널에 도배할 수 있다.

### 무엇을 넣었나

| | |
|---|---|
| `auth/services/signup-alert.service.ts` | 새 파일. 문구 조립(`formatSignupText`)과 발송을 나눠 문구는 순수 함수로 검증한다 |
| `auth/services/auth.service.ts` | `signUp()` 에서 **계정이 실제로 생겼을 때만** 호출. `await` 하지 않는다 |
| `config/env.validation.ts` | `SLACK_SIGNUP_WEBHOOK_URL`(선택). 비우면 꺼진다 |

- **가입을 방해하지 않는다.** 호출부가 `await` 하지 않고, 실패는 `logger.warn` 으로만 끝난다. Slack 이 죽어도 가입 응답이 밀리지 않는다(타임아웃 3초).
- **같은 signup token 재호출에는 알리지 않는다.** `signUp()` 은 멱등이라 기존 계정을 찾으면 계정을 만들지 않는다 — 그때는 가입이 아니다.
- **신원 값을 보내지 않는다**(`convention.md` 8.4). 문구는 `:wave: 가입 · 카카오 · 09-29 14:03` 이고 시각은 서버가 UTC 여도 KST 로 적는다.
- **장애 채널과 나눈다.** `SLACK_ERROR_WEBHOOK_URL`(자원 경보)과 다른 웹훅을 쓴다 — 즉시 반응해야 하는 알림과 흘려보며 보는 값을 섞으면 둘 다 안 보게 된다.
- **운영·개발계가 섞이지 않는다.** 운영이 아니면 문구 앞에 `[development]` 처럼 환경을 붙인다. 기준은 `SENTRY_ENVIRONMENT` 다 — `NODE_ENV` 는 양쪽 다 `production` 이라 쓸 수 없다(개발계도 배포된 서버라 운영과 같은 코드 경로를 타야 한다).

### 남은 것 — 웹훅 URL 을 **양쪽** 서버 env 에 넣는다

**운영·개발계 둘 다 켠다**(PM 결정 2026-09-29). 개발계 가입은 `[development]` 접두가 붙어 운영과 섞이지 않는다. 같은 채널을 써도 되고, 나누려면 웹훅을 둘 만들면 된다.

> ⚠️ **순서를 지켜야 한다. 틀리면 다음 배포가 실패한다.**
> `deploy/apply-secrets.py` 는 Secrets Manager 에 있는 키가 `.env.prod` 에 **없으면 배포를 중단시킨다**(조용히 키를 늘리는 쪽이 더 위험하다는 판단 — `tickets/backend/archive/deploy-path-reads-secrets-manager.md`). 그래서 **서버 파일이 먼저**다.
> 다행히 중단 시점이 `.env.prod`·컨테이너를 건드리기 전이라 돌던 API 는 그대로 산다.

1. **Slack 수신 웹훅 생성** — Slack 앱 → Incoming Webhooks → 채널 선택 → URL 복사. (`SLACK_ERROR_WEBHOOK_URL` 과 **다른 웹훅**을 쓴다. 같은 채널이어도 무방하지만 나중에 채널을 가르려면 지금 나눠 두는 편이 낫다)

2. **각 서버의 `.env.prod` 에 키를 먼저 추가** — 운영·개발계 각각:
   ```bash
   # 서버에서 (/opt/ear/backend)
   grep -q '^SLACK_SIGNUP_WEBHOOK_URL=' .env.prod \
     || printf '\n# 가입 알림 Slack 웹훅 (KAN-107)\nSLACK_SIGNUP_WEBHOOK_URL=\n' >> .env.prod
   ```

3. **Secrets Manager 에 같은 키를 추가** — 운영 `ear/prod/api`, 개발계 `ear/dev/api` 둘 다. JSON 묶음이라 기존 값을 보존하며 키만 더한다:
   ```bash
   for SID in ear/prod/api ear/dev/api; do
     aws secretsmanager get-secret-value --secret-id "$SID" --query SecretString --output text \
       | python3 -c 'import json,sys,os; d=json.load(sys.stdin); d["SLACK_SIGNUP_WEBHOOK_URL"]=os.environ["HOOK"]; print(json.dumps(d))' \
       | aws secretsmanager put-secret-value --secret-id "$SID" --secret-string file:///dev/stdin
   done
   ```
   (`HOOK` 에 웹훅 URL 을 넣어 둔다. 운영·개발계 웹훅을 다르게 쓰려면 반복문 대신 각각 실행)

4. **재배포** — `dev` 와 `main` 각각. 배포가 `.env.prod` 의 그 줄을 Secrets 값으로 덮는다.

5. **확인** — 각 환경에서 실제로 가입해 보고 채널에 줄이 올라오는지 본다. 개발계 줄에는 `[development]` 가 붙어야 한다.

**웹훅을 넣기 전까지는 조용히 꺼진 상태다** — 코드를 먼저 머지해도 채널이 시끄러워지지 않는다.

### GA4 는 어떻게 되나

버리지 않는다. 퍼널·리텐션·코호트는 GA4 가 훨씬 낫고, 1.1.0 이 게시되면 `sign_up` 이벤트가 GA4 에도 그대로 쌓인다. **알림만 서버에서 보내는 것**이다.

## 완료 조건

**1단계**

- Given `SLACK_SIGNUP_WEBHOOK_URL` 이 설정된 서버 / When 사용자가 가입한다 / Then Slack 채널에 `가입 · <제공자> · <시각>` 이 올라온다
- Given 그 메시지 / When 내용을 본다 / Then 이메일·닉네임 등 신원 값이 들어 있지 않다
- Given 전달 경로가 죽어 있다(자격 만료·쿼터 초과) / When 알림이 실패한다 / Then 서버 동작에는 영향이 없고 경고 로그만 남는다
- Given 같은 signup token 으로 두 번 호출된다 / When 두 번째가 처리된다 / Then 알림이 두 번 올라오지 않는다
- Given 개발계 서버 / When 알림이 올라온다 / Then 환경 표시가 붙어 운영과 구분된다
- Given 웹훅이 비어 있다 / When 가입한다 / Then 알림 없이 가입이 정상 완료된다

**2단계**

- Given 보고 채널 / When 정해진 시각이 되면 / Then DAU·완청률·리텐션이 게시된다
- Given 지표 정의 / When 문서를 보면 / Then 계산식이 적혀 있다

## 처리 기록

- 2026-09-27 발행(PM 주간 계획).
- 2026-09-29 **진행 중 전환 + 범위 추가**(PM 요청). 1단계(가입 건별 알림)를 앞에 놓고 원래 요청을 2단계로 뒤에 둔다. 같은 내용을 Jira 코멘트로도 남겼다. 조사해서 확정한 것:
  - GA4 도입은 2026-09-23(runtime 7), 스토어 빌드는 1.0.0 → **현재 스토어 사용자에게는 GA4 가 없다**(선행).
  - `sign_up` 이벤트·`method` 파라미터는 앱에 이미 있다(`session.service.ts:61`).
  - **GA4 에는 이벤트 웹훅이 없다** — 전달 경로 결정이 착수 조건이다(미결).
  - 백엔드 Slack webhook 은 이미 있다(`SLACK_ERROR_WEBHOOK_URL` · `resource-alert.service.ts`) — 발송 방식을 그대로 따랐다.
- 2026-09-29 **1단계 코드 반영.** GA4 경로를 접고 서버 직접 발송으로 바꿨다(위 "구현 방식" 참조 — GA4 에 이벤트 웹훅이 없고, 스토어 게시를 기다려야 하기 때문). 백엔드 테스트 842건 통과·타입체크·lint 통과. **남은 것**: 웹훅 생성 + 운영·개발계 양쪽 env 설정(위 5단계) 후 실제 가입으로 확인.
- 2026-09-29 **양쪽 환경 모두 켜기로 결정**(PM). 개발계 가입도 `[development]` 접두로 함께 본다. 설정 절차를 적으며 **`apply-secrets.py` 의 함정**을 확인했다 — Secrets Manager 에 키를 먼저 넣고 `.env.prod` 에 없으면 **다음 배포가 중단된다**. 서버 파일이 먼저다.
