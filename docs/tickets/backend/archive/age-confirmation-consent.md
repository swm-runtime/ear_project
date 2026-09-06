# [BE] 연령 확인을 동의 이력에 남긴다 — `consents` enum 확장

| 항목 | 값 |
|---|---|
| 대상 | `consents.consent_type` enum · `POST /auth/sign-up` 요청 DTO |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-09-06 |
| 발견 시점 | 2026-09-06 Play Console 제출 준비 — 대상 연령대를 만 18세 이상으로 선언하면서, 앱에 연령 확인 게이트를 넣었다 |
| 근거 문서 | 개인정보보호법 제22조의2 · `features/auth.md` 4.3 · `spec/api/auth-api.md` 4.2 |
| 심각도 | **중** — 지금도 가입은 막힌다. 다만 **막았다는 증거가 남지 않는다** |
| 상태 | 반영 완료 |

## 문제

A4 약관 동의 화면에 **"만 18세 이상입니다 (필수)"** 행을 추가했다(`a0496f8`). 체크하지 않으면
[동의하고 시작하기]가 활성화되지 않으므로 가입은 실제로 막힌다.

그런데 **이 확인은 서버에 기록되지 않는다.** `consents.consent_type` enum 이
`terms | privacy | marketing` 으로 고정돼 있어 클라이언트가 보낼 자리가 없다.

기록이 없으면 나중에 "만 18세 미만이 가입했다"는 분쟁이 생겼을 때 **회사가 확인 절차를
두었다는 사실을 입증할 수 없다.** 화면에 있었다는 것과 그 사용자가 체크했다는 것은 다르다.

## 요청 내용

1. `consents.consent_type` 에 연령 확인 값을 추가한다(이름은 백엔드가 정한다 — `age_confirmation` 등).
2. `POST /auth/sign-up` 이 그 값을 받아 다른 동의와 같은 방식으로 이력에 남긴다.
   - 다른 동의와 달리 **버전 문자열이 없다**(열람할 문서가 없는 자기 선언이다). `version` 을
     NULL 로 받을지, 정책 버전을 부여할지는 백엔드 판단이다.
3. 확정되면 프론트에 알린다 — 화면은 이미 그 행을 그리고 있으므로 전송만 붙이면 된다
   (`useTermsConsentScreen.ts` 의 `ageRow`).

## 범위 밖

- **연령 검증 방식**은 바꾸지 않는다. 자기 선언이며 본인확인·생년월일 수집을 도입하지 않는다
  (더 민감한 개인정보를 받게 되어 역효과다).
- 재가입 시 재확인 정책은 별건이다.

## 완료 조건

- Given 신규 가입 요청 / When 연령 확인을 포함해 동의를 보낸다 / Then `consents` 에 해당 이력이 남는다
- Given 연령 확인 없이 가입을 요청한다 / When 서버가 처리한다 / Then 가입이 거절된다
- Given 저장된 이력 / When 조회한다 / Then 어느 시점에 확인했는지 알 수 있다

## 참고 — 지금 상태

- 앱: `a0496f8` 로 화면 게이트 반영됨(전체 동의에 포함, 미체크 시 제출 불가)
- 약관: 제5조에 "만 18세 이상만 가입" 항 추가
- 개인정보 처리방침: 11절을 18세 기준으로 개정
- Play Console: 대상 연령대 **만 18세 이상** 선언

## 처리 기록 (반영 날짜: 2026-09-06)

- `ConsentType`에 **`age_confirmation`** 추가 — 컬럼이 varchar(20)라 **마이그레이션 없음**.
- **`version`은 NULL로 확정** — 열람할 문서가 없는 자기 선언이라 마케팅과 같은 취급이다.
  연령 기준(만 18세)이 바뀌면 그때 버전을 도입해 재확인을 트리거한다(`user.constant.ts` 주석).
- `REQUIRED_CONSENT_TYPES`에 포함 — 완료 조건 1·2 충족(`user.service.spec.ts` 5건).
  **부수 효과**: 같은 목록을 `findPendingConsents`가 쓰므로, 이력이 없는 기존 사용자는
  다음 로그인의 `pending_consents`로 연령 확인을 한 번 요구받는다(정식 출시 전이라 수용).
- DTO `ArrayMaxSize` 3 → 4 (`sign-up` · `users/me/consents`).
- 문서: `domain.md` 3.2·11.4 갱신, `auth-api.md` 수정 요청은
  `changes/pending/auth-consents-age-confirmation.md`로 발행.
- **프론트 전달 사항**: enum 값은 `age_confirmation`, `version: null`, `is_agreed: true`로
  `POST /auth/sign-up` `consents` 배열에 넣어 보내면 된다. `social-login` 응답
  `required_consents`에도 이 값이 내려오므로 정적 행(`ageRow`) 대신 서버 목록 매핑도 가능하다.
