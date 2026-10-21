# auth-api.md 4.1·4.2·4.5·4.13 · global-api.md 2.1 — 연령 확인 항목에 `min_age`(나라별 기준 연령) 추가 (백엔드 확인 필요)

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/spec/api/auth-api.md` — 동의 항목 객체(`required_consents[]`·`pending_consents[]`)를 쓰는 4.1 social-login · 4.13 `GET /users/me` · 가입 동의 재조회(`changes/archive/auth-signup-consents-refetch.md`) · `docs/spec/api/global-api.md` 2.1 연령 행 |
| 요청 파트 | 프론트엔드 (백엔드 협의 필요 — 판정·응답은 BE 소유) |
| 발행 날짜 | 2026-10-16 |
| 발견 시점 | KAN-206 GLOBAL 연령 결정 — PM이 나라별(3안)을 골랐다(2026-10-16, Jira KAN-206 댓글 13:38 박준현 선택지 정리) |
| 관련 | FE [KAN-206](https://runtime364.atlassian.net/browse/KAN-206) `tickets/frontend/pending/global-age-consent-16.md` · BE [KAN-220](https://runtime364.atlassian.net/browse/KAN-220) `tickets/backend/archive/global-age-by-region.md` · [KAN-215](https://runtime364.atlassian.net/browse/KAN-215)(동의 재조회 — 같은 응답) · [KAN-207](https://runtime364.atlassian.net/browse/KAN-207)(스토어 연령 설정) |

## 배경

GLOBAL 연령을 일괄 16(2026-10-14)에서 **나라별**로 바꿨다. 본인 동의 연령이 16 이하인 나라는 16, 18세 미만에 법정대리인 동의가 필요한 나라와 성년이 20인 태국은 18이다. 사용자의 나라는 가입 때 받는 기기 지역(`locale.region_code`)으로 본다 — GPS가 아니라 사용자가 바꿀 수 있는 값이라 "자기 선언" 수준의 근거다.

"판정은 서버가 한다"(CLAUDE.md)에 따라 숫자는 서버가 정해 내려주고, 앱은 끼워서 그리기만 한다.

## 수정 내용(제안)

**동의 항목 객체에 선택 필드 하나**

| 필드 | 타입 | 언제 | 설명 |
|---|---|---|---|
| `min_age` | integer | `consent_type = age_confirmation` 항목에만 | 이 사용자가 확인할 기준 연령. 다른 유형에는 싣지 않는다 |

**판정 규칙**(`global-api.md` 2.1 연령 행)

| 시장 | 지역(`region_code`) | `min_age` |
|---|---|---|
| `kr` | 무관 | 18 |
| `global` | `SG` · `HK` · `KR` | 16 |
| `global` | `MY` · `PH` · `ID` · `TH` · 그 밖 · 없음 | 18 |

- 가입 전(social-login `required_consents` · 동의 재조회)에는 요청의 `locale`로, 가입 후(`pending_consents`)에는 `users.region_code`로 판정한다.
- sign-up은 같은 입력으로 같은 판정을 한다 — 화면에 보인 숫자와 서버가 받았다고 기록하는 숫자가 어긋나지 않아야 한다. 동의 이력에 어떤 기준 연령으로 확인받았는지 남길지(예: `version`에 `age_16`)는 BE가 정한다.
- 앱은 `min_age`가 없으면 **18로 그린다**(보수값) — 구 서버와 섞여도 16이 잘못 보이는 일은 없다.

## 완료 조건

- Given GLOBAL·지역 SG 신규 가입 / When 동의 목록 / Then `age_confirmation`의 `min_age`가 16
- Given GLOBAL·지역 MY 또는 지역 없음 / Then 18
- Given KR 시장 / Then 지역과 무관하게 18
- Given `auth-api.md`·`global-api.md` / When 이 요청 반영 후 / Then 동의 항목 표에 `min_age`가 있고 2.1 연령 행에 판정 표가 있다
- 2026-10-16 반영 — 반영 날짜 2026-10-16. auth-api.md 4.1 동의 항목 객체에 min_age, global-api.md 2.1 연령 행 🟡→✅, auth-uiux.md 4.3 제안 필드 문구 정리(BE 답은 age-by-region-backend.md). `archive/`로 이동.
