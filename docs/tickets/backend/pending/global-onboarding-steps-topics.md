# [BE] 글로벌 3 — 온보딩 `steps[]`·주제 `slug`·GLOBAL 주제 트리 반영·`MARKET_MISMATCH`·약관 네임스페이스

| 항목 | 값 |
|---|---|
| 대상 | `GET /onboarding/state` · `PATCH /onboarding/career` · `GET /onboarding/topics` · `PUT /onboarding/interests` · `PUT /users/me/interests` · `topics.slug` · `consents` 버전 · `common-error-handling.md` 9장(changes) |
| 요청 파트 | 백엔드 |
| 요청자 | 박준현(테크리드) |
| 담당 | 박준현 |
| Jira | [KAN-189](https://runtime364.atlassian.net/browse/KAN-189) · 에픽 [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) |
| 발행 날짜 | 2026-10-14 |
| 시작 날짜 | 2026-10-14 |
| 기한 | 2026-10-18 (Medium 환산은 발행+3일(10-17)이나 선행 티켓 뒤 착수라 10일 계획의 마일스톤 날짜로 적음) |
| 선행 | [KAN-188](https://runtime364.atlassian.net/browse/KAN-188) `global-catalog-isolation.md` · AI [KAN-200](https://runtime364.atlassian.net/browse/KAN-200) `global-track-decisions.md`(K-컬처 주제 트리 초안 — 사람 손: PM 확정) |
| 관련 | FE [KAN-195](https://runtime364.atlassian.net/browse/KAN-195) 가입·온보딩 분기가 이 응답을 쓴다 |
| 근거 문서 | **`spec/api/global-api.md` 4.4 · 4.5 · 5장 · 9장 미결 #5·#6** — 구현은 이 문서를 따르고, 계약이 바뀌면 티켓이 아니라 이 문서를 고친다 · 2026-10-14 글로벌화 조사 |
| 중요도 | Medium |
| 상태 | 대기 |

> 2026-10-14 발행한 묶음 티켓(BE KAN-185 · FE KAN-183 · AI KAN-184)을 처리 단위로 나눈 것. 결정 사항(같은 앱·기기 언어로 가입 시 1회 시장 판정·한국 트랙 불변·에러 번역은 클라이언트·가격은 스토어·영어 진행자 새 2인·K-컬처 주제 신설)과 결정 대기(시장 전환 불허·GLOBAL 16세)는 `spec/api/global-api.md` 2.1·9장이 원본이다.

## 무엇을 한다

- `GET /onboarding/state`에 `steps[]` — KR `["topic","career","pick"]`, GLOBAL `["topic","pick"]`. GLOBAL 계정의 커리어 저장은 409 `MARKET_MISMATCH`.
- `topics.slug`(UNIQUE `(market, slug)`) 추가, KR 주제에도 slug 채움(예 `career`·`productivity`). 주제 응답 `items[].slug`.
- AI가 제안한 K-컬처 주제 트리(대분류 4~5 × 중분류)를 `topics(market=global)`로 적재(시드 마이그레이션). 이름·대분류는 영어.
- 다른 시장 `topic_id`가 섞인 관심 주제 저장은 409 `MARKET_MISMATCH`, 부분 저장 없음. 자동 확장도 같은 시장 안에서만.
- 약관 버전을 시장 네임스페이스로(`terms_global_v1` 등), `pending_consents`가 시장별 버전을 낸다. 연령 기준 시장별(KR 18 · GLOBAL 16 자기 선언 — 미결 #2 기본값).
- `MARKET_MISMATCH`를 `common-error-handling.md` 9장에 등재(changes/pending).

## 범위 밖

주제 이미지 자산(FE) · 주제 트리 내용 자체(AI 제안·PM 확정)

## 완료 조건

- Given GLOBAL 계정 / When `GET /onboarding/state` / Then `steps = ["topic","pick"]`; `PATCH /onboarding/career` → 409 `MARKET_MISMATCH`
- Given GLOBAL 계정 / When 주제 목록 / Then 영어 K-컬처 주제만, 전부 `slug` 있음
- Given KR 주제 ID를 GLOBAL 계정이 저장 / Then 409, DB 변화 0건
- Given GLOBAL 가입 / Then `pending_consents[].version`이 `*_global_*`

## 처리 기록
- 2026-10-14 발행(마크다운 + Jira). 묶음 티켓 분할.
