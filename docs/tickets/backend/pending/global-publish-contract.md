# [BE] 글로벌 4 — 발행 계약: `POST /admin/contents` `market/language` 필수·태그 규칙 완화·`POST /admin/topics`·어드민 시장 필터

| 항목 | 값 |
|---|---|
| 대상 | `admin-api.md` 4.6/4.10 DTO · `enrichment.json` 검증(`language`·`tags`·`target_audiences`) · `POST /admin/topics` · `GET /admin/contents?market=` · `GET /admin/insights/summary` `by_market` |
| 요청 파트 | 백엔드 |
| 요청자 | 박준현(테크리드) |
| 담당 | 박준현 |
| Jira | [KAN-190](https://runtime364.atlassian.net/browse/KAN-190) · 에픽 [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) |
| 발행 날짜 | 2026-10-14 |
| 시작 날짜 | 2026-10-14 |
| 기한 | 2026-10-17 (Medium) |
| 선행 | [KAN-188](https://runtime364.atlassian.net/browse/KAN-188) `global-catalog-isolation.md`(`contents.market` 컬럼) |
| 관련 | **AI [KAN-204](https://runtime364.atlassian.net/browse/KAN-204) 제품 발행이 이 티켓에 막힌다.** AI [KAN-202](https://runtime364.atlassian.net/browse/KAN-202)(패키지가 같은 필드를 기록) |
| 근거 문서 | **`spec/api/global-api.md` 4.9 · 4.10** — 구현은 이 문서를 따르고, 계약이 바뀌면 티켓이 아니라 이 문서를 고친다 · 2026-10-14 글로벌화 조사 |
| 중요도 | Medium |
| 상태 | 진행 중 (2026-10-14 1단계 PR 올림 — `market/language` 선택 입력. 파이프라인이 보내기 시작하면 필수로 올리는 2단계 남음) |

> 2026-10-14 발행한 묶음 티켓(BE KAN-185 · FE KAN-183 · AI KAN-184)을 처리 단위로 나눈 것. 결정 사항(같은 앱·기기 언어로 가입 시 1회 시장 판정·한국 트랙 불변·에러 번역은 클라이언트·가격은 스토어·영어 진행자 새 2인·K-컬처 주제 신설·GLOBAL 연령 16세)과 결정 대기(시장 전환 불허)는 `spec/api/global-api.md` 2.1·9장이 원본이다.

## 무엇을 한다

- 업로드·재발행 payload에 `market`·`language` — **1단계 선택**(없으면 kr·ko), AI KAN-204가 보내기 시작한 뒤 **필수**(2단계). `topic_ids` 시장 불일치·`market/language` 조합 불일치(kr↔ko, global↔en)는 400 `VALIDATION_FAILED`.
- 태그 규칙 `^[가-힣A-Za-z0-9]{2,10}$` → `^[가-힣A-Za-z0-9][가-힣A-Za-z0-9 ]{0,18}[가-힣A-Za-z0-9]$`(2~20자·안쪽 공백 허용·앞뒤 공백 없음 — `CONTENT_TAG_PATTERN`). KR 기존 태그는 전부 통과(회귀 테스트).
- `target_audiences`: `market=global`이면 생략 허용, 있으면 400. `enrichment.json` `language` 키(선택, 없으면 payload 값).
- `POST /admin/topics`에 `market`(1단계 선택)·`slug`(입력은 KAN-189 남은 일) — 필수 전환은 2단계와 함께.
- `GET /admin/contents?market=` 필터 · `GET /admin/insights/summary`에 `by_market`(가입·활성·청취·결제 시장별 집계 — 모양은 구현 시 확정해 `global-api.md` 4.10 갱신).
- 콘솔(`pipeline/`)이 플래그로 켜는 시점을 알 수 있게 **배포 후 AI 담당에게 알린다**(처리 기록에 날짜).

## 범위 밖

파이프라인 쪽 `upload-meta.json` 기록(AI 4번)

## 완료 조건

- Given payload에 `market` 없음 / Then 400 `VALIDATION_FAILED`(`details.field = "market"`)
- Given `market=global` + KR `topic_ids` / Then 400, 저장 0건
- Given 태그 `"Stray Kids"` / Then 통과; 기존 KR 태그 전부 통과(회귀)
- Given `market=global` 발행 / Then `contents.market=global`, KR 계정 피드에 미노출(BE 2번 e2e로 교차 확인)
- 처리 기록에 "개발계 배포 → AI 담당 알림" 날짜가 있다

## 처리 기록
- 2026-10-14 발행(마크다운 + Jira). 묶음 티켓 분할.
- 2026-10-14 1단계 구현 — PR `feat(be)/global-publish-contract`(dev 대상, KAN-188 PR #1524 위에 쌓음).
  - 완료: 업로드 payload `market`·`language` **선택**(없으면 kr·ko — 구 콘솔·KR 파이프라인 무중단) · 조합(kr↔ko·global↔en)·주제 시장 일치·GLOBAL의 `target_audiences` 거부(400) · 재발행은 주제 시장만 대상 콘텐츠와 대조 · 태그 규칙 완화(2~20자·안쪽 공백, 종전의 상위 집합) · `POST /admin/topics` `market` · `GET /admin/contents?market=` + 항목 `market`·`language`. 단위 1757건 통과(신규: 태그 공백·20자 허용, 시장/주제·시장/언어 불일치 400).
  - **필수로 바꾸지 않은 이유**: 지금 필수로 하면 파이프라인의 KR 발행이 400으로 막힌다. AI 파트가 `SEND_*` 플래그로 두 필드를 보내기 시작한 뒤(KAN-204) 필수로 올린다 — 이 티켓의 남은 일.
  - 남은 것: 필수 전환 · `insights/summary` `by_market` · 배포 후 AI 담당 알림(처리 기록에 날짜).
  - 문서: `changes/pending/global-publish-contract.md`.
