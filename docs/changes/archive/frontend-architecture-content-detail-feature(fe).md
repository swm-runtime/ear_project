# frontend/architecture.md — content-detail feature 신설 반영

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/frontend/architecture.md` 4.1(분리 기준 feature 목록) · 4.4(의존 방향 기록 표) |
| 발행 날짜 | 2026-08-24 |
| 발견 시점 | 콘텐츠 상세 화면(FR-40) FE 구현 — `features/content-detail` feature 신설 |
| 요청 파트 | 프론트엔드 |

## 수정 내용

### 1. 4.1 분리 기준 — feature 목록에 `content-detail` 추가

현재 목록(`auth / onboarding / library / explore / player / paywall / subscription / settings / profile / interest / notification / admin / splash`)에 `content-detail`을 추가한다. 화면 명세 `docs/features/content-detail.md`와 대응한다(convention.md 1.5 — 문서명 ↔ feature 디렉터리).

### 2. 4.4 의존 방향 기록 표 — 행 추가

| feature | 의존하는 feature | 비고 |
|---|---|---|
| content-detail | player, library, explore | 재생 게이트·확인 팝업·재생 세션 구독(`usePlaybackStore` — 현재 재생 중 콘텐츠 판정)·원문 클릭 계약(`sendSourceLinkClick`) / [삭제] 계약(`deleteLibraryItem`)·목록 무효화(`libraryKeys`) / [담기] 계약(`saveContent` — explore-api.md 4.3 재사용, content-detail-api.md 4.2 "신규 계약 없음") |

- **세 진입점 화면(library·explore·player)은 content-detail을 import하지 않는다** — 라우트 이름(`ContentDetail`)으로 내비게이션만 하고, 화면 등록은 `app/navigation`이 담당한다(역방향 의존 없음 — 순환 미발생).
- 이 구현을 위해 explore·player의 공개 API(index.ts)에 export가 추가됐다: explore `saveContent`·`SaveContentResult`·`SaveReason`, player `usePlaybackStore`(구독 전용)·`sendSourceLinkClick`.

## 사유

`content-detail.md`(FR-40, 합의 2026-08-23)의 FE 구현으로 feature가 신설됐다. architecture.md 4.4는 "feature가 늘어나면 아래 표를 갱신한다. 표에 없는 의존이 코드에 생기면 리뷰에서 반려한다"고 정하고 있어, 표 갱신 없이는 content-detail → player·library·explore 의존이 전부 반려 대상이 된다.

## 완료 조건

- Given `docs/frontend/architecture.md` 4.1을 읽는다 / When feature 목록을 확인한다 / Then `content-detail`이 포함되어 있다
- Given `docs/frontend/architecture.md` 4.4 표를 읽는다 / When content-detail 행을 확인한다 / Then 의존 대상(player, library, explore)과 비고(게이트·삭제·담기 계약 재사용, 진입점 화면의 역방향 import 없음)가 기재되어 있다
- Given `frontend/src/features/content-detail`의 import를 grep한다 / When `@/features/*` 의존을 모은다 / Then 4.4 표의 기재(player·library·explore)와 일치한다
