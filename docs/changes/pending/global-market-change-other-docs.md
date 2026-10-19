# 시장 전환 결정(global-api 4.11)에 맞춰 "시장 불변" 서술 정리 — 다른 문서

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/auth-api.md` 121·230행 근처("불변") · `spec/api/settings-api.md` 143행 근처("시장 전환 불허 — 화면은 표시만") · `features/auth.md` 82·317행 근처 · `spec/uiux/auth-uiux.md` 112·141·158행(A21 "가입한 뒤에는 바꿀 수 없어요") |
| 요청 파트 | 백엔드 — 박준현 |
| 발행 날짜 | 2026-10-19 |
| 시작 날짜 | 2026-10-19 |
| 기한 | 시장 전환이 구현되는 버전(1.3.0 다음)의 통합 때 |
| 선행 | KAN-227 서버 구현 · FE 설정 화면 티켓 — 구현 전에 고치면 앱 문구와 실제 동작이 어긋난다 |
| 중요도 | Low — 서술 정리. 계약 원본은 `global-api.md` 4.11 |
| 관련 | [KAN-227](https://runtime364.atlassian.net/browse/KAN-227) · `changes/archive/global-market-change-design.md` |

## 배경

2026-10-19 결정으로 가입 뒤 시장 전환이 생겼다(`global-api.md` 2.1 "전환" 행 · 4.11, `domain.md` 3.1). 위 문서들은 아직 "시장은 가입 시 1회 정해지고 바꿀 수 없다"고 적는다. 지금 구현(1.3.0)까지는 그 서술이 사실이므로, **전환이 구현되는 버전의 통합 때** 함께 고친다.

## 고칠 내용

1. `auth-api.md` · `features/auth.md` — "시장 불변"을 "가입 때 정하고, 가입 뒤에는 시장 전환(`global-api.md` 4.11)으로만 바뀐다"로 바꾼다.
2. `settings-api.md` — `account.market`은 읽기 전용 그대로다. 단 "전환 불허"를 "전환은 `POST /users/me/market-change`(`global-api.md` 4.11)"로 바꾼다.
3. `auth-uiux.md` A21 — "가입한 뒤에는 바꿀 수 없어요" 문구는 FE가 설정 화면 티켓에서 새 카피로 바꾼다(예: "설정에서 언제든 바꿀 수 있어요" — 카피는 FE가 정한다).
4. `tickets/frontend/pending/global-signup-locale-market.md`의 "시장 불변" 언급은 FE가 그 티켓 처리 때 정리한다(기록 문서라 고치지 않아도 된다).

## 완료 조건

- Given 위 문서들 / When "불변"·"바꿀 수 없" 을 검색한다 / Then 시장에 관한 서술이 4.11을 가리키거나 사라져 있다

## 처리 기록

- 2026-10-19 발행(BE — 브랜치 `docs(be)/market-change-contract`, 검증 에이전트가 찾은 목록).
