# 온보딩 담기 — 다른 시장 콘텐츠는 `CONTENT_NOT_FOUND`

| 항목 | 값 |
|---|---|
| 발행 날짜 | 2026-10-15 |
| 요청 파트 | 백엔드 |
| 발행자 | BE (박준현 — KAN-188 시장 격리) |
| 반영 대상 | `spec/api/onboarding-api.md` 4.6 `failed[]` 사유 표의 `CONTENT_NOT_FOUND` 행 |
| 코드 반영 | PR `fix(be)/onboarding-pick-market-check` |

## 수정 내용

- 4.6 `failed[]`의 `CONTENT_NOT_FOUND` 사유를 "존재하지 않거나 **사용자 시장의 콘텐츠가 아닌** `content_id`"로 고친다. 상세·재생·탐색 담기와 같은 판정이다.

## 사유

다른 시장 콘텐츠 ID가 온보딩 담기로 라이브러리에 적립되던 격리 누락을 막았다. 존재 여부를 드러내지 않도록 없는 콘텐츠와 같은 코드로 응답한다.

## 완료 조건

- Given `onboarding-api.md` 4.6 / When `failed[]` 사유 표를 읽는다 / Then `CONTENT_NOT_FOUND`에 다른 시장 콘텐츠가 포함된다고 적혀 있다

## 처리 기록

- 2026-10-16 반영 — `onboarding-api.md` 4.6 `failed[]` 사유 표 `CONTENT_NOT_FOUND` 행. 코드(`content.service.ts` `resolvePickTargets`)와 대조함.
