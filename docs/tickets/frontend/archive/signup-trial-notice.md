# [FE] 가입 체험 안내 — 가입 직후 팝업 1회 + 프로필 표시

| 항목 | 값 |
|---|---|
| 대상 | 가입 완료 직후 흐름(팝업 신설) · `frontend/src/features/profile/`(플랜 카드 — `profile.copy.ts` · `api/profile.dto.ts`) · `docs/spec/uiux/`(팝업·프로필 카피) |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현(백엔드) |
| 담당 | 이주호 |
| 발행 날짜 | 2026-10-03 |
| 시작 날짜 | 2026-10-03 |
| 기한 | 2026-10-06 (Medium — 3일 안) |
| 선행 | 티켓 없음. **백엔드 PR `feat(be)/signup-trial`의 dev 머지**(티켓 아님 — 상태: PR 작성됨, 머지 대기). 머지돼야 개발계에서 `plan.trial`이 내려온다 |
| Jira | [KAN-119](https://runtime364.atlassian.net/browse/KAN-119) |
| 근거 문서 | `features/subscription.md` 4.8(가입 체험 규칙) · `spec/api/profile-api.md` 4.1 "`plan.trial`" · `spec/api/auth-api.md`(`user.tier`) |
| 중요도 | Medium — 서버는 스위치만 켜면 지급을 시작한다. 안내 화면 없이 켜면 사용자가 체험 중인지·언제 끝나는지 알 수 없다 |
| 상태 | 완료 — 2026-10-05 반영(PR #1123) |

## 배경

새로 가입한 계정에 **7일간 재생 한도 없이 듣는 가입 체험**을 주기로 했다(2026-10-03). 서버는 구현됐다 — 스위치(`SIGNUP_TRIAL_ENABLED`)가 켜져 있는 동안 가입한 계정에 지급하고, 재생 판정·한도 응답에 반영한다. 앱에는 이를 **알리는 화면**이 필요하다.

## 요건

1. **처음 가입했을 때 한 번 팝업으로 알린다.** 팝업에는 **언제까지 무제한인지(날짜)** 와 **그 이후에는 하루 몇 편인지**가 들어가야 한다.
2. **이후에는 프로필 페이지에서 보여준다.** 지금 "무료 이용 중"이 나오는 플랜 카드 자리에 체험 중임이 드러나야 한다.
3. **팝업과 프로필의 문구·표시 방식은 FE 담당이 정한다.** 위 1·2의 정보가 담기기만 하면 된다. 정한 카피는 `spec/uiux/`에 적는다(FE 소유 문서).

## 서버가 주는 값

프로필(`GET /users/me/profile`)·설정(`GET /users/me/settings`)·구독(`GET /users/me/subscription`)의 `plan`에 `trial`이 추가됐다. **체험 중이 아니면 `null`이다.**

```json
"plan": {
  "status": "free",
  "tier": "trial",
  "plan_name": "무료 체험",
  "daily_play_limit": null,
  "trial": {
    "ends_at": "2026-10-09T19:00:00.000Z",
    "last_free_date": "2026-10-09",
    "daily_play_limit_after": 2
  }
}
```

| 필드 | 쓰임 |
|---|---|
| `trial.last_free_date` | "10월 9일까지"의 날짜. **무제한으로 들을 수 있는 마지막 날**이다 — `ends_at`에서 직접 계산하지 않는다(04시 경계 판정은 서버 몫) |
| `trial.daily_play_limit_after` | "이후 하루 N편"의 N. `null`이면 무제한(체험 중인 프로 구독자) — 2를 하드코딩하지 않는다 |
| `trial.ends_at` | 종료 시각(UTC, 04:00 KST 경계). 남은 시간 표시 등에 필요하면 쓴다 |

- 로그인·가입 응답과 `GET /users/me`의 `user.tier`도 체험 중인 무료 계정은 `"trial"`이다. **표시용이며 분기에 쓰지 않는다** — 체험 여부는 `plan.trial !== null`로 본다.
- 가입 응답(`POST /auth/sign-up`)에는 날짜가 없다. 팝업에 쓸 날짜는 위 세 조회 중 하나에서 받는다.

## 현재 동작 (이 티켓 반영 전)

- 체험 중인 계정은 `daily_play_limit = null`이라 프로필·설정 카드가 **"무료 이용 중"** 으로만 나온다(`profile.copy.ts` · `settings.copy.ts`의 `null` 분기). 남은 재생 횟수 표시는 무제한 티어처럼 숨는다. 깨지는 화면은 없지만 체험 중인지·언제 끝나는지가 보이지 않는다.
- 재생 확인 팝업·페이월은 뜨지 않는다(서버가 무제한으로 판정).

## 주의

- **"한 번"은 앱이 기억한다.** 서버에는 팝업을 봤는지 기록하는 값이 없다(재생 확인 팝업 억제와 같은 기기 로컬 상태). 가입 직후가 아닌 재로그인·재설치에서 다시 띄울지는 FE가 정한다.
- **스위치가 꺼져 있을 때 가입한 계정은 `trial`이 `null`이다** — 팝업을 띄우지 않는다. "가입했으니 체험 중"으로 가정하지 않고 값이 있을 때만 그린다.
- **구독자가 체험 중일 수 있다.** 이때 `tier`·`plan_name`은 구독 티어이고 `trial`만 채워진다. 프로필에 체험을 함께 보여줄지는 FE가 정한다.
- 체험은 **재생 한도만** 바꾼다. 광고·드립 편수는 무료 티어 그대로다.
- 설정 화면 플랜 카드에도 같은 `plan.trial`이 내려간다 — 프로필과 맞출지는 FE 판단.

## 완료 조건

- Given 스위치가 켜진 환경에서 새로 가입 / When 가입을 마친다 / Then 무제한 종료 날짜(`last_free_date`)와 이후 하루 한도(`daily_play_limit_after`)가 담긴 팝업이 한 번 뜬다
- Given 그 팝업을 닫은 계정 / When 앱을 다시 연다 / Then 팝업이 다시 뜨지 않는다
- Given 체험 중인 계정 / When 프로필에 들어간다 / Then 체험 중임과 종료 날짜를 알 수 있다
- Given `plan.trial`이 `null`인 계정(스위치 꺼짐·체험 종료) / When 가입하거나 프로필에 들어간다 / Then 팝업이 뜨지 않고 프로필은 종전과 같다
- Given `spec/uiux/` / When 읽는다 / Then 팝업·프로필의 확정 카피가 적혀 있다

## 처리 기록

- 2026-10-03 발행. Jira KAN-119(이주호, Medium, 기한 10-06). 선행인 백엔드 PR #1113(`feat(be)/signup-trial`)은 dev 머지 완료 상태에서 착수.
- **2026-10-05 반영 완료** — PR #1123(`feat(fe)/signup-trial-notice` → dev).
  - **팝업(P11)**: `features/profile/components/SignupTrialNotice`(공용 `ConfirmDialog` 의 버튼 하나짜리 변형 — `secondaryAction` 선택화, `design.md` §5). MainNavigator 가 그리고, **온보딩을 막 끝낸 진입에서만** 튜토리얼 → 알림 사전 안내 → 체험 안내 순서로 400ms 뒤 연다. `plan.trial` 은 프로필 요약(`GET /users/me/profile`)에서 받는다.
  - **"한 번"**: 닫으면(확인·딤·뒤로가기) 계정 id 를 `secureStorage` `SIGNUP_TRIAL_NOTICE_SEEN` 에 적는다 — 재생 확인 팝업 억제(`PLAY_CONFIRM_SUPPRESSED_DATE`)와 같은 저장 방식. 같은 기기에서 다른 계정이 새로 가입하면 그 계정에는 뜬다.
  - **재로그인·재설치 결정(FE)**: **띄우지 않는다.** 여는 계기가 "온보딩을 막 끝낸 진입"뿐이라서다 — 이 팝업은 가입 환영이고, 체험 중임과 날짜는 프로필 플랜 줄이 늘 보여준다.
  - **프로필·설정**: 체험 중인 무료 계정은 "무료 체험 중 · N월 N일까지 무제한". 설정 구독 요약도 같은 문자열(settings-uiux.md 6장 "프로필과 완전히 같은 문자열"). 날짜는 `last_free_date` 문자열을 시간대 없이 나눠 적는다(`shared/lib/date-only` — 두 화면 공용). **구독자가 체험 중이면 플랜 줄은 구독 문구 그대로**(FE 결정).
  - DTO 의 `trial` 은 선택 필드로 받는다 — 운영 서버가 아직 안 보내도 null 로 읽혀 화면은 종전과 같다.
  - 카피 확정: `profile-uiux.md` 4.2·4.11·6·7장, 순서는 `onboarding-uiux.md` 4.6, 설정은 `settings-uiux.md` 4.1·6장.
- **완료 조건 확인**
  - 팝업 1회(날짜·이후 한도 포함): 카피 테스트(`profile.copy.test.ts` — 날짜 "10월 9일", 한도 3·null 분기) + 판정 테스트(`signup-trial-notice.service.test.ts` — trial 있음·미확인이면 띄움). **실기기(스위치 켠 개발계)에서 새 가입 확인은 사람 손으로 남는다.**
  - 닫은 계정은 다시 안 뜸: 판정 테스트(같은 계정 id 면 안 띄움) + 기기 기록 왕복 테스트(기록 → 다음 실행 읽기). 재실행 시 `justCompletedOnboarding` 도 false 라 계기 자체가 없다.
  - 프로필에서 체험 중·종료 날짜: `PROFILE_COPY.plan.trial` 테스트 + `useProfileScreen`/`ProfileHeader` 의 `trialLastFreeDate` 분기(코드 확인, tsc).
  - `plan.trial = null` 이면 팝업 없음·프로필 종전: 판정 테스트(trial null → 안 띄움) + 변환 테스트(`profile.api.test.ts` — null·필드 없음·plan 부분 실패 → null) → 플랜 줄은 `PROFILE_COPY.plan.free` 그대로.
  - `spec/uiux/` 확정 카피: `profile-uiux.md` 4.11·6장에 기재.
  - 검사: `tsc --noEmit` · `eslint src` · `jest`(35 suites / 220 tests) 통과.
