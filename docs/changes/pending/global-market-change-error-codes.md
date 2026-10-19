# common-error-handling — 시장 전환 에러 코드 2개 등재 (BE · KAN-227)

| 항목 | 값 |
|---|---|
| 대상 문서 | `features/common-error-handling.md` 9장(에러 코드 목록) |
| 요청 파트 | 백엔드 — 박준현 |
| 발행 날짜 | 2026-10-19 |
| 시작 날짜 | 2026-10-19 |
| 기한 | 2026-10-24 (1.3.0 심사 제출 — 앱이 이 코드를 처리하는 설정 화면이 1.3.0에 들어간다) |
| 선행 | 없음 |
| 중요도 | Medium |
| 관련 | [KAN-227](https://runtime364.atlassian.net/browse/KAN-227) · `spec/api/global-api.md` 4.11·5장 · 서버 구현 브랜치 `feat(be)/market-change` |

## 배경

가입 뒤 시장 전환(`global-api.md` 4.11)이 생기며 서버에 에러 코드 2개가 새로 생겼다(`common/exceptions/error-code.enum.ts`). `common-error-handling.md`는 FE 소유 계약 문서라 BE가 직접 고치지 않고 등재를 요청한다. 앱은 모든 `error_code`에 ko/en 문구를 갖고 누락을 테스트로 막는다(`global-api.md` 2.3).

## 고칠 내용

9장 표에 두 행을 더한다.

| error_code | HTTP | retryable | 뜻 · 클라이언트 처리 |
|---|---|---|---|
| `MARKET_UNAVAILABLE` | 409 | false | 옮겨 갈 시장이 지금 열려 있지 않다(노출 주제 0개 · GLOBAL 가입 닫힘 · 전환 스위치 꺼짐). 미리보기가 `blocked_reason: market_unavailable`로 먼저 알려 주므로 정상 UI에서는 드물다 — 선택지를 비활성으로 두고 안내 문구 |
| `MARKET_CHANGE_COOLDOWN` | 429 | false | 같은 서비스 날짜(05:00 KST)에 두 번째 전환. 최상위 `retry_after_sec`가 다음 05:00까지 남은 초다 — 자동 재시도하지 않고 "내일 다시 바꿀 수 있어요" 류 안내 |

시장 전환의 동의 오류는 기존 코드를 그대로 쓴다 — 400 `CONSENT_REQUIRED`(새 시장 필수 동의 누락) · 409 `CONSENT_VERSION_STALE`(현행과 다른 버전 → **미리보기를 다시 받는다**. 가입 화면의 재조회 대상과 다르다).

## 완료 조건

- Given `common-error-handling.md` 9장 / When 표를 본다 / Then `MARKET_UNAVAILABLE`(409·false)과 `MARKET_CHANGE_COOLDOWN`(429·false·`retry_after_sec`) 두 행이 있다

## 처리 기록

- 2026-10-19 발행(BE — 서버 구현과 같은 PR).
