# [INFRA] 운영 → 개발계 콘텐츠 동기화에 `content_scripts` 를 포함한다

| 항목 | 값 |
|---|---|
| 대상 | `backend/deploy/sync-content-export.sh` · `backend/deploy/sync-content-import.sh` — 두 파일의 `TABLES` 와 import 의 upsert 키 목록 |
| 요청 파트 | 인프라(백엔드) |
| 요청자 | 이주호(FE) |
| 발행 날짜 | 2026-09-20 |
| Jira | [KAN-83](https://runtime364.atlassian.net/browse/KAN-83) |
| 발견 시점 | KAN-73(대본 패널 실서버 연결) 실기기 확인을 준비하다가 — 개발계 앱에서 대본을 볼 길이 구조적으로 없다 |
| 근거 문서 | `infra/inventory.md` 3장(개발계 = "빈 DB + 운영 콘텐츠 사본", 크론 `30 19 * * *`) · `backend/domain.md` 5.3(`content_scripts`) · `spec/api/player-api.md` 4.1 `has_script` · 4.7 |
| 중요도 | **Medium**(3일 안) — 자막 기능(FR-25)의 세 티켓(KAN-71 BE · KAN-72 AI · KAN-73 FE)이 전부 코드는 끝났는데, **검증할 환경에 데이터가 닿지 않는다** |
| 상태 | 대기 |

## 문제

개발계 DB 의 콘텐츠는 운영에서 매일 복사해 온다. 복사 대상 테이블이 스크립트에 고정돼 있다.

```
TABLES=(topics contents content_topics content_sources content_embeddings content_stats)
```

`content_scripts` 는 2026-09-19(KAN-71)에 생긴 테이블이라 **목록에 없다.** 그래서

- AI 파이프라인이 대본을 실어 **운영에** 발행해도(KAN-72 — 관리자 콘솔은 운영 API 로 발행한다), 개발계의 같은 콘텐츠는 `has_script: false` 로 남는다.
- 개발계 앱(이어 - preview)은 개발계 API 만 본다 → **대본 버튼이 영영 뜨지 않는다.**
- 운영 앱으로 확인할 수도 없다 — 대본 패널을 실서버에 붙인 코드(KAN-73)는 runtime 4 이고, 운영 앱의 runtime 4 빌드가 아직 없다.

결과적으로 FR-25 는 지금 **어느 기기에서도 실서버 확인이 불가능하다.**

## 요청

1. export·import 두 스크립트의 `TABLES` 에 `content_scripts` 를 더한다.
2. import 의 upsert 키 목록에 `('content_scripts', 'content_id')` 를 더한다(콘텐츠당 1행 — `uq_content_scripts_content_id`). 자체 `id` 가 운영과 개발계에서 다를 수 있으므로 **충돌 키는 `content_id`** 여야 한다.
3. 운영에서 대본이 **지워진** 경우(대본 없는 재발행 등)를 개발계에도 반영한다 — `content_topics` 의 "스테이지에 없는 행 삭제"와 같은 방식.
4. 반영 후 한 번 수동 실행해 개발계에 대본이 들어오는지 확인한다.

## 범위 밖

- 개발계에 직접 발행하는 경로(관리자 콘솔의 대상 API 전환) — 별개 논의.
- 기존 발행분의 대본 소급(Forced Alignment) — KAN-72 처리 기록의 후속 작업.

## 완료 조건

- Given 운영에 대본이 적재된 콘텐츠가 있다 / When 동기화가 한 번 돈다 / Then 개발계의 같은 콘텐츠로 `POST /contents/:id/audio-urls` 를 부르면 `has_script: true` 이고 `GET /contents/:id/script` 가 같은 세그먼트를 돌려준다
- Given 운영에서 그 콘텐츠의 대본이 사라졌다 / When 동기화가 돈다 / Then 개발계에서도 `has_script: false` 다
- Given 동기화가 두 번 연달아 돈다 / When 결과를 본다 / Then 행이 중복되지 않고 오류 없이 끝난다(멱등)

## 처리 기록

- 2026-09-20 발행.
