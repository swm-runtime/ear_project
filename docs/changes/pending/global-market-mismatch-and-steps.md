# [문서] 글로벌 3 — `MARKET_MISMATCH` 등재 · 온보딩 `steps[]` · 주제 `slug`

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/features/common-error-handling.md` 9장 · `docs/spec/api/onboarding-api.md` 4.1·4.2·4.3·4.4 · `docs/backend/domain.md` 4.1 |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-10-14 |
| 관련 | [KAN-189](https://runtime364.atlassian.net/browse/KAN-189) |

## 수정 내용
- `common-error-handling.md` 9장: `MARKET_MISMATCH` · 409 · retryable false · "정상 UI에서는 나오지 않는다 — 공통 문구". 발생: GLOBAL 계정의 커리어 저장, 다른 시장 주제를 관심사로 저장.
- `onboarding-api.md` 4.1: 응답 `steps[]`(KR `["topic","career"]`, GLOBAL `["topic"]`). 4.3: GLOBAL은 주제 저장 시 `onboarding_step`이 `pick`으로 간다, 다른 시장 주제가 섞이면 409. 4.4: GLOBAL 계정은 409. 4.2: 항목 `slug`(string | null).
- `domain.md` 4.1: `slug varchar(64) NULL` + `uq_topics_market_slug (market, slug) WHERE slug IS NOT NULL`. GLOBAL 주제 8개는 마이그레이션 `1790100000000`이 시드, `parent_category`는 주제 이름과 같다(1단계 체계).

## 완료 조건
- Given 위 문서 / Then 각 항목이 적혀 있다

## 처리 기록
- 2026-10-14 발행. 코드는 KAN-189 PR에 반영.
