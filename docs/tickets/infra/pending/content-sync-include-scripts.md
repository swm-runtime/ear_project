# [INFRA] 운영→개발계 콘텐츠 동기화에 `content_scripts` 를 포함한다 — 개발계 앱에서 대본을 볼 수 없다

| 항목 | 값 |
|---|---|
| 대상 | `backend/deploy/sync-content-export.sh` · `backend/deploy/sync-content-import.sh` |
| 요청 파트 | 인프라 (담당 박준현) |
| 발행 날짜 | 2026-09-20 |
| Jira | [KAN-83](https://runtime364.atlassian.net/browse/KAN-83) |
| 발견 시점 | 2026-09-20 — KAN-73(대본 패널 실서버 연결) 실기기 확인을 준비하다 발견 |
| 근거 문서 | `tickets/infra/pending/content-sync-on-publish.md`(같은 스크립트) · `tickets/frontend/pending/script-real-api.md`(KAN-73) · PRD FR-25 |
| 심각도 | 중 — 장애는 아니지만 FR-25 를 **어느 기기에서도 실서버 확인할 수 없다** |
| 우선순위 | Medium(3일 안) |

## 문제

개발계 앱에서 대본을 볼 길이 **구조적으로 없다.**

운영→개발계 콘텐츠 동기화의 `TABLES` 가 `topics contents content_topics content_sources content_embeddings content_stats` 로 고정돼 있고, **2026-09-19(KAN-71)에 생긴 `content_scripts` 가 빠져 있다.** AI 파이프라인이 운영에 대본을 발행해도(KAN-72) 개발계의 같은 콘텐츠는 `has_script: false` 로 남아 대본 버튼이 뜨지 않는다.

운영 앱은 runtime 4 빌드가 아직 없어 **운영으로도 확인할 수 없다.**

## 요청 내용

1. export·import 두 스크립트의 `TABLES` 에 `content_scripts` 추가
2. import 의 upsert 키 목록에 `('content_scripts', 'content_id')` 추가 — **자체 `id` 가 환경마다 다를 수 있어 충돌 키는 `content_id`** 다(콘텐츠당 1행 — `uq_content_scripts_content_id`)
3. 운영에서 대본이 지워진 경우도 개발계에 반영 — `content_topics` 의 "스테이지에 없는 행 삭제"와 같은 방식. 다른 표가 참조하지 않는 표라 안전하고, 남겨 두면 개발계에만 없는 대본이 계속 보인다
4. 반영 후 **한 번 수동 실행해** 개발계에 대본이 들어오는지 확인

## 완료 조건

- Given 운영에 대본이 적재된 콘텐츠 / When 동기화가 한 번 돈다 / Then 개발계의 같은 콘텐츠가 `has_script: true` 이고 `GET /contents/:id/script` 가 같은 세그먼트를 돌려준다
- Given 운영에서 그 대본이 사라졌다 / When 동기화가 돈다 / Then 개발계에서도 `has_script: false`
- Given 동기화가 두 번 연달아 돈다 / When 두 번째가 끝난다 / Then 행이 중복되지 않고 오류 없이 끝난다(멱등)

## 처리 기록

| 항목 | 값 |
|---|---|
| 코드 반영 | 2026-09-20 — `sync-content-export.sh`·`sync-content-import.sh` 의 `TABLES` 에 `content_scripts` 추가, upsert 충돌 키 `('content_scripts', 'content_id')`(자체 id 는 운영·개발계가 다르다), 운영에서 대본이 지워진 경우 개발계에서도 걷어내는 DELETE 추가(`content_topics` 와 같은 방식) |
| 같이 반영 | **KAN-84(발행 즉시 반영)와 한 PR이다** — 같은 두 스크립트를 고치는 작업이라 따로 올리면 충돌한다 |
| 검증 | 로컬 DB 에 스테이지 7개 표를 만들어 upsert 블록을 실제로 실행(문법·충돌 키·열 매핑 확인 — `content_scripts → 0 rows`) |
| 남은 것 | **배포 후 개발계에서 한 번 확인**: dev 머지로 개발계에 스크립트가 깔리고 운영(main) 배포로 내보내기 쪽이 반영된 뒤, `bash /opt/ear/backend/deploy/sync-content-import.sh` 를 한 번 돌려 대본이 들어오는지(앱의 대본 버튼) 확인한다. 확인되면 archive 로 옮긴다 |

