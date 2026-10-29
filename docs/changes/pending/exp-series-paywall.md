# paywall · drip-scheduling · notification · recommendation-evaluation — 시리즈 유료화 서버 구현 세부 (BE · KAN-290)

| 항목 | 값 |
|---|---|
| 대상 문서 | `features/paywall.md` 4.1 · `features/drip-scheduling.md` 4.2-3 · `features/notification.md` 4.6("듣던 콘텐츠") · `spec/api/experiments-api.md` 4.2-1·4.2-2 · `backend/recommendation-evaluation.md` 3.3·5.1·6 · `backend/architecture.md` 7장(에러 코드 예시 — 선택) |
| 요청 파트 | 백엔드 — 박준현 |
| 발행 날짜 | 2026-10-30 |
| 시작 날짜 | 2026-10-30 |
| 기한 | 2026-11-02 (Medium — 다음 통합 때, `exp-contracts.md`와 함께) |
| 선행 | 없음 — 계약 자체의 화면 문서 이관은 `changes/pending/exp-contracts.md`가 맡는다. 이 기록은 그 위에 구현이 정한 세부만 더한다 |
| 중요도 | Medium — 서술 추가. 스위치(`SERIES_PAYWALL_ENABLED`)가 꺼져 있으면 동작은 종전과 같다 |
| 관련 | [KAN-290](https://runtime364.atlassian.net/browse/KAN-290) · 브랜치 `feat(be)/series-paywall` · 티켓 `tickets/backend/pending/exp-series-paywall.md` · FE `changes/pending/exp-series-paywall-lock-ui.md`(KAN-294) · 운영 반영 `tickets/backend/pending/exp-prod-rollout-switches.md`(KAN-300) |

## 배경

단기 실험 ⑤(2026-10-29) — 시리즈 4편부터 프로 전용. 계약은 `experiments-api.md` 4.2로 확정됐고 FE는 그 계약으로 나갔다(PR #2158). 서버 구현(KAN-290)에서 계약 문장이 정하지 않은 세부를 정했다 — 통합 때 아래 문서에 옮긴다.

## 고칠 내용

### 1. `features/paywall.md` 4.1 — "열리는 사람"의 판정 근거

> **시리즈 유료화(KAN-290)**: 잠긴 편(`series_id` 있음 · `episode_no > SERIES_FREE_EPISODES`, 기본 3)은 **최상위 유료 요금제**(현재 pro) 또는 가입 체험 중인 사용자만 재생한다. "최상위"는 티어명이 아니라 `plans` 데이터로 판정한다 — 저장 티어(`users.tier`)의 요금제가 유료이고 더 높은 판매 요금제가 없을 때(재생 한도의 페이월/안내 분기 `isTopTier`와 같은 정의). 초대 코드 Pro는 지급 중 `users.tier = pro`로 적히므로 같이 열린다. 데일리 구독자는 잠긴다. 요금제 행이 없으면 라이트 폴백대로 잠긴다(모를 때는 엄격한 쪽).
>
> 재생 게이트(`assertPlayable` — 오디오 URL·재생 시작·대본)의 **첫 단계**다. 한도·재청취 창보다 먼저 보므로 잠긴 편은 차감되지 않고, 한도와 둘 다 해당하면 `SERIES_EPISODE_LOCKED`가 이긴다. `replay` 신호(`player-api.md` 4.4)는 한도 판정이 없지만 잠금만은 같은 함수로 본다.

### 2. `spec/api/experiments-api.md` 4.2-1 · 4.2-2 — 설정 범위와 필드 자리

- 4.2-1: "무료 편수는 서버 설정 하나(`SERIES_FREE_EPISODES`, 기본 3)" 뒤에 **"1~99. 0은 받지 않는다 — 1편(탐험·첫 드립이 주는 시리즈 도입부)은 늘 열려 있다"**를 덧붙인다(부팅 검증 `env.validation.ts`).
- 4.2-2: "붙는 곳" 표의 자리를 구체화한다 — 탐색 목록·관련 콘텐츠·시리즈 편 목록·라이브러리 목록은 **항목의 `content.is_locked`**(콘텐츠 객체 안), 콘텐츠 상세는 **최상위 `is_locked`와 `content.is_locked` 둘 다**(같은 값). FE(PR #2158)가 읽는 자리와 같다.
- 4.2-2: 표에 행 추가 — `GET /users/me/library-items/resume`(미니플레이어 복원) `resume_target.content.is_locked`. 계약 표에는 없지만 미니플레이어도 재생 버튼을 그려 같이 실었다(추가 필드).
- 탐색 **시리즈 카드**(`type: "series"`)에는 싣지 않는다 — 편이 아니라 시리즈 단위 항목이고, 편별 잠금은 시리즈 화면이 준다.

### 3. `features/drip-scheduling.md` 4.2-3 — 시리즈 연속 편

> 시리즈 유료화가 켜져 있으면(KAN-290) 프로·체험이 아닌 사용자에게 잠긴 편은 **후보에서 빠지고, 다음 편 판정(규칙 ②′)에서는 "줄 수 없는 편"**(받은 편·제외 편과 같은 취급)이다. 그래서 3편까지 완청해도 4편이 "다음 편"으로 뽑히지 않고 그 시리즈는 그날 편을 내지 않는다 — 단 **앞쪽 빈 무료 편**(예: 2·3편 완청, 1편 안 받음)은 종전대로 메운다. 탐험·첫 드립은 시리즈 1편만 주므로(무료 편수 ≥ 1) 영향이 없다. 판정 입력(최상위 요금제 여부)은 배치 실행 1회에 티어별로 한 번만 읽는다.

### 4. `features/notification.md` 4.6 — 리텐션 "듣던 콘텐츠"

> "듣던 콘텐츠" 후보에서 이 사용자에게 잠긴 편을 뺀다(KAN-290 — 그다음 최근에 들은 열린 편이 있으면 그 편). 판정은 같은 규칙의 SQL판(`series-paywall.policy.ts` `seriesEpisodeUnlockedSql`)이다.

### 5. `backend/recommendation-evaluation.md` — 불변식 9 · 옵션 · 합성 카탈로그

- 5.1에 추가: **9. 시리즈 유료화가 켜져 있으면 무료 편수 뒤 편은 최상위 요금제가 아닌 사용자에게 정규·탐험으로 가지 않는다(KAN-290).** 판정은 편성 계산이 쓴 접근을 믿지 않고 사용자 티어로 다시 한다(평가 세계는 체험을 두지 않고 최상위 요금제를 pro로 본다).
- 불변식 4(시리즈 순서)는 문장을 바꾸지 않는다 — 입력인 `RegularPlan.seriesEpisodesBySeries`에 잠긴 편이 "제외"로 표시돼 들어가므로, 같은 `pickSeriesEpisode`로 다시 고르면 편성과 같은 답이다.
- 6 옵션에 추가: `--series-paywall`(시리즈 유료화 스위치를 켠 것으로 평가 — **기본은 끔**, 운영 스위치가 꺼진 동안은 운영과 같은 조건). 기준선과 이 옵션이 다르면 자동 확장과 같이 지표를 비교하지 않고 불합격이다.
- 3.3 합성 카탈로그: "3부작 시리즈 하나" → **"5부작 시리즈 하나"**(4편부터 잠금이 실제로 갈리는 길이). 페르소나 `series-follower`에 검사 추가 — 켜면 "3편 완청 뒤 4편을 받지 않는다", 끄면 "4편까지 이어 받는다"(켠 평가의 불변식이 헛돌지 않는다는 증거). CI(`eval-runner.spec.ts`)가 두 조건을 다 돌린다.

### 6. (선택) `backend/architecture.md` 7장 — `BusinessForbiddenException` 예시

> `# 예: PLAY_LIMIT_EXCEEDED, CONTENT_WITHDRAWN, SERIES_EPISODE_LOCKED`

## 완료 조건

- Given `features/paywall.md` 4.1 / When 시리즈 잠금 판정을 본다 / Then "최상위 유료 요금제(plans 데이터) 또는 체험 중"·초대 코드 Pro 포함·데일리 잠김·한도보다 먼저·차감 없음·replay 포함이 적혀 있다
- Given `experiments-api.md` 4.2(또는 이관된 화면 문서) / When `is_locked` 자리와 `SERIES_FREE_EPISODES` 범위를 본다 / Then `content.is_locked`(상세는 최상위와 둘 다)·미니플레이어 복원·시리즈 카드 제외·1~99가 적혀 있다
- Given `features/drip-scheduling.md` 4.2-3 / When 시리즈 연속 편 규칙을 본다 / Then 잠긴 편이 후보·다음 편 판정에서 빠지고 앞쪽 빈 무료 편은 메운다고 적혀 있다
- Given `features/notification.md` 4.6 / When "듣던 콘텐츠"를 본다 / Then 잠긴 편을 고르지 않는다고 적혀 있다
- Given `backend/recommendation-evaluation.md` / When 5.1·6·3.3을 본다 / Then 불변식 9·`--series-paywall`·5부작 합성 시리즈가 있다

## 처리 기록

- 2026-10-30 발행(BE — 구현과 같은 PR).
