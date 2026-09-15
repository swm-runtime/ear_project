# [문서] `POST /users/me/consents`는 필수 동의의 철회(`is_agreed: false`)를 400 `CONSENT_REQUIRED`로 거부한다

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/spec/api/auth-api.md` 4.5 · 5장 에러 표 · `docs/features/common-error-handling.md` 9.3 |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-09-15 |
| 발견 시점 | 2026-09-15 백엔드 전체 검증 — 필수 동의 3종(`terms`·`privacy`·`age_confirmation`)의 `is_agreed: false` 행이 그대로 기록됐다 |
| 심각도 | 하 — 정상 클라이언트는 보내지 않는 값. 자해적 상태이며 다음 로그인의 `pending_consents`가 잡는다 |

## 문제

4.5는 이 API의 용도를 "약관 재동의, 마케팅 수신 동의 변경"으로 적고 "철회도 `is_agreed: false` 행 추가"라고만 적어, **필수 동의의 철회**가 허용되는지 정하지 않았다. 구현은 중복·버전만 검사해 필수 동의의 `false` 행을 기록했다. 가입(4.2)은 필수 3종이 `true`가 아니면 `CONSENT_REQUIRED`로 거부하므로 두 경로의 규칙이 어긋났다. 약관을 버리는 정식 경로는 탈퇴(4.7)다.

## 수정 내용

코드(2026-09-15 반영): `ConsentService.recordConsents`가 필수 동의 종류의 `is_agreed: false`를 **400 `CONSENT_REQUIRED`** 로 거부한다(가입과 같은 코드). 마케팅 철회는 종전대로 `false` 행 추가다.

- `auth-api.md` 4.5 본문에 한 줄: **"필수 동의(`terms`·`privacy`·`age_confirmation`)는 철회할 수 없다 — `is_agreed: false`면 400 `CONSENT_REQUIRED`. 약관을 거부하는 경로는 탈퇴(4.7)다."**
- `auth-api.md` 5장 `CONSENT_REQUIRED` 행의 상황에 "4.5 — 필수 동의 철회 시도"를 덧붙인다. `common-error-handling.md` 9.3 같은 행도 맞춘다.

## 완료 조건

- Given `auth-api.md` 4.5 / When 읽는다 / Then 필수 동의 철회가 400 `CONSENT_REQUIRED`라고 적혀 있다
- Given 로그인한 계정 / When `{ consent_type: "terms", is_agreed: false }`를 보낸다 / Then 400 `CONSENT_REQUIRED`이고 `consents`에 행이 늘지 않는다 (`consent.service.spec.ts` "필수 동의의 철회…")
- Given 같은 계정 / When `{ consent_type: "marketing", is_agreed: false }`를 보낸다 / Then 200이고 `false` 행이 추가된다
