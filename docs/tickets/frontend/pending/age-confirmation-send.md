# [FE] 연령 확인을 가입 요청에 실어 보낸다 — `age_confirmation` 전송

| 항목 | 값 |
|---|---|
| 대상 | `useTermsConsentScreen.ts`(`ageRow`) · sign-up 요청 조립 |
| 요청 파트 | 프론트엔드 |
| 발행 날짜 | 2026-09-06 |
| 발견 시점 | `tickets/backend/archive/age-confirmation-consent` 반영(PR #142 머지) — 서버 준비 완료, 전송만 남음 |
| 근거 문서 | `domain.md` 3.2 · `changes/pending/auth-consents-age-confirmation.md` |
| 심각도 | **중** — 전송 전까지는 서버에 연령 확인 이력이 계속 비어 있다. **서버가 필수 동의로 판정하므로, 미전송 상태로 서버가 배포되면 신규 가입이 `CONSENT_REQUIRED`(400)로 전부 막힌다 — 서버 배포 전에 반영돼야 한다** |
| 상태 | pending — 완료 조건 3(재동의 경로) 남음 |

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

## 처리 기록

| 항목 | 값 |
|---|---|
| 반영 날짜 | 2026-09-06 |
| 반영 내용 | `age_confirmation` 을 화면 전용 키에서 **서버 동의 유형으로 승격**하고 sign-up 요청에 실어 보낸다 |

- `ConsentType` 에 `age_confirmation` 추가, 화면 전용 `ConsentRowType` 폐기
- 서버 목록(`requiredConsents`)에 이미 있으면 그것을 쓰고, 아직 내려주지 않는 서버를 만나면
  클라이언트가 채운다 — 빠뜨리면 서버가 `CONSENT_REQUIRED` 로 가입을 막는다
- 제출은 **화면이 그린 행 그대로** 보낸다(`items`). 서버 목록만 매핑하면 연령 확인이 누락된다
- 전체 동의도 이 항목을 함께 켠다

완료 조건 1·2 충족. 3(기존 사용자 재동의 화면)은 그 화면이 아직 없어 **미충족** — 재동의
화면을 만들 때 이 항목을 함께 처리해야 한다.

## 진행 기록 (2026-09-06)

- **요청 1 반영됨** — 가입 요청이 `age_confirmation`(version null) 행을 포함해 전송한다.
  요청 2도 함께 반영: 정적 행이 아니라 서버 `required_consents` 목록을 매핑하고, 목록에
  없으면 폴백으로 채운다(`useTermsConsentScreen.ts`).
- **완료 조건 1·2 충족** — 이로써 **백엔드 배포 차단이 풀렸다**(미전송 가입이 발생하지 않는다).
- **완료 조건 3(기존 사용자 재동의) 미충족 — 보류** — `useStartScreen.ts`에
  `TODO(auth): pendingConsents가 있으면 재동의 화면으로 보낸다`로 남아 있다. 현재는
  로그인 응답의 `pending_consents`를 무시하고 세션을 시작하므로, 이력 없는 기존 사용자
  (테스트 계정뿐)의 연령 확인이 기록되지 않는다. 로그인 자체는 막히지 않아 서비스 동작
  지장은 없다. 재동의 화면 연결(약관 개정 재동의와 같은 경로)이 붙으면 이 티켓을 닫는다.

## 추가 기록 (2026-09-06 저녁 — 배포 순서 우려 해소)

백엔드가 CI 자동 배포(`deploy-api.yml`)로 **이미 실서버에 반영됐는데도 가입이 막히지
않았다** — 구 빌드(TestFlight 빌드 3, c31f190)의 동의 화면도 서버 `required_consents`
목록을 그대로 그려 전송하는 구조라, 서버가 내려준 `age_confirmation` 행을 체크·전송한다.
다만 구 빌드에는 `age_confirmation` 라벨 카피가 없어 **행 라벨이 빈 채로 보인다**(동작
무지장, 미관 문제) — dev 를 main 에 머지하면 OTA(production 채널)로 카피가 내려가 해소된다.
