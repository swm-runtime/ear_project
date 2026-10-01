# [문서] 추천 테스트 콘솔(개발계 전용) — `admin.md` 4.7 신설 · `admin-api.md` 4.17 등재 · `drip-scheduling.md` 4.3 예외 명시

| 항목 | 값 |
|---|---|
| 대상 문서 | `features/admin.md` 4장(4.7 신설) · `spec/api/admin-api.md` 3장 목록·4장 상세·5장 에러 표 · `features/drip-scheduling.md` 4.3 |
| 요청 파트 | 문서(구현은 `tickets/backend/pending/recommend-test-console.md` PR 에서 선반영) |
| 발행 날짜 | 2026-09-29 |
| 발견 시점 | admin 콘솔 "추천 검증"에 **추천 테스트** 탭을 만들며 — 편성 미리보기(4.16)는 읽기 전용이라 "이 행동을 하면 추천이 어떻게 바뀌나"를 실험할 수 없었다. 폰으로 행동을 넣고 새로고침하는 방식은 한 번에 몇 분씩 걸리고, 운영 계정의 신호를 오염시킨다 |
| 심각도 | 중 — 쓰기 있는 관리자 엔드포인트가 새로 생기고, "취향 캐시는 배치만 갱신한다"(drip-scheduling 4.3)에 명시적 예외가 붙는다 |

## 수정 내용

### 1. `features/admin.md` — 4.7 "추천 테스트 (개발계 전용)" 신설

- 목적: 추천에 영향을 주는 행동(재생·완청·담기·해제·삭제·재청취·관심 주제·커리어)을 **테스트 계정 한 명**에 대신 수행하고, 직후 편성 미리보기(2+1)와 탐색 피드의 변화를 본다
- 대상 계정은 서버 env `RECOMMEND_TEST_EMAIL` 하나로 고정한다. **요청이 사용자를 고르지 않는다** — 이메일을 받으면 관리자가 임의 사용자의 라이브러리를 조작하는 도구가 된다
- **운영에서는 꺼진다.** `SENTRY_ENVIRONMENT=production` 이면 이메일이 있어도 409 다. 행동이 실제 `user_signals`·`library_items`·`play_records`·`content_stats` 를 쓰기 때문이다 — 편성 미리보기(4.16)가 운영에 붙을 수 있었던 이유(읽기 전용)가 여기는 성립하지 않는다
- 각 행동은 **앱이 부르는 것과 같은 서비스 경로**를 탄다(`PlayService.startPlay` · `PlaybackProgressService.saveProgress` · `ExploreOrchestrator.saveContent/unsaveContent` · `LibraryScreenOrchestrator.deleteItem` · `PlaybackSignalService.recordReplay` · `UserInterestService.replaceManagedSelection` · `UserCareerService.replaceCareer`). 신호를 직접 적재하는 지름길을 두지 않는다
  - `play` — 라이브러리에 없으면 탐색 재생과 같이 `auto_play` 자동 적립 후 재생 시작. **오늘 한도가 차감된다**(테스트 계정 티어 기준). 한도에 막히면 그 에러가 그대로 보인다
  - `complete` — `play` 후 위치를 길이 끝까지 저장 → 완청 판정(90%) → `complete` 신호. 길이 0 콘텐츠는 수동 완료 경로(`library-api` 4.5)
  - `replay` — 완료 상태가 아니면 앱과 같이 무시(신호 없음)
- **행동 직후 신호 파생 상태를 다시 계산해 저장한다**(`DripBatchOrchestrator.refreshDerivedState` — 배치와 같은 함수. 2026-09-30 개명·확장): ① 취향 캐시 — 탐색 피드가 이 캐시를 읽으므로, 이것 없이는 피드가 다음 배치까지 안 바뀐다 ② 자동 확장 슬롯(`drip-scheduling.md` 4.5-1) — 관심 밖 주제를 2편 완청하면 그 자리에서 관심 주제가 붙는다. 응답 `effects[]`에 `자동 확장 add (slot_free)` 같은 줄이 실린다
- 초기화: 신호·재생 기록·위치·오디오 발급 로그·원문 클릭·라이브러리(삭제분 포함)·취향 캐시·드립 영구 제외·첫 드립 작업·**자동 확장으로 붙은 관심 주제**(`source = auto_expand` — 행동에서 파생된 것이라 행동과 함께 지운다, 추가 2026-09-30)를 지운다. **직접 고른 관심 주제·커리어·계정은 남긴다**(버튼으로 바꾸는 입력이다). `content_stats` 집계는 다음 집계에서 원천(`play_records`)을 다시 읽어 맞춰진다
- 콘솔: 파이프라인 웹 `/drip-check/test`. 편성 미리보기 탭은 **"편성 미리보기 (실배포)"** 로 라벨을 바꿔 운영 서버를 본다는 것을 드러낸다. 웹 서버는 개발계 채널(`EAR_DEV_API_BASE_URL` · `EAR_DEV_SSO_SECRET`, 프록시 `/api/ear-dev/*`)을 따로 갖는다 — 두 서버의 JWT·SSO 비밀은 다르다

### 2. `spec/api/admin-api.md` — 3장 목록 + 4.17 상세 + 5장 에러 코드

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/admin/recommend-test/account` | 테스트 계정 상태 — `environment` `user{id,email,nickname,tier,onboarding_completed,job_category,job_title,years_of_experience}` `interests[]{topic_id,name,source}` `library[]{item_id,content_id,title,source,status,added_at,completed_at}` (4.17) |
| GET | `/admin/recommend-test/feed` | 테스트 계정의 탐색 피드 — `explore-api.md` 4.1 과 같은 본문 |
| POST | `/admin/recommend-test/actions` | `{ action: play\|complete\|save\|unsave\|delete\|replay, content_id }` → 200 `{ action, content_id, performed_at, effects[], preference_rebuilt }` |
| PUT | `/admin/recommend-test/interests` | `{ topic_ids[] }` → 204 (`interest-management-api` 전체 교체와 같은 본문) |
| PUT | `/admin/recommend-test/career` | `{ job_category, job_title, years_of_experience }` → 204 (`career-api` 와 같은 본문) |
| POST | `/admin/recommend-test/reset` | 소비 이력 전부 삭제 → 204 |

- 인증: 다른 `/admin/*` 과 같다(JWT + 관리자 역할). 응답은 `Cache-Control: no-store`
- 추천 결과(편성분·점수·신호·취향)는 새 엔드포인트가 아니라 **4.16 `GET /admin/drip/preview?email=<테스트 계정>`** 을 개발계에 그대로 부른다
- 에러: `409 ADMIN_RECOMMEND_TEST_DISABLED` — 운영 환경이거나 `RECOMMEND_TEST_EMAIL` 미설정. `404 NOT_FOUND` — 테스트 계정이 이 서버에 가입돼 있지 않음 / `delete` 대상이 라이브러리에 없음. 행동 자체의 에러(`PLAY_LIMIT_EXCEEDED` `CONTENT_WITHDRAWN` 등)는 앱과 같은 코드가 그대로 나온다

### 3. `features/drip-scheduling.md` 4.3 — "실시간 재계산은 하지 않는다"에 예외 한 줄

> 예외(2026-09-29): 추천 테스트 콘솔(`admin.md` 4.7, 개발계 전용)은 행동 직후 같은 함수로 캐시를 재계산한다. 제품 경로에는 실시간 재계산이 없다.

## 완료 조건

- Given `admin.md` 4장 / When 목차를 본다 / Then 4.7 "추천 테스트 (개발계 전용)"이 있고 운영 잠금 규칙·대상 계정 고정·앱과 같은 경로 원칙이 적혀 있다
- Given `admin-api.md` 3장 / When 목록을 본다 / Then `/admin/recommend-test/*` 6 개가 있고 4.17 에 요청·응답·에러가 있다
- Given `admin-api.md` 5장 / When 에러 표를 본다 / Then `ADMIN_RECOMMEND_TEST_DISABLED` 409 가 있다
- Given `drip-scheduling.md` 4.3 / When "실시간 재계산" 문장을 본다 / Then 추천 테스트 콘솔 예외가 명시돼 있다

## 처리 기록

- 반영 날짜: 2026-10-01
- `features/admin.md` 4.7 "추천 테스트 (개발계 전용)" 신설 · `features/drip-scheduling.md` 4.3 "실시간 재계산" 문장에 예외(2026-09-29) 명시
- `spec/api/admin-api.md` — 1장 범위, 3장 목록(`/admin/recommend-test/*` 6개), 4.17 상세(요청·응답·오류), 5장 에러 표(`ADMIN_RECOMMEND_TEST_DISABLED` 409 · `NOT_FOUND` 404)
- 코드 대조로 더한 것: 초기화가 지우는 대상에 편성 별점(`drip_feedbacks`)이 있다(요청서에는 없고 `RecommendTestService.reset`에는 있다 — KAN-116이 뒤에 들어왔다)
