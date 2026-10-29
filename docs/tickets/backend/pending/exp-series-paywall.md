# [BE] 단기 실험 ⑤ 시리즈 유료화 — 4편부터 프로 전용(재생 게이트·잠금 필드·드립)

| 항목 | 값 |
|---|---|
| 대상 | `PlayPolicyService.assertPlayable` · 탐색·시리즈·콘텐츠 상세·라이브러리 DTO · 드립 시리즈 연속 편 · 리텐션 듣던 콘텐츠 |
| 요청 파트 | 백엔드 |
| 요청자 | 박준현(테크리드) |
| 담당 | 박준현 |
| Jira | [KAN-290](https://runtime364.atlassian.net/browse/KAN-290) |
| 발행 날짜 | 2026-10-29 |
| 시작 날짜 | 2026-10-29 |
| 기한 | 2026-10-29 (High — 발행 당일) |
| 선행 | 없음 — **후행: KAN-294(FE 잠금 UI)가 이 티켓의 API 명세에 막혀 있다. 명세를 먼저 낸다** |
| 근거 문서 | `features/paywall.md` 4.1 · `features/drip-scheduling.md` 4.2 · `spec/api` player·explore·library · `backend/domain.md` 5.9 |
| 중요도 | High |
| 상태 | 발행 |

> 단기 실험 8종(2026-10-29 확정) 중 하나다. A/B 그룹별 지표를 어드민 "실험 지표" 탭에서 보는 일은 실험 전체에 걸친 별도 정리 대상이다(아직 티켓 없음).

## 왜

시리즈를 프로 구매 동기로 쓴다. 1~3편은 누구나, 4편부터는 프로만 듣는다. 재생 판정은 서버가 하고 앱은 서버가 준 잠금 표시만 그린다(티어명 하드코딩 금지).

## 무엇을 한다

- **1단계 API 명세**: 새 에러 코드(재생 거절), 응답 잠금 필드(예: `is_locked` — 티어명이 아닌 플래그) → `spec/api` 확정 후 FE에 알린다.
- 재생 게이트(`assertPlayable` — 재생 시작·오디오 URL·대본 공통)에 시리즈 편 판정. 유효 티어는 `resolveEffectiveTier`(초대 코드 Pro 포함).
- 탐색·시리즈 상세·콘텐츠 상세·라이브러리 응답에 잠금 필드.
- 드립 시리즈 연속 편(`pickSeriesEpisode`)과 리텐션 "듣던 콘텐츠"가 잠긴 편을 비프로에게 주지 않게.
- 추천 평가 불변식(시리즈 순서) 갱신, `recommendation-evaluation.md` 7장 체크리스트.
- 문서 수정은 `changes/pending`에 기록.

## 결정 (2026-10-29)

- 체험(trial) 사용자도 4편 이후를 듣는다 — 유효 티어 pro 또는 trial이면 허용.
- 이미 4편 이후를 듣던 비프로 사용자도 4편부터 잠근다(예외 없음 — 무료 기한 후 계속 듣는 사용자가 거의 없다).
- 모든 시리즈(글로벌 포함)가 대상, 4편부터 유료. 저장된 `series_id`·`episode_no`로 판정.
- 무료 편수 3은 설정값 하나 — 시리즈별 컬럼 없음(DB 변경 없음).
- 구버전 앱 대응은 불필요 — 운영 최소 지원 버전이 1.3.0(KAN-229).

## 범위 밖

- 앱 표시(KAN-294).
- 시리즈 제작 규칙(KAN-297 선택 항목).

## 완료 조건

- Given 비프로 사용자 / When 시리즈 4편 재생을 요청 / Then 새 에러 코드로 거절되고 차감되지 않는다
- Given 프로 사용자(초대 코드 Pro 포함) / Then 4편 이후도 재생된다
- Given 비프로 사용자가 3편을 완청 / When 다음 편성 / Then 4편이 드립으로 오지 않는다
- Given 시리즈 목록 응답 / Then 4편 이후 편에 잠금 필드가 사용자 티어에 맞게 실린다

## 처리 기록

- 2026-10-29 발행(마크다운 + Jira KAN-290).
- 2026-10-29 결정 반영(Jira 댓글).
- 2026-10-30 서버 구현(브랜치 `feat(be)/series-paywall`, PR: PR_URL_PLACEHOLDER). **pending 유지** — 개발계 확인(스위치 켜고 무료·프로 계정으로 시리즈 화면·재생·다음 날 드립)이 남았다. 운영 스위치는 KAN-300 표.
  - 판정 한 곳: `subscription/policies/series-paywall.policy.ts`(규칙·SQL판) + `SeriesPaywallService`(설정·요금제). "열리는 사람" = 저장 티어가 **최상위 유료 요금제**(`plans` 데이터의 `isTopTier` — 현재 pro, 초대 코드 Pro 포함) 또는 가입 체험 중. 데일리는 잠긴다. 스위치 `SERIES_PAYWALL_ENABLED`(true 명시만) · `SERIES_FREE_EPISODES`(1~99, 비우면 3).
  - 재생 게이트: `PlayPolicyService.assertPlayable`의 첫 단계(한도·재청취 창보다 먼저 → 차감 없음, 한도와 겹치면 잠금이 이김). 오디오 URL·재생 시작·대본이 공유하고, `replay`(한도 판정 없음)는 같은 `assertSeriesEpisodeUnlocked`를 부른다. 403 `SERIES_EPISODE_LOCKED`(retryable false, "이 편은 프로 구독에서 들을 수 있어요").
  - `is_locked`: 탐색 피드·주제·인기·검색·관련(`content.is_locked`) · `GET /series/:id` 편(`content.is_locked`) · `GET /contents/:id`(최상위 + `content`) · 라이브러리 목록·미니플레이어 복원(`content.is_locked`). 요청당 한 번 판정(`PlayPolicyService.resolveSeriesAccess`) 후 편마다 비교.
  - 드립: 정규 편성 후보에서 잠긴 편을 빼고 다음 편 판정에서 "줄 수 없는 편"으로 표시(`lockSeriesEpisodes`) — 3편 완청 뒤 4편 안 감, 앞쪽 빈 무료 편은 메움. 리텐션 "듣던 콘텐츠" SQL에 같은 규칙.
  - 추천 평가: 불변식 `series-paywall` 추가, `--series-paywall` 옵션(기본 끔), 합성 시리즈 3→5부작, `series-follower` 검사 추가. `npm run eval:recommend` 끔·켬 둘 다 통과(합성 카탈로그 — 실사용자 스냅샷은 로컬에 없어 미실행).
  - 문서 세부는 `changes/pending/exp-series-paywall.md`.
