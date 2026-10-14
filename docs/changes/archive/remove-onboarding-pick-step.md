# 온보딩 3단계 "추천 콘텐츠 담기" 제거 — 문서 반영 요청

| 항목 | 값 |
|---|---|
| 발행 날짜 | 2026-10-11 |
| 발행자 | FE (이주호 지시 2026-10-11 19:33 "온보딩에서 3번째 콘텐츠 담는 화면도 없애자") |
| 반영 대상 | `features/onboarding.md` 3·4·5·6·7·8장·미결 · `spec/uiux/onboarding-uiux.md` 2·3·4.4·4.5·5·7·8·9장 · `wireframe/onboarding.html` O7·O8·O12 · `spec/api/onboarding-api.md` 4.5·4.6(FE 호출 없음 표기)·4.7 · `features/analytics.md` 3.4 · `prd/ear_root_prd.md`(온보딩 단계 수) |
| 코드 반영 | PR(refactor(fe): remove onboarding pick step) — `PickScreen`·`ContentPickCard`·추천 조회·담기 요청·`StepIndicator` 삭제 |
| 반영 날짜 | 2026-10-14 |

## 수정 내용

온보딩이 **주제(1/2) → 커리어(2/2) → 완료 대기(O13) → 완료(자동 통과) → 탐색** 두 입력 단계가 된다. 추천 콘텐츠 담기(O7-a·O7-b·O8·O12, 구 3/3)는 없다. 라이브러리의 첫 채움은 첫 드립이 전담한다.

- 완료 요청(`POST /onboarding/complete`)은 2단계 저장 성공 뒤 완료 대기 화면이 뜨며 나간다. 재개 진입(`onboarding_step = pick`·`done`)도 완료 대기로 바로 간다. 서버 계약은 그대로다 — 종전 [건너뛰기](0건) 경로와 같은 호출 순서(career 저장 → complete)이고 `picked_count` 는 늘 0, `awaits_first_drip` 판정은 서버가 한다.
- `onboarding.md` — 3장 "3단계의 0개 선택" 규칙, 4장 단계 구성·[3] 로직·"완료 화면을 언제 띄우는지는 담은 수에 따라" 분기, 5장 3단계 화면 상태, 6장 추천 후보 풀 행, 7장 "3단계 추천 0건"·"담기 API 일부 실패"·재개 지점 서술, 8장 완료 조건의 `1/3·2/3·3/3`·추천 9건 항목, 미결의 추천 구성·0건 선택 행을 지우거나 2단계 기준으로 고친다. 인디케이터는 `1/2 · 2/2` 텍스트 라벨.
- `onboarding-uiux.md` — 2장 화면 목록에서 O7-a·O7-b·O8·O12 삭제, 3장 흐름도를 O4 → O13 → O9 로, 4.4 절 삭제, 4.5 "0건 경로 전용" → 모든 경로, 5장 인디케이터 `N/2`·스켈레톤 O12 삭제, 7장 추천 카드 접근성, 8장 O7-b 금지 사항, 9장 미결의 O7 카피·와이어프레임·월간 표본 기준값 삭제. 와이어프레임 `onboarding.html` 의 O7·O8·O12 도 삭제 대상.
- `onboarding-api.md` 4.5·4.6 — 엔드포인트는 BE 소유라 그대로 두되 "클라이언트가 호출하지 않는다(2026-10-11)" 를 적는다. 4.7 의 `picked_count` 는 0 고정이라고 덧붙인다.
- `analytics.md` 3.4 — `onboarding_step.step` 값에서 `pick` 삭제. `onboarding_complete.picked_count` 는 0 고정.
- PRD — 온보딩 FR 의 "3단계" 표기를 2단계로.

## 사유

PM 결정(2026-10-11). 첫 사용 튜토리얼 제거(같은 날, `remove-first-run-tutorial.md`)와 같은 방향 — 가입 직후 단계를 줄인다. 첫 드립이 라이브러리를 채우므로 담기 없이도 빈 라이브러리로 떨어지지 않는다(onboarding.md 4 [완료] "담은 수와 무관하게 첫 드립은 실행").

## 완료 조건

- Given 위 문서들 / When "담기"·"O7"·"O8"·"O12"·"3/3"·"recommendations"·"picks" 를 검색한다 / Then 온보딩 진행 흐름 서술에 남아 있지 않다(api 문서의 엔드포인트 정의와 이 요청 문서, archive 는 제외).
- Given `onboarding-uiux.md` 3장 흐름도 / When 읽는다 / Then O4 [다음]·[건너뛰기] → O13 → O9 로 이어진다.

## 처리 기록

- 2026-10-14 반영 — `features/onboarding.md` 3·4·5·6·7·8장·미결(담기 단계 제거, `1/2 · 2/2`, 완료 대기 모든 경로, 재개 → 완료 대기) · `spec/uiux/onboarding-uiux.md` 2·3·4.1~4.6·5·6·7·8·9장(O7-a·O7-b·O8·O12 삭제, 4.4 는 번호 보존을 위해 "삭제" 절로) · `wireframe/onboarding.html`(O7·O8 삭제, 스테퍼 텍스트) · `spec/api/onboarding-api.md` 4.5·4.6(클라이언트 호출 없음)·4.7(`picked_count` 0 고정) · `features/analytics.md` 3.4(`pick` 삭제, `picked_count` 0) · `prd/ear_root_prd.md` 5.1(2단계) · `features/notification.md` 4.1·8장의 "0건 담기 사용자" 서술을 모든 사용자 기준으로. 남긴 것: `onboarding-api.md` 3·6·9장의 BE 소유 서술과 `analytics.md` 완료 조건의 `onboarding_step` 건수(4~5건)는 요청 범위 밖이라 그대로.
