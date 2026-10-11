# 첫 사용 튜토리얼(코치마크) 제거 — 문서 반영 요청

| 항목 | 값 |
|---|---|
| 발행 날짜 | 2026-10-11 |
| 발행자 | FE (이주호 지시 2026-10-11 18:54 "튜토리얼 화면 없애자") |
| 반영 대상 | `spec/uiux/onboarding-uiux.md` 4.6 · `features/notification.md` 4.x(사전 안내 여는 시점)·완료 조건 · `spec/uiux/profile-uiux.md` 4.11 · `spec/uiux/library-uiux.md` 134행 · `features/analytics.md` 3.4 `onboarding_step` |
| 코드 반영 | PR(refactor(fe): remove first-run tutorial) — `FirstRunTutorial`·`walkthrough.store` 삭제, `usePrePromptGate`·`launch-dialog-gate` 신호 제거 |

## 수정 내용

온보딩 직후 착지 화면(탐색) 위에 띄우던 **첫 사용 튜토리얼(3단계 스포트라이트 코치마크)을 뺐다.** 온보딩 완료(O9 자동 통과) 뒤 곧바로 착지 화면이 보이고, 알림 사전 안내(O10)는 착지 뒤 400ms 지연만 두고 뜬다. 가입 체험 안내(P11)는 그 뒤다.

- `onboarding-uiux.md` 4.6 — "첫 사용 튜토리얼" 표·규칙 블록 삭제. "알림 사전 안내는 튜토리얼이 끝난 뒤 연다" → "온보딩 완료 뒤 착지 화면에서 400ms 뒤 연다". 신규 가입 순서 **알림 사전 안내(O10) → 가입 체험 안내(P11)**. 미결 항목의 "튜토리얼 4단계로 추가할지"·"튜토리얼 3단계 카피 '2편'"·"튜토리얼 소유 문서"는 대상이 사라졌으니 삭제(무료 티어 안내의 자리 미결 자체는 남는다 — 선택지에서 튜토리얼만 뺀다).
- `notification.md` — 사전 안내 여는 시점의 "코치마크가 끝난 뒤" 서술과 완료 조건 3건(코치마크 Given)을 "온보딩 완료 → 착지 뒤 400ms" 로 바꾼다. "코치마크가 없는 진입은 즉시 연다" 는 지연 규칙으로 흡수.
- `profile-uiux.md` 4.11 — 신규 가입 순서에서 "첫 사용 튜토리얼 →" 삭제.
- `library-uiux.md` 134행 — "온보딩 튜토리얼(O 계열 예시 화면)의 라이브러리 머리 줄도 같은 구성" 문장 삭제.
- `analytics.md` 3.4 — `onboarding_step.step` 값에서 `tutorial` 삭제, 181행 주석 삭제.

## 사유

PM 결정(2026-10-11). 튜토리얼이 가리키던 흐름(담기 → 라이브러리 → 매일 아침 도착)은 화면 자체가 설명하고, 가입 직후 세 장을 넘기는 비용이 더 크다.

## 완료 조건

- Given 위 문서들 / When "튜토리얼"·"코치마크"·`walkthrough` 를 검색한다 / Then 온보딩 직후 흐름 서술에 남아 있지 않다(이 요청 문서와 archive 는 제외).
- Given `onboarding-uiux.md` 4.6 / When 신규 가입 안내 순서를 읽는다 / Then "알림 사전 안내(O10) → 가입 체험 안내(P11)" 두 단계다.
