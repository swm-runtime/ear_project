# 콘텐츠 동기화 — 들여오기 실패를 숨기지 않기 · 동기화 표에 행을 넣는 마이그레이션은 고정 ID (BE·INFRA)

| 항목 | 값 |
|---|---|
| 대상 문서 | `infra/runbook.md` 콘텐츠 동기화 절(확인·문제 해결) · `backend/convention.md` 4.5 마이그레이션 |
| 요청 파트 | 백엔드·인프라 — 박준현 |
| 발행 날짜 | 2026-10-16 |
| 관련 | 스크립트 `backend/deploy/sync-content-import.sh`(PR `fix(infra)/content-sync-import-fail-loud`) · 마이그레이션 `1790100000000-AddTopicSlugAndGlobalTopics` |

## 무슨 일이 있었나

- GLOBAL 주제 8개는 마이그레이션이 `INSERT`로 만든다. 개발계(10-14)와 운영(10-15)에서 **각자 실행돼 ID가 서로 달랐다.**
- 동기화는 주제를 ID로 upsert한다. 그래서 운영 행이 개발계의 같은 `(market, slug)`와 부딪쳐 `uq_topics_market_slug` 위반이 났다.
- 그 회차의 upsert는 **통째로 취소됐다.** 10-15부터 11회 연속 실패했고, 개발계 콘텐츠는 63편(운영 71편)에 멈췄다. 개발계를 보는 랜딩도 함께 멈췄다.
- **아무도 몰랐다.** 들여오기 스크립트가 upsert 출력을 거르고 `|| true`로 삼켜서 `content import ok`를 찍고 ETag까지 적었다.
- 행 수 검증은 "개발계가 운영보다 적으면 실패"라 통과했다. 개발계에는 옛 행이 남아 원래 더 많다.
- 2026-10-16에 복구했다. 개발계의 GLOBAL 주제 8개는 참조 0건이었다. 이 8개를 지우고 ETag를 지운 뒤 들여오기를 다시 돌렸다.

## 수정 내용

- **`infra/runbook.md` 확인·문제 해결**에 다음을 더한다.
  - `content import FAILED: upsert 오류`가 찍히면 그 회차는 아무것도 반영되지 않은 것이다. 바로 위 `ERROR` 줄이 원인이다. ETag를 적지 않으므로 원인을 고치면 다음 알림·크론이 같은 덤프로 다시 시도한다.
  - **수동 재시도할 때 ETag가 이미 적혀 있으면 `import skip`만 나온다.** `/opt/ear/backend/.content-sync-etag`를 지운 뒤 돌린다.
  - 유일 제약 위반(`duplicate key … uq_…`)은 대개 **개발계·운영에서 따로 만든 같은 행**이다. 참조가 없으면 개발계 쪽을 지우고 운영 행을 받는다.
- **`backend/convention.md` 4.5 마이그레이션**에 한 줄을 더한다.
  - **동기화 대상 표**(`sync-content-*.sh`의 `TABLES` — topics·contents 등)에 행을 넣는 마이그레이션은 **ID를 고정값으로 넣는다.** 예: 마이그레이션에 UUID 상수를 적는다.
  - `uuid_generate_v4()`로 만들면 환경마다 ID가 달라 운영 → 개발계 동기화가 유일 제약에서 막힌다.

## 완료 조건

- Given `infra/runbook.md` 콘텐츠 동기화 절 / Then upsert 실패 로그의 뜻과 ETag를 지우는 수동 재시도가 적혀 있다
- Given `backend/convention.md` 4.5 / Then 동기화 대상 표에 행을 넣는 마이그레이션은 고정 ID라는 규칙이 있다

## 처리 기록

- 2026-10-16 발행(스크립트 수정 PR과 함께). 반영 전.
