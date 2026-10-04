# [FE] 가입 체험 안내 팝업 — 기존 가입자에게도 한 번 띄운다

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/features/profile/hooks/useSignupTrialNotice.ts`(여는 계기) · `services/signup-trial-notice.service.ts` · `profile.copy.ts`(P11 문구) · `docs/spec/uiux/profile-uiux.md` 4.11 · `onboarding-uiux.md` 4.6 |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현(백엔드) |
| 담당 | 이주호 |
| 발행 날짜 | 2026-10-05 |
| 시작 날짜 | 2026-10-05 |
| 기한 | 2026-10-08 (Medium — 3일 안) |
| 선행 | 티켓 없음. **백엔드 PR `feat(be)/signup-trial-existing-users`의 dev 머지**(티켓 아님 — 상태: PR 작성됨, 머지 대기). 머지돼야 개발계에서 기존 계정에 `plan.trial`이 내려온다 |
| Jira | [KAN-121](https://runtime364.atlassian.net/browse/KAN-121) |
| 근거 문서 | `changes/pending/signup-trial-existing-users(be).md`(기존 가입자 규칙) · `features/subscription.md` 4.8 · `tickets/frontend/archive/signup-trial-notice.md`(KAN-119 — 팝업 원 티켓) |
| 중요도 | Medium — 이 티켓이 반영된 앱이 나가야 운영 스위치를 켤 수 있다. 먼저 켜면 기존 가입자는 안내 없이 7일이 시작된다 |
| 상태 | 대기 |

## 배경

가입 체험(7일 무제한)을 **체험 도입 전에 가입한 계정에게도 이번 한 번** 주기로 했다(2026-10-05). 기산점은 가입일이 아니라 **스위치가 켜진 뒤 처음 앱을 여는 날**이다. 서버는 구현됐다.

KAN-119로 만든 팝업(P11)은 **온보딩을 막 끝낸 진입에서만** 열린다(`useSignupTrialNotice`의 `justCompletedOnboarding` — `profile-uiux.md` 4.11 "재로그인·재설치·새 기기에서는 띄우지 않는다"). 그래서 기존 가입자는 체험을 받고도 팝업을 보지 못하고, 프로필 플랜 줄에서만 알 수 있다.

## 요건

1. **체험을 받은 기존 가입자가 앱에 들어왔을 때도 한 번 팝업을 띄운다.** 내용은 같다 — 언제까지 무제한인지(날짜)와 그 이후 하루 몇 편인지.
2. **여는 조건을 "온보딩 직후"에서 "`plan.trial`이 `null`이 아니고, 이 계정이 이 팝업을 아직 본 적이 없다"로 넓힌다.** 신규 가입자(온보딩 직후)와 기존 가입자(앱 시작)가 같은 조건으로 걸린다.
3. **문구·표시 방식·뜨는 순서는 FE가 정한다.** 지금 본문 "가입을 환영하는 선물이에요"는 몇 달 전 가입한 사람에게 맞지 않을 수 있다 — 한 문구로 통일할지 갈라 쓸지 FE 판단. 정한 내용은 `profile-uiux.md` 4.11에 적는다.

## 서버 동작

- **앱이 따로 호출할 것은 없다.** 기존 가입자는 앱 시작의 세션 복원(`GET /users/me`) 또는 로그인(`POST /auth/social-login`)에서 서버가 체험을 지급한다. 그 응답의 `user.tier`가 `"trial"`로 나가고, 이어지는 프로필·설정·구독 조회의 `plan.trial`에 날짜가 실린다(필드는 KAN-119와 같다).
- 기존 가입자의 `last_free_date`는 **앱을 연 날 기준 7일째**다(10/12에 열면 10/18).
- 지급은 계정당 한 번이다. 체험이 끝난 계정은 `plan.trial`이 `null`이라 팝업 조건에 걸리지 않는다.
- 서버 조건: `SIGNUP_TRIAL_ENABLED=true` + `SIGNUP_TRIAL_EXISTING_USERS_BEFORE=<날짜>`(그 날짜보다 먼저 가입한 계정이 대상). 개발계에서 확인하려면 두 값을 켜야 한다 — 백엔드에 요청.

## 주의

- **"한 번"의 기억은 지금 방식(기기에 본 계정 id 저장)을 그대로 써도 된다.** 조건이 "체험 중 + 미확인"이 되면 재설치·새 기기에서 체험 기간 안에 한 번 더 뜰 수 있다 — 같은 날짜를 다시 알리는 것이라 해는 없다. 막을지는 FE 판단.
- 신규 가입자의 기존 순서(튜토리얼 → 알림 사전 안내 → P11)는 유지한다. 기존 가입자는 앞의 둘이 없다.
- `plan.trial` 조회가 실패하면 띄우지 않는 현재 규칙은 그대로다. 다음 실행에서 다시 판정된다(아직 "봤다"로 기록되지 않았으므로).
- 구독자가 체험 중일 수 있다(`daily_play_limit_after`가 `null`) — KAN-119에서 정한 문구 분기를 그대로 쓴다.

## 완료 조건

- Given 체험 도입 전에 가입한 계정(스위치·경계 날짜가 켜진 환경) / When 앱을 연다 / Then 무제한 종료 날짜(`last_free_date`)와 이후 하루 한도가 담긴 팝업이 한 번 뜬다
- Given 그 팝업을 닫은 계정 / When 앱을 다시 연다 / Then 팝업이 다시 뜨지 않는다
- Given 스위치가 켜진 환경에서 새로 가입 / When 온보딩을 마친다 / Then 종전처럼 팝업이 한 번 뜬다(순서 유지)
- Given `plan.trial`이 `null`인 계정 / When 앱을 연다 / Then 팝업이 뜨지 않는다
- Given `profile-uiux.md` 4.11 / When 읽는다 / Then 기존 가입자에게 뜨는 조건과 확정 문구가 적혀 있다
