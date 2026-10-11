# 가입 체험 안내 — "앱은 아직 가입 직후에만 띄운다" 문장 정리

| 항목 | 값 |
|---|---|
| 대상 문서 | `features/subscription.md` 4.8 "안내" |
| 요청 파트 | 프론트엔드 |
| 요청자 | 이주호(프론트엔드) |
| 발행 날짜 | 2026-10-05 |
| 관련 티켓 | `tickets/frontend/archive/signup-trial-notice-existing-users.md`([KAN-121](https://runtime364.atlassian.net/browse/KAN-121)) — 반영 완료, PR #1126 |

## 수정 내용

`features/subscription.md` 4.8 "안내" 항목의 현재 상태 서술을 바꾼다.

- 지울 것: **"앱은 아직 가입 직후에만 띄운다** — 기존 가입자 쪽은 `tickets/frontend/archive/signup-trial-notice-existing-users.md`(KAN-121)가 반영한다."
- 넣을 것: "앱은 **`plan.trial`이 있고 그 계정이 아직 안 본 경우** 한 번 띄운다 — 신규 가입자는 온보딩 직후(튜토리얼 → 알림 사전 안내 다음), 기존 가입자는 앱 시작(KAN-121 반영). 여는 조건·순서·문구는 `spec/uiux/profile-uiux.md` 4.11."

## 사유

KAN-121(PR #1126)로 앱이 기존 가입자에게도 팝업을 띄우게 됐고, 티켓은 `archive/`로 옮겼다. 그대로 두면 4.8이 지난 상태("아직 가입 직후에만")를 말하고 없는 `pending/` 경로를 가리킨다. `features/`는 FE 단독 소유가 아니라 개발 중 직접 고치지 않고 여기 기록한다(루트 `CLAUDE.md` 요청 문서 규칙).

## 완료 조건

- Given `features/subscription.md` 4.8 "안내" / When 읽는다 / Then 앱이 기존 가입자에게도 팝업을 띄운다는 현재 상태와 `profile-uiux.md` 4.11 참조가 적혀 있고, `tickets/frontend/pending/` 경로가 남아 있지 않다

## 처리 기록

- **반영 날짜: 2026-10-09** — 브랜치 `docs/apply-changes-pending-1009`. features/subscription.md 4.8 반영.
