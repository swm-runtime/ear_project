# 시장 전환 결정(global-api 4.11)에 맞춰 "시장 불변" 서술 정리 — 다른 문서

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/auth-api.md` 121·230행 근처("불변") · `spec/api/settings-api.md` 143행 근처("시장 전환 불허 — 화면은 표시만") · `features/auth.md` 82·317행 근처 · `spec/uiux/auth-uiux.md` 112·114·134·146행(A21 "변경 불가" — 141·158행은 FE 반영됨) · **추가 2026-10-20**: `features/settings.md` 53행·4.1 표 · `spec/api/global-api.md` 121행 · `features/onboarding.md` 4장 |
| 요청 파트 | 백엔드 — 박준현 |
| 발행 날짜 | 2026-10-19 |
| 시작 날짜 | 2026-10-19 |
| 기한 | 1.3.0 통합 때 — 시장 전환은 1.3.0에 나간다(서버 KAN-227 · 앱 KAN-228 완료, 둘 다 2026-10-19 archive. 2026-10-20 정정 — 종전 "1.3.0 다음") |
| 선행 | 없음 — KAN-227·228 완료(2026-10-19) |
| 중요도 | Low — 서술 정리. 계약 원본은 `global-api.md` 4.11 |
| 관련 | [KAN-227](https://runtime364.atlassian.net/browse/KAN-227) · `changes/archive/global-market-change-design.md` |

## 배경

2026-10-19 결정으로 가입 뒤 시장 전환이 생겼다(`global-api.md` 2.1 "전환" 행 · 4.11, `domain.md` 3.1). 위 문서들은 아직 "시장은 가입 시 1회 정해지고 바꿀 수 없다"고 적는다. 시장 전환은 1.3.0에 들어갔으므로(서버 `MARKET_CHANGE_ENABLED` 뒤 · 앱 설정 › 콘텐츠 언어 — KAN-227·228, 2026-10-19), **1.3.0 통합 때** 함께 고친다. (2026-10-20 정정 — 발행 때는 "지금 구현(1.3.0)까지는 그 서술이 사실"이라고 보고 다음 버전으로 미뤘으나, 같은 날 전환이 1.3.0에 들어갔다.)

## 고칠 내용

1. `auth-api.md` · `features/auth.md` — "시장 불변"을 "가입 때 정하고, 가입 뒤에는 시장 전환(`global-api.md` 4.11)으로만 바뀐다"로 바꾼다.
2. `settings-api.md` — `account.market`은 읽기 전용 그대로다. 단 "전환 불허"를 "전환은 `POST /users/me/market-change`(`global-api.md` 4.11)"로 바꾼다.
3. `auth-uiux.md` A21 — "가입한 뒤에는 바꿀 수 없어요" 문구는 FE가 설정 화면 티켓에서 새 카피로 바꾼다(예: "설정에서 언제든 바꿀 수 있어요" — 카피는 FE가 정한다).
4. `tickets/frontend/pending/global-signup-locale-market.md`의 "시장 불변" 언급은 FE가 그 티켓 처리 때 정리한다(기록 문서라 고치지 않아도 된다).

**추가 대상(2026-10-20 i18n 검증)**

5. `features/settings.md` 53행(4.1 표 "언어" 행) — "**콘텐츠 언어(시장)는 가입 때 정해져 바뀌지 않는다**"를 "콘텐츠 언어(시장)는 이 행이 아니라 아래 **콘텐츠 언어** 행에서 바꾼다 — 표시 언어를 바꿔도 시장은 바뀌지 않는다"로 바꾼다. 그리고 4.1 표에 **콘텐츠 언어** 행을 더한다: "언어 | 콘텐츠 언어(언어 행 바로 아래) | 한국어 · English — 미리보기(`GET /users/me/market-change/preview`) → 새 시장 필수 동의(A4 컴포넌트) → 전환(`POST /users/me/market-change`) → 새 액세스 토큰으로 교체 → 재온보딩. 막히면 동의 대신 미리보기의 `blocked_reason`(`market_unavailable`·`cooldown`)대로 안내한다. 서비스 날짜당 1회(재온보딩 전 직전 시장으로 되돌리기는 예외). 라이브러리·재생 위치는 남고 이전 시장 항목은 숨는다. 관심 주제는 다시 고른다. 계약·규칙 원본은 `global-api.md` 4.11, 화면·카피는 `settings-uiux.md` '콘텐츠 언어' 행".
6. `spec/api/global-api.md` 121행(4.1) — 괄호 "(카피는 FE `spec/uiux` — 종전 '가입 뒤 변경 불가'는 전환이 구현되는 버전에서 바꾼다, 4.11)"를 "(카피는 FE `spec/uiux/auth-uiux.md` 4.2-1 — 전환은 4.11)"로 줄인다. 전환이 구현됐고 A21 카피도 이미 바뀌었다(`auth-uiux.md` 158행 "나중에 설정에서 바꿀 수 있어요").
7. `spec/uiux/auth-uiux.md` A21 — FE가 141·158행은 바꿨으나 남은 줄이 있다(2026-10-20 확인):
   - 112행 "**고른 값이 시장을 정하고 가입 뒤에는 바꿀 수 없다** … 무엇이 달라지는지와 변경 불가를 이 화면에서 함께 밝힌다" → "고른 값이 시장을 정하고, 가입 뒤에는 설정 › 콘텐츠 언어에서 바꿀 수 있다(`global-api.md` 4.11) — 무엇이 달라지는지와 나중에 바꿀 수 있다는 것을 함께 밝힌다".
   - 114행 구성의 "변경 불가 안내" · 134행 "변경 불가" · 146행 "변경 불가 안내는 **[다음] 바로 위**에 둔다" → "나중에 바꾸기 안내"(158행 표의 행 이름과 같게).
8. `features/onboarding.md` 4장 "단계 구성" — 시장 규칙 두 가지가 없다.
   - **시장별 단계**: 단계는 서버가 `GET /onboarding/state`의 `steps[]`로 준다 — KR `["topic","career"]`, GLOBAL `["topic"]`(커리어는 한국 직군 분류라 GLOBAL에 없다). 클라이언트는 배열대로 잇고 하드코딩하지 않는다. GLOBAL 계정의 커리어 저장은 409 `MARKET_MISMATCH`. 근거 `onboarding-api.md` 111행 · `global-api.md` 4.4 · 코드 `backend/src/modules/user/policies/onboarding-steps.policy.ts`.
   - **시장 전환 뒤 재온보딩**: 전환하면 `onboarding_completed = false` · `onboarding_step = topic`, 단계는 새 시장의 `steps[]`. 이전 시장 관심 주제는 비활성이라 주제를 다시 고른다. 커리어 값은 지우지 않는다(GLOBAL → KR이면 기본 선택). `onboarding_completed_at`은 처음 값을 유지한다. 재온보딩을 끝내면 첫 드립이 새 시장으로 다시 돈다. 근거 `global-api.md` 4.11 "전환 때 바뀌는 것" 표.

## 완료 조건

- Given 위 문서들 / When "불변"·"바꿀 수 없" 을 검색한다 / Then 시장에 관한 서술이 4.11을 가리키거나 사라져 있다
- Given `features/settings.md` 4.1 표 / Then 콘텐츠 언어 행이 있고 `global-api.md` 4.11·`settings-uiux.md`를 가리킨다
- Given `auth-uiux.md` A21 / When "변경 불가"를 검색한다 / Then 0건이다
- Given `features/onboarding.md` 4장 / Then 시장별 `steps[]` 규칙과 시장 전환 뒤 재온보딩이 적혀 있다

## 처리 기록

- 2026-10-19 발행(BE — 브랜치 `docs(be)/market-change-contract`, 검증 에이전트가 찾은 목록).
- 2026-10-19 3번(A21 문구) FE 반영 — `auth-uiux.md` 4.2-1 표 "나중에 설정에서 바꿀 수 있어요" / "You can change this later in Settings." · 기존 사용자 서술을 설정 › 콘텐츠 언어로(KAN-228, PR `feat(fe)/market-change-settings`). 1·2번은 그대로 남는다.
- 2026-10-20 i18n 검증으로 대상 추가/정정 — 기한(1.3.0 통합)·선행(없음 — KAN-227·228 완료)·배경 전제 정정, 5~8번(`settings.md`·`global-api.md` 121행·`auth-uiux.md` 남은 줄·`onboarding.md`) 추가(BE — 브랜치 `docs(be)/i18n-audit-change-requests`).
