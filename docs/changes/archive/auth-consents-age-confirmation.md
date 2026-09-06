# auth-api.md — 가입 필수 동의에 연령 확인(`age_confirmation`) 추가

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/spec/api/auth-api.md` 4.1 · 4.2 · 4.5 |
| 발행 날짜 | 2026-09-06 |
| 발견 시점 | `tickets/backend/age-confirmation-consent` 반영 — 서버 구현이 먼저 확정됨 |
| 요청 파트 | 백엔드 |

## 수정 내용

`consents.consent_type`에 `age_confirmation`(만 18세 이상 자기 선언)이 추가되어 가입 필수 동의가 2종 → **3종**이 됐다(`domain.md` 3.2 반영 완료). 계약 문서를 다음과 같이 맞춘다.

### 4.1 `POST /auth/social-login`

- `consent_required` 응답의 `required_consents`에 `{ "consent_type": "age_confirmation", "version": null, "is_required": true }`가 포함된다.
- 기존 사용자 로그인 응답의 `pending_consents`에도 같은 항목이 올 수 있다 — **연령 확인 이력이 없는 기존 사용자는 다음 로그인에서 한 번 확인을 요구받는다.**

### 4.2 `POST /auth/sign-up`

- 요청 예시의 `consents` 배열에 `{ "consent_type": "age_confirmation", "version": null, "is_agreed": true }` 추가 (최대 4항목).
- "동의 3종" → "동의 4종(필수 3 + 마케팅)" 표현 수정.
- 필수 판정 문구: "필수 2종(`terms`·`privacy`)" → "필수 3종(`terms`·`privacy`·`age_confirmation`)이 `is_agreed: true`가 아니면 계정을 만들지 않는다(`CONSENT_REQUIRED`)".
- `age_confirmation`은 열람할 문서가 없는 자기 선언이므로 `version`이 항상 `null`이다(마케팅과 동일).

### 4.5 `POST /users/me/consents`

- 재동의 경로로도 `age_confirmation` 행을 받을 수 있다(배열 최대 4항목).

## 사유

Play Console 대상 연령대(만 18세 이상) 선언과 함께 A4 화면에 연령 확인 게이트가 들어갔는데(`a0496f8`), 확인 사실이 서버에 남지 않아 분쟁 시 입증 수단이 없었다. 서버가 이력으로 기록하도록 구현이 확정되어(2026-09-06) 계약 문서를 뒤따라 맞춘다.

## 처리 기록 (반영 날짜: 2026-09-06)

사용자 지시로 통합 대기 없이 즉시 반영 — 대상 문서에 수정 내용 그대로 적용했다.
