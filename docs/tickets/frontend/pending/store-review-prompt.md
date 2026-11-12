# [FE] 스토어 리뷰 요청 — 완청 뒤 OS 기본 리뷰 창(ASO)

| 항목 | 값 |
|---|---|
| 대상 | 앱이 App Store·Google Play 평점 창을 띄우는 시점 |
| 요청 파트 | 프론트엔드 |
| 요청자 | 이주호(PM) |
| 담당 | 이주호 |
| Jira | [KAN-310](https://runtime364.atlassian.net/browse/KAN-310) |
| 발행 날짜 | 2026-11-12 |
| 시작 날짜 | 2026-11-12 |
| 기한 | 2026-11-15 (Medium — +3일). **네이티브 빌드가 필요하다** — 빌드는 "빌드 ㄱ"이 있어야 돈다 |
| 선행 | 없음 |
| 중요도 | Medium |
| 상태 | 대기 |

## 왜

스토어 검색 순위와 전환은 평점·리뷰 수에 크게 기댄다. 2026-11-12 기준 App Store 평점 5.0인데 **리뷰가 4개**다. 지금 앱에는 스토어 리뷰를 요청하는 경로가 없다(`StoreReview`·`requestReview` 0건).

## 요청

- **OS 기본 창만 쓴다** — iOS `SKStoreReviewController`, Android Play In-App Review API. 라이브러리는 `expo-store-review`(SDK 57).
- **시점**: 서버가 완청을 처음 확정한 응답(`library.api.ts`의 완청 전이 응답 — 이미 completed면 다시 세지 않는다)이 **누적 3번째**일 때, **재생이 멈춘 뒤**(플레이어를 닫거나 다음 편으로 넘어가기 전 정지 상태). 듣는 도중에 띄우지 않는다. 숫자 3은 임시값 — PM 확정.
- **빈도**: 기기당 120일에 한 번까지(앱 쪽 상한. OS도 iOS 365일 3회 등으로 막는다). 띄운 시각은 기기 저장소에 둔다.
- **하지 않는 것** (스토어 정책)
  - 창 전에 "앱이 마음에 드세요?" 같은 질문을 하지 않는다 — Google Play 정책이 리뷰 창 전후의 질문·유도를 금지한다. 만족한 사람만 고르는 분기도 하지 않는다.
  - **후기 참여 프로모션(Pro 7일, `content-review.md`)과 엮지 않는다** — 같은 세션에서 후기 시트·보상 안내 직후에 띄우지 않는다. 보상과 스토어 평가가 이어져 보이면 두 스토어의 보상성 리뷰 금지에 걸린다(`content-review.md` 1장 "하지 않는 것").
  - 페이월·결제 시트 직후에 띄우지 않는다.
- **옛 빌드 보호**: 네이티브 모듈이 없는 바이너리에 OTA로 JS가 먼저 도착한다. `expo-modules-core`의 `requireOptionalNativeModule('ExpoStoreReview')`로 모듈 유무를 먼저 보고, 없으면 아무 일도 하지 않는다(`expo-store-review`를 맨 위에서 import하지 않는다 — 없으면 그 자리에서 throw). runtimeVersion을 올릴지는 `docs/frontend/architecture.md` 2.1 규칙대로 판단해 `app.json` 노트에 적는다.
- **측정**: GA4 `store_review_request`(띄운 시점만 — OS가 실제로 창을 보였는지·별점은 알려 주지 않는다).
- 동작 규칙은 `features/player.md`(완청 4.4 근처) 또는 새 `features/store-review.md`에 먼저 적는다.

## 완료 조건

- Given 처음 완청 확정이 누적 3번째 / When 재생이 멈춘다 / Then OS 리뷰 창 요청이 한 번 나가고 GA4 `store_review_request`가 남는다
- Given 120일 안에 이미 요청함 / When 다시 조건을 채운다 / Then 요청하지 않는다
- Given 같은 세션에서 후기 시트·보상 안내·페이월을 봤다 / When 조건을 채운다 / Then 요청하지 않는다
- Given `ExpoStoreReview` 모듈이 없는 옛 빌드 / When OTA로 새 JS를 받는다 / Then 크래시 없이 요청만 건너뛴다
