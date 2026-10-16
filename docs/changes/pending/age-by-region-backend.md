# 연령 확인 기준 연령 `min_age` — 서버 구현 반영 (BE)

| 항목 | 값 |
|---|---|
| 대상 문서 | `backend/domain.md` 3.1 `region_code` · 3.2 `age_confirmation` · `spec/api/auth-api.md` 4.1 · 4.2 · 4.5 · 4.13 · 재조회 절 · `spec/api/global-api.md` 2.1 |
| 요청 파트 | 백엔드 — 박준현 |
| 발행 날짜 | 2026-10-16 |
| 관련 | BE [KAN-220](https://runtime364.atlassian.net/browse/KAN-220) `tickets/backend/pending/global-age-by-region.md` · FE 계약 제안 `changes/pending/auth-age-by-region.md`(KAN-206) |

## 배경

PM이 GLOBAL 연령을 나라별로 정했다(2026-10-16, KAN-206). 계약 본문(`min_age` 필드·판정 표)은 FE 제안 문서에 있다. 이 문서에는 서버가 구현한 내용과, 제안이 BE에 맡긴 "이력에 무엇을 남기나"에 대한 답을 적는다. 통합할 때 두 문서를 함께 반영한다.

## 수정 내용

- **판정** — FE 제안의 표 그대로다(`policies/age-confirmation.policy.ts`).
  - KR 시장은 18이다.
  - GLOBAL은 `region_code`가 `SG`·`HK`·`KR`이면 16, 그 밖이거나 없으면 18이다.
  - 가입 전에는 요청 `locale.region_code`로, 가입 후에는 `users.region_code`(로그인마다 갱신)로 판정한다.
- **응답** — `age_confirmation` 항목에만 `min_age`(정수)를 싣는다. 대상: social-login `required_consents`, 가입 동의 재조회, `pending_consents`(로그인·sign-up·`GET /users/me`).
- **이력(`consents.version`)** — 제안이 BE에 맡긴 결정이다.
  - **GLOBAL은 `age-16`·`age-18`을 남긴다.** 지역마다 확인 문구의 숫자가 달라서, 숫자가 없으면 그 사용자가 무엇을 확인했는지 입증할 수 없다.
  - **KR은 null 그대로다.** KR 문구는 처음부터 18 하나였다. 값을 바꾸면 기존 KR 사용자 전원에게 재확인이 뜬다.
  - 가입·재동의는 이 버전을 다른 동의와 같이 대조한다. 화면에 보인 숫자와 다른 기준(예: 말레이시아 기기가 `age-16`)을 보내면 409 `CONSENT_VERSION_STALE`이다. 앱은 다시 받아 그린다.
- **재확인(`pending_consents`)** — 연령 확인만 "버전 일치"가 아니라 **"확인받은 기준 연령 ≥ 지금 기준"**으로 판정한다.
  - 16세로 확인한 사용자가 18세 지역으로 옮기면 한 번 다시 묻는다.
  - 반대 방향(18 → 16)은 묻지 않는다.
  - null(KR 문구·도입 전 이력)은 18로 본다. 모르는 형식은 0으로 봐서 다시 묻는다. 확인 문구를 개정해 버전 형식을 바꾸면(예: `age-16-v2`) 옛 이력은 재확인을 받는다.
  - 그래서 연령 확인은 "버전을 올려 재확인"이 아니라 **기준 연령이나 버전 형식을 바꿔** 재확인한다.
- **`domain.md`**
  - 3.1: `region_code` 주석을 "통계용 — 판정에 쓰지 않는다"에서 "GLOBAL 연령 확인의 기준 연령 판정에 쓴다(KAN-220)"로 바꾼다.
  - 3.2: `age_confirmation` 문단에 버전 규칙(GLOBAL `age-<기준 연령>`, KR null)과 위 재확인 규칙을 덧붙인다.
- **`auth-api.md`·`global-api.md`** — FE 제안 문서대로 `min_age` 행과 판정 표를 넣는다. 4.2·4.5 에러 표의 409 설명에 "기준 연령이 바뀐 경우"를 더한다.

## 참고

- 기기 지역은 사용자가 바꿀 수 있는 값이라 "자기 선언" 수준의 근거다. 그 충분성과 태국 18~19세(성년 20)는 법률 멘토 미팅(KAN-126) 질문에 들어 있다(KAN-206 댓글 10-16).
- 운영은 GLOBAL 사용자가 0명이고 KR은 응답에 `min_age: 18`이 붙을 뿐이라 재동의가 없다. 개발계에 "16세 이상" 문구(FE #1591)로 확인한 GLOBAL 이력이 있다면 null이라 18로 간주된다. 개발계 데이터라 바로잡지 않는다.

## 완료 조건

- Given `auth-api.md` 동의 항목 표 / Then `min_age`(연령 항목에만)가 있다
- Given `domain.md` 3.1·3.2 / Then `region_code`가 연령 판정에 쓰이고, 연령 확인 버전 규칙과 재확인 규칙이 적혀 있다

## 처리 기록

- 2026-10-16 발행(서버 구현 PR과 함께). 반영 전.
