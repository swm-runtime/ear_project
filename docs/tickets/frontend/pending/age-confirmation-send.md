# [FE] 연령 확인을 가입 요청에 실어 보낸다 — `age_confirmation` 전송

| 항목 | 값 |
|---|---|
| 대상 | `useTermsConsentScreen.ts`(`ageRow`) · sign-up 요청 조립 |
| 요청 파트 | 프론트엔드 |
| 발행 날짜 | 2026-09-06 |
| 발견 시점 | `tickets/backend/archive/age-confirmation-consent` 반영(PR #142 머지) — 서버 준비 완료, 전송만 남음 |
| 근거 문서 | `domain.md` 3.2 · `changes/pending/auth-consents-age-confirmation.md` |
| 심각도 | **중** — 전송 전까지는 서버에 연령 확인 이력이 계속 비어 있다. **서버가 필수 동의로 판정하므로, 미전송 상태로 서버가 배포되면 신규 가입이 `CONSENT_REQUIRED`(400)로 전부 막힌다 — 서버 배포 전에 반영돼야 한다** |
| 상태 | pending |

## 배경

백엔드가 `consents.consent_type`에 `age_confirmation`을 추가하고 가입 필수 동의(3종)에
포함했다(PR #142). A4 화면은 이미 "만 18세 이상입니다 (필수)" 행을 그리고 게이트도 걸지만
(`a0496f8`), 체크 사실이 서버로 전송되지 않는다.

## 요청 내용

1. `POST /auth/sign-up`의 `consents` 배열에 다음 항목을 추가해 보낸다:
   ```json
   { "consent_type": "age_confirmation", "version": null, "is_agreed": true }
   ```
   - `version`은 항상 `null`이다(열람할 문서가 없는 자기 선언 — 마케팅과 동일).
2. (선택) `social-login` 응답의 `required_consents`에 이 값이 내려오므로, 정적 `ageRow`
   대신 서버 목록 매핑으로 바꿔도 된다 — 동작 무변경이면 후순위.
3. **기존 사용자 재동의 대응**: 연령 확인 이력이 없는 기존 사용자는 로그인 응답
   `pending_consents`에 `age_confirmation`이 온다. 재동의 화면이 이 항목을 렌더·전송할 수
   있는지 확인한다(`POST /users/me/consents`도 이 값을 받는다).

## 완료 조건

- Given 신규 가입 / When 전체 동의 후 [동의하고 시작하기] / Then 서버 `consents`에 `age_confirmation` 행이 남고 가입이 성공한다
- Given `age_confirmation` 미포함 요청 / When 서버가 처리 / Then `CONSENT_REQUIRED`(400) — 클라이언트가 이 상태를 만들지 않아야 한다
- Given 이력 없는 기존 사용자 로그인 / When `pending_consents`에 `age_confirmation`이 온다 / Then 재동의 화면이 항목을 표시하고 전송한다
