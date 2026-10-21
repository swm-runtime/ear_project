# [BE] 관리자 주제 목록에 시장(market) 칸·필터 — 콘솔에서 국내·글로벌 주제가 섞여 보인다

| 항목 | 값 |
|---|---|
| 대상 | `GET /admin/topics`(admin-api 4.1) 응답 항목·요청 파라미터 · 운영 `topics` 점검 |
| 요청 파트 | 백엔드 |
| 요청자 | 박수헌(AI) — 콘솔 주제 점검(2026-10-20) |
| 발행 날짜 | 2026-10-20 |
| Jira | [KAN-237](https://runtime364.atlassian.net/browse/KAN-237) |
| 시작 날짜 | 2026-10-20 |
| 기한 | 2026-10-23 (Low — 이번 주 금요일) |
| 선행 | 없음 |
| 근거 문서 | `spec/api/admin-api.md` 4.1·4.2 · `spec/api/global-api.md` 4.5·표 11번 · `domain.md` 4.1 `topics`(`market`, `uq_topics_market_slug`) |
| 중요도 | Low |
| 상태 | 발행 |

## 문제

- 앱 사용자 쪽은 시장별로 갈려 있다 — 온보딩·탐색·관심 주제가 `topic.market = user.market` 으로 거르고, 다른 시장 주제 저장은 409 `MARKET_MISMATCH` 다(코드 확인 2026-10-20).
- 그런데 **관리자 주제 목록은 두 시장 주제를 함께 주고 항목에 `market` 이 없다**(admin-api 4.1 "항목에 market 은 싣지 않는다"). 그래서 파이프라인 콘솔(국내·글로벌 두 인스턴스)의 발행·주제 관리 화면에 국내·글로벌 주제가 섞여 보였다.
- 더해서 **콘솔이 주제를 만들 때 `market` 을 보내지 않았다**(POST 4.2 — 없으면 `kr`). 글로벌 콘솔에서 주제를 만들거나 [체계와 맞추기]를 돌렸다면 K-Food 같은 영어 주제가 **국내 시장 주제로** 생겼을 수 있다. 노출 상태라면 국내 사용자에게 보인다. 운영 DB 확인을 시도했으나 SSH 가 네트워크에서 막혀 아직 못 봤다. 콘솔은 2026-10-20 고쳤다(생성에 시장을 싣고, 목록은 그 콘솔 시장 주제만 보인다 — 시장 칸이 없어 파이프라인 중분류 이름으로 임시로 가른다).

## 요청 내용

1. `GET /admin/topics` 응답 항목에 `market`(`kr` | `global`)을 싣는다.
2. `GET /admin/topics?market=kr|global` 필터를 받는다(없으면 지금처럼 전부). `GET /admin/contents` 의 `market` 필터(4.5)와 같은 방식.
3. 운영 `topics` 를 한 번 점검해 시장이 잘못 붙은 주제가 있는지 본다 — 이름에 한글이 없는데 `kr` 이거나 한글이 있는데 `global` 인 주제, 콘텐츠와 시장이 다른 연결(`content_topics` ↔ `contents.market`). 있으면 숨김·시장 정정을 AI 와 정한다.

콘솔은 1이 배포되면 `market` 값으로 가르고(이름 대조는 버린다), 2가 있으면 그것을 쓴다.

## 완료 조건

- Given 두 시장 주제가 있다 / When `GET /admin/topics` / Then 항목마다 `market` 이 있다
- Given `?market=global` / When 목록을 본다 / Then GLOBAL 주제만 온다
- Given 운영 `topics` 점검 / When 결과를 본다 / Then 시장이 잘못 붙은 주제·연결 수가 처리 기록에 있고, 있으면 처리 방법이 정해져 있다

## 처리 기록

- 2026-10-20 발행(마크다운 + Jira KAN-237, 중요도 Low · 시작 10-20 · 기한 10-23, KAN-193 과 relates 연결). KAN-193 에 같은 내용 코멘트. Slack 알림은 보내지 않았다(박수헌).
- 2026-10-21 요청 1·2 코드 PR(브랜치 `feat(be)/admin-topics-market`) — `GET /admin/topics` 항목에 `market`, `?market=kr|global` 필터(`GET /admin/contents` 4.5와 같은 `@IsEnum`, 없으면 전 시장, 틀린 값 400 `VALIDATION_FAILED`). `POST`·`PATCH` 응답 항목에도 실린다. 계약 문서 반영은 `changes/pending/admin-topics-market-field.md`. 요청 3 운영 점검은 읽기 전용 스크립트(`topics-market-audit.sh` — 이름·시장 엇갈림 주제와 콘텐츠 건수, `content_topics` ↔ `contents.market` 어긋난 연결의 주제별 수, 시장별 노출·숨김 주제 수)를 준비했다. **남은 일**: 점검을 돌려 건수를 이 처리 기록에 적고, 있으면 숨김·시장 정정을 AI 와 정한 뒤 `archive/`로 옮긴다. 완료 조건 3이 아직 충족되지 않아 `pending/`에 둔다(BE).
