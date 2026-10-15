# [FE] 가비아 DNS — `admin-global.earcast.co.kr` A 레코드 추가

| 항목 | 값 |
|---|---|
| 대상 | 가비아 DNS 관리 — `earcast.co.kr` 레코드 1건 추가 |
| 요청 파트 | 프론트엔드 (가비아 계정 접근 보유) |
| 요청자 | 박수헌 |
| 담당 | 이주호 |
| 발행 날짜 | 2026-10-14 |
| Jira | [KAN-210](https://runtime364.atlassian.net/browse/KAN-210) · 에픽 [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) |
| 시작 날짜 | 2026-10-14 |
| 기한 | 2026-10-15 (Jira 기준으로 맞춤 — 2026-10-15) |
| 선행 | 없음 |
| 관련 | 이 티켓이 [KAN-208](https://runtime364.atlassian.net/browse/KAN-208)(글로벌 인스턴스 인프라)을 막는다 — PR #1529 는 이 레코드가 조회된 뒤 머지한다 |
| 근거 문서 | `docs/infra/inventory.md` 3장(도메인·DNS — 가비아) · `docs/ai/global/PIPELINE.md` 8장(콘솔 주소) · `pipeline/deploy/README.md` 9장 |
| 심각도 | 상 |
| 중요도 | High(오늘 안) — 글로벌 파이프라인 인프라 작업(KAN-208)이 이 레코드를 기다린다 |
| 상태 | 대기 |

## 문제

글로벌판 파이프라인 콘솔을 `admin-global.earcast.co.kr`로 띄운다(한국판 `admin.earcast.co.kr`과 같은 AI 서버). `earcast.co.kr` DNS는 가비아에서 손으로 관리하는데, 요청자 계정으로는 가비아에 접근할 수 없다. 레코드가 없으면 서버의 Caddy가 이 주소의 인증서를 발급받지 못해 글로벌 콘솔 배포(PR #1529)를 머지할 수 없다.

## 요청 내용

1. 가비아 DNS 관리에서 `earcast.co.kr`에 레코드 하나를 추가한다.

| 타입 | 호스트 | 값 | TTL |
|---|---|---|---|
| A | `admin-global` | `54.116.31.183` | 기본값(예: 600) |

   - 값은 `admin` 레코드와 같은 AI 서버 고정 IP다.
2. 다른 레코드(루트 `@`·`www`·`admin`·`api`·`api-dev` 등)는 건드리지 않는다.
3. 추가했으면 Jira 코멘트로 알린다 — 요청자가 조회를 확인하고 PR #1529 를 머지한다.

## 완료 조건

- Given 레코드를 추가했다 / When `dig +short admin-global.earcast.co.kr` 를 실행한다 / Then `54.116.31.183` 이 나온다
- Given 레코드 추가 전후 / When `admin.earcast.co.kr`·`api.earcast.co.kr`·`earcast.co.kr` 을 조회한다 / Then 값이 바뀌지 않았다

## 처리 기록

- 2026-10-14 발행(KAN-208 진행 중 — 요청자 가비아 접근 없음).
