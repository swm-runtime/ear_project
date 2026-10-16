# GLOBAL 약관·처리방침 동의 버전 — 시장별 버전 `global-0.1` (BE)

| 항목 | 값 |
|---|---|
| 대상 문서 | `backend/domain.md` 3.2(`version` 주석) · `spec/api/auth-api.md` 4.1 · 4.2 · 4.5 · `spec/api/global-api.md` 4.1 · 9장 미결 #5 |
| 요청 파트 | 백엔드 — 박준현 |
| 발행 날짜 | 2026-10-16 |
| 관련 | BE [KAN-212](https://runtime364.atlassian.net/browse/KAN-212) 2번 `tickets/backend/pending/global-kr-topic-slug-and-consents.md` · `changes/archive/global-cross-border-consent-backend.md`(KAN-215 — 이 변경이 그 위에 쌓인다) |

## 배경

시장마다 약관·처리방침은 서로 다른 문서다. KR은 한국어판(랜딩 `legal.ts`), GLOBAL은 영어판(`legal-en.ts`, "0.1 — global market")이다. 그런데 서버의 현행 버전은 시장과 무관한 한 벌(`terms 0.1` · `privacy 0.1`)이었다. 그래서 GLOBAL 가입자가 영어판에 동의해도 이력에는 KR 문서와 똑같은 `0.1`이 남았다. 동의 이력만 봐서는 어느 문서에 동의했는지 알 수 없었다. 법적 입증 자료로 쓰기에 부족하다.

## 수정 내용

- **현행 버전은 시장별이다**(`CURRENT_CONSENT_VERSIONS_BY_MARKET`).

  | 시장 | `terms` | `privacy` | 그 밖(`marketing` · `age_confirmation` · `cross_border_transfer`) |
  |---|---|---|---|
  | KR | `0.1` | `0.1` | null |
  | GLOBAL | `global-0.1` | `global-0.1` | null |

- **값 형식** — `global-` 접두 + 문서 버전이다. 두 문서가 각자 0.1에서 시작해서, 접두가 없으면 KR 문서의 0.1과 겹친다. 영어판이 개정되면 `global-0.2`처럼 문서 버전을 따라 올린다.
  - `global-api.md` 4.1의 예시 `terms_global_v1`(🟡)은 쓰지 않는다. 동의 종류는 이미 `consent_type` 컬럼에 있고, 버전 값은 문서의 버전 표기와 맞추는 편이 대조하기 쉽다.
  - 앱은 서버가 내려준 값을 그대로 돌려보내므로 형식에 의존하지 않는다(KAN-206 처리 기록).
  - 탈퇴 아카이브(`archived_consents`)에는 시장 컬럼이 없다. 접두가 있어야 아카이브만 보고도 어느 문서였는지 안다.
  - FE 테스트 데이터(`auth.api.test.ts`)의 `terms_global_v1`은 동작과 무관한 예시다. 문서를 고친 뒤 맞출지는 FE가 정한다.
- **판정 규칙** — 가입·재동의(`pending_consents`)·`POST /users/me/consents`가 모두 **그 사용자 시장의 버전**과 비교한다.
  - GLOBAL 가입이 KR 버전(`0.1`)을 보내면 409 `CONSENT_VERSION_STALE`이다. 다른 시장 문서의 동의를 남기지 않는다.
  - 가입 동의 목록(로그인 응답·`POST /auth/sign-up/consents`)도 그 시장 버전을 내려준다.
- **`domain.md` 3.2** — `version` 행 주석에 "시장별 — KR `0.1` · GLOBAL `global-<문서 버전>`. 버전 값만으로 어느 시장 문서인지 구분된다(`archived_consents`에는 시장 컬럼이 없다)"를 덧붙인다.
- **`auth-api.md`** — 4.1·4.2의 버전 예시 옆에 "버전은 시장별이다(KR `0.1` · GLOBAL `global-0.1`)"를 적는다. 4.5에는 "보낸 버전은 그 사용자 시장의 현행 버전과 대조한다 — 다르면 409 `CONSENT_VERSION_STALE`"을 적는다.
- **`global-api.md` 4.1** — "`pending_consents[].version`에 시장 네임스페이스가 들어간다 — 예 `terms_global_v1` 🟡"를 "GLOBAL은 `global-<문서 버전>`(현행 `global-0.1`) ✅"로 바꾼다.
- **`global-api.md` 9장 미결 #5** — 결정됐으니 행을 지운다.
  - 재동의 흐름은 KR과 같다. 버전을 올리면 그 시장 사용자만 다음 로그인·세션 복원에서 다시 동의한다.
  - 미결의 기본값("가입 시 1회, 재동의 없음")과 다르다. 이 결정은 BE(박준현, 2026-10-16)가 했고 **법무 확인 전**이다. 지금 GLOBAL 문서는 0.1 하나라 재동의가 실제로 일어나지 않으니, 개정 전에 법률 멘토 미팅(KAN-126)에서 확인한다.

## 영향

- **운영**: GLOBAL 사용자가 0명이라 재동의가 생기지 않는다. KR은 값이 그대로라 변화가 없다.
- **개발계**: 지금은 사용자 30명이 전부 KR이다(2026-10-16 집계). 그 전에 GLOBAL로 가입한 계정이 있다면, 배포 뒤 약관·처리방침 재동의를 한 번 요구받는다. 의도한 동작이다.

## 완료 조건

- Given `domain.md` 3.2 · `global-api.md` 4.1 / Then 버전이 시장별이고 GLOBAL 형식이 `global-<문서 버전>`이라고 적혀 있다
- Given `global-api.md` 9장 / Then 미결 #5가 없다
- Given GLOBAL 재조회·가입 / Then `terms`·`privacy` 버전이 `global-0.1`이고, KR 버전을 보내면 409다

## 처리 기록

- 2026-10-16 발행(서버 구현 PR과 함께). 반영 전.
- 2026-10-16 반영 — 반영 날짜 2026-10-16. domain.md 3.2 version 시장별, auth-api.md 4.1 동의 항목 객체·4.2·4.5·5장, global-api.md 4.1(🟡→✅)·9장 미결 #5 삭제. `archive/`로 이동.
