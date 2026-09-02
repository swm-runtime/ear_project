# frontend/architecture.md — share feature 신설·딥링크 게이트 개정 반영

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/frontend/architecture.md` 4.1(분리 기준 feature 목록) · 4.4(의존 방향 기록 표) · 6.4(딥링크 게이트) |
| 발행 날짜 | 2026-08-25 |
| 발견 시점 | 공유 기능(FR-27, P1) FE 구현 — `features/share` feature 신설 + 공유 링크 수신 게이트 |
| 요청 파트 | 프론트엔드 |

## 수정 내용

### 1. 4.1 분리 기준 — feature 목록에 `share` 추가

feature 목록에 `share`를 추가한다. 화면 명세 `docs/features/share.md`와 대응한다(convention.md 1.5). 전용 화면이 없는 횡단 feature다 — 네 진입점(library·explore·player·content-detail)이 공개 API로 실행하고, 링크 수신 게이트는 app(RootNavigator)이 배치한다.

### 2. 4.4 의존 방향 기록 표 — 행 추가

| feature | 의존하는 feature | 비고 |
|---|---|---|
| share | auth | 링크 수신 게이트의 관문 판정(`useSessionStore` — 온보딩 완료 사용자만 상세로 이동, share.md 4.3) |

- **역방향 소비자 추가**: library·explore·player·content-detail → share (`IS_SHARE_ENABLED`·`SHARE_COPY`·`shareContent`·`ShareIcon`). 순환 없음 — share는 이 넷을 import하지 않는다.
- app(RootNavigator) → share (`useShareLinkGate`).

### 3. 6.4 딥링크 게이트 — 공유 링크 예외 명시

현행 6.4의 "2. 온보딩 미완료면 딥링크를 보류했다가 완료 후 이동한다"는 **공유 링크와 충돌한다** — `share.md` 4.3(2026-08-25 신설)은 미로그인·온보딩 미완 수신자의 **목적지를 버리고 복원하지 않는다**(디퍼드 딥링크 금지). 개정안:

- 푸시 딥링크: 현행(보류 후 이동 — `notification.md` 4.4) 유지
- **공유 링크: 관문 통과(온보딩 완료) 상태에서만 이동, 아니면 목적지 폐기**(`share.md` 4.3이 소유)

## 사유

`share.md`(FR-27, 작성 2026-08-25)의 FE 구현으로 feature가 신설됐다. architecture.md 4.4는 표에 없는 의존을 리뷰 반려 대상으로 정하고 있고, 6.4는 features 층의 신규 규칙(share.md 4.3)과 어긋난 채로 남아 있다 — 동작 규칙은 features가 기준이므로(CLAUDE.md) architecture.md를 맞춘다.

## 완료 조건

- Given `docs/frontend/architecture.md` 4.1을 읽는다 / When feature 목록을 확인한다 / Then `share`가 포함되어 있다
- Given 4.4 표를 읽는다 / When share 행을 확인한다 / Then 의존 대상(auth)과 소비자(library·explore·player·content-detail·app)가 기재되어 있다
- Given 6.4를 읽는다 / When 딥링크 게이트 규칙을 확인한다 / Then 공유 링크의 목적지 폐기(비복원)가 푸시의 보류 규칙과 구분되어 기재되어 있다
- Given `frontend/src/features/share`의 import를 grep한다 / When `@/features/*` 의존을 모은다 / Then 4.4 표의 기재(auth)와 일치한다

---

## 처리 기록 (반영 날짜 2026-08-26 — 브랜치 `feat(fe)/social-login`, 사용자 요청으로 통합 전 반영)

- `frontend/architecture.md` 4.1 feature 목록에 `share` 추가 + 횡단 feature 설명(전용 화면 없음 · 네 진입점이 공개 API로 실행 · 링크 수신 게이트는 app 배치) 문장 추가
- 4.4 표에 `share | auth` 행 추가(순환 없음 비고 포함), 소비자 4행(library·explore·player·content-detail)의 의존 열·비고에 share 기재
- 6.4 규칙 2를 출처별로 분리 개정 — 푸시=보류 후 이동 유지, 공유 링크=목적지 폐기·비복원(`share.md` 4.3 소유), 개정 표기 부기
