# drip-scheduling — 첫 드립 주제 안 무작위 실험 스위치(`FIRST_DRIP_RANDOM_ENABLED`) (BE · KAN-291)

| 항목 | 값 |
|---|---|
| 대상 문서 | `features/drip-scheduling.md` 4.4 콜드스타트(첫 드립 서술) · `backend/recommendation-evaluation.md` 7장 체크리스트 |
| 요청 파트 | 백엔드 — 박준현 |
| 발행 날짜 | 2026-10-29 |
| 반영 날짜 | 2026-10-30 |
| 시작 날짜 | 2026-10-29 |
| 기한 | 2026-11-01 (Medium — 다음 통합 때) |
| 선행 | 없음 |
| 중요도 | Medium — 서술 추가. 스위치가 꺼져 있으면 동작은 종전과 같다 |
| 관련 | [KAN-291](https://runtime364.atlassian.net/browse/KAN-291) · 브랜치 `feat(be)/exp-first-drip-random` · 티켓 `tickets/backend/archive/exp-first-drip-random.md` |

## 배경

첫 드립(온보딩 완료 직후 편성)은 콜드스타트 스코어링(인기·신선도 비중 큼)과 다양성 선정으로 고른다. 같은 주제를 고른 신규 가입자가 비슷한 인기 편을 받아 다른 콘텐츠의 지표가 쌓이지 않는다. 단기 실험 ⑥(2026-10-29 확정)으로 주제 안 무작위 선정을 서버 스위치 뒤에 넣었다.

## 고칠 내용

### 1. `features/drip-scheduling.md` 4.4 콜드스타트 — 첫 드립 항목 추가

> **첫 드립 무작위 실험(KAN-291, 2026-10-29 — 서버 스위치 `FIRST_DRIP_RANDOM_ENABLED`, `true`를 명시했을 때만 켜짐, 기본 꺼짐)**: 켜면 온보딩 첫 드립만 스코어링 대신 **관심 주제 안 무작위**로 고른다.
> - 후보 필터는 그대로다 — 시장, 시리즈는 1편만(`episode_no IS NULL OR = 1`), 이미 본 것·드립 제외 목록 제외, 노출 기간·회수 제외. 후보 풀(상한 300)은 인기순이 아니라 **무작위로 자른다** — 카탈로그가 상한을 넘어도 인기 하위 편이 후보에서 빠지지 않게 한다.
> - 선정: 사용자의 관심 주제 순서를 섞고 **주제를 돌아가며 한 편씩**, 그 주제에 걸린 후보 중 무작위로 고른다. 주제가 여럿이면 한 주제에서 편수를 다 채우지 않는다. 어느 주제에도 남은 후보가 없을 때만 나머지 후보에서 무작위로 채운다.
> - 관심 주제 안에서 편수를 못 채우면 **인기 대체 편성은 종전 그대로**(인기순, 시리즈 1편만)다.
> - 정규 편성(2일차 이후)·탐험 편은 바뀌지 않는다. 끄면 종전과 같다.

### 2. `backend/recommendation-evaluation.md` 7장 체크리스트 — 수동 확인 줄 추가

> - [ ] **첫 드립을 바꾸는 PR**(배포 전 평가기는 첫 드립을 시뮬레이션하지 않는다): 개발계에서 같은 관심 주제로 신규 계정 2~3개를 가입시켜 첫 드립 편을 비교한다(무작위 실험 `FIRST_DRIP_RANDOM_ENABLED`처럼 의도가 "사람마다 달라야 함"이면 서로 달라야 하고, 시리즈는 1편만이어야 한다).

### 3. `DRIP_ALGORITHM_VERSION`을 올리지 않은 근거 — 4.4 또는 `drip-feedback.md` 4.4 옆에 한 줄

> 첫 드립 적립분은 `library_items.algorithm_version`을 남기지 않는다(NULL). 버전은 정규·탐험 편성분의 별점을 가르는 값이므로, 첫 드립만 바꾸는 이 실험은 버전을 올리지 않았다(올리면 바뀌지 않은 정규 편성의 별점이 두 버전으로 갈린다). 첫 드립 무작위 그룹의 별점·완청을 따로 보려면 첫 드립 적립분에 별도 표시가 필요하다 — 실험 지표 정리(아직 티켓 없음)에서 정한다.

## 완료 조건

- Given `features/drip-scheduling.md` 4.4 / When 첫 드립 서술을 본다 / Then `FIRST_DRIP_RANDOM_ENABLED` 스위치·기본 꺼짐·주제 순환 무작위 규칙·무작위 풀 자르기·인기 대체 편성 유지가 적혀 있다
- Given `backend/recommendation-evaluation.md` 7장 / When 체크리스트를 본다 / Then 첫 드립 변경 PR의 개발계 수동 확인 줄이 있다
- Given 버전 규칙 서술 / When 첫 드립만 바꾸는 변경을 본다 / Then `DRIP_ALGORITHM_VERSION`을 올리지 않는 근거(첫 드립 적립분은 버전 NULL)가 적혀 있다

## 처리 기록

- 2026-10-29 발행(BE — 구현과 같은 PR).
- 2026-10-30 반영 — 1 `features/drip-scheduling.md` 4.4 콜드스타트에 "첫 드립 무작위 실험" 항목(스위치 · 기본 꺼짐 · 무작위 풀 자르기 · 주제 순환 · 인기 대체 유지 · 정규/탐험 불변), 2 `backend/recommendation-evaluation.md` 7장 체크리스트에 첫 드립 변경 PR의 개발계 수동 확인 줄, 3 `DRIP_ALGORITHM_VERSION`을 올리지 않은 근거는 같은 4.4 항목 끝에 적었다(`drip-feedback.md`는 고치지 않음).
