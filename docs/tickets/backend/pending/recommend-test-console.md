# [BE] 추천 테스트 콘솔 — 개발계 테스트 계정에 행동 버튼, 결과 즉시 확인

| 항목 | 값 |
|---|---|
| 요청 파트 | backend (API) + pipeline 웹 (admin 콘솔 탭) |
| 요청자 | 박준현 — 2026-09-29 |
| 담당 | 박준현 |
| 발행 날짜 | 2026-09-29 |
| 시작 날짜 | 2026-09-29 |
| 기한 | 2026-10-02 (Medium — 3일 안) |
| 선행 | 없음(코드). **사람 손 2건**: ① 개발계 앱에서 테스트 계정 가입(`jhp99999998@gmail.com`) — 완료 2026-09-29 ② 개발계 시크릿 `ear/dev/api` 의 `PIPELINE_SSO_SECRET` 채우기 + AI 서버 파이프라인 웹 `env.prod` 에 `EAR_DEV_SSO_SECRET`(같은 값) 추가 후 웹 재배포 — **미완**(아래 처리 기록) |
| Jira | [KAN-115](https://runtime364.atlassian.net/browse/KAN-115) (담당: 박준현) |
| 중요도 | Medium — 배포 전 추천 평가(KAN-108) 의 실험 도구. 마감이 안 맞으면 등급을 내리지 말고 사유를 적는다 |
| 관련 | `tickets/backend/pending/pre-release-recommendation-evaluation.md`(KAN-108) — 이 콘솔이 그 평가의 수동 실험 면이다 · `changes/pending/admin-api-recommend-test.md`(문서 반영) |

## 요청

admin.earcast.co.kr 추천 검증 콘솔에

1. 기존 **편성 미리보기** 탭 이름을 **"편성 미리보기 (실배포)"** 로 — 운영 서버의 실제 사용자·실제 신호를 읽는다는 것을 라벨에서 알 수 있게
2. 새 탭 **"추천 테스트"** — **개발계**에 만든 추천 테스트 전용 계정 하나로, 추천에 영향이 가는 행동(재생·완청·담기·해제·삭제·재청취·관심 주제·커리어)을 전부 버튼으로 두고, 행동 직후 어떤 콘텐츠가 추천되는지(편성 2+1 · 탐색 피드) 바로 본다

**개발계에만 붙인다(결정 2026-09-29).** 행동 버튼이 실제 신호·라이브러리·재생 기록을 쓰므로 운영에 붙이면 추천 신호·인기도·일일 지표(완청 건수)가 오염된다. 편성 미리보기(읽기 전용)가 운영 답을 이미 보여주고, 개발계는 콘텐츠 동기화(KAN-84)로 같은 콘텐츠 풀을 보므로 개발계 결과로 운영 동작을 추론할 수 있다.

## 완료 조건

- Given 개발계 API 에 `RECOMMEND_TEST_EMAIL` 이 설정돼 있고 그 계정이 가입돼 있다 / When 콘솔 "추천 테스트"에서 한 콘텐츠의 [완청]을 누른다 / Then `user_signals` 에 `play`·`complete` 가 그 계정으로 쌓이고, 화면의 편성 미리보기·탐색 피드가 다시 계산돼 직전과의 차이(NEW ▲ ▼)가 표시된다
- Given 운영 API(`SENTRY_ENVIRONMENT=production`) / When `/admin/recommend-test/*` 를 부른다 / Then 이메일 설정 여부와 무관하게 `409 ADMIN_RECOMMEND_TEST_DISABLED` 다
- Given 콘솔 사이드바 / When 추천 검증 콘솔을 연다 / Then "편성 미리보기 (실배포)"와 "추천 테스트"(개발계) 두 탭이 있다
- Given [초기화] / When 확인한다 / Then 그 계정의 신호·재생 기록·라이브러리·취향 캐시·드립 제외가 비고, 관심 주제·커리어는 남는다

## 처리 기록

### 2026-09-29 — 코드 완료(PR 대기), 사람 손 설정 남음

**백엔드** — 새 모듈 `backend/src/modules/recommend-test/`(유스케이스 모듈, Entity 없음)
- `GET account` · `GET feed` · `POST actions` · `PUT interests` · `PUT career` · `POST reset` — 전부 `JwtAuthGuard + AdminRoleGuard`, 대상은 env 의 계정 하나
- 각 행동은 앱의 서비스 메서드를 그대로 부른다. 그러기 위해 export 를 열었다: `ExploreOrchestrator`(explore) · `LibraryScreenOrchestrator`(library-screen) · `PlayService`·`PlaybackProgressService`·`PlaybackSignalService`(playback) · `UserCareerService`(user) · `DripBatchOrchestrator`(drip-batch — "어떤 모듈도 의존하지 않는다"의 유일한 예외, 모듈 주석에 적음)
- `DripBatchOrchestrator.refreshPreferenceCache(userId, now)` 공개 메서드 신설 — 행동 직후 배치와 같은 함수로 취향 캐시 재계산(탐색 피드가 이 캐시를 읽는다)
- env `RECOMMEND_TEST_EMAIL`(선택) · 에러 코드 `ADMIN_RECOMMEND_TEST_DISABLED` · `push.sh` 사전 선언 목록에 키 추가(Secrets 에 넣어도 배포가 안 막히게)
- spec 10건(잠금·행동 경로·초기화 범위) 통과, `tsc`·eslint 통과

**파이프라인 웹**
- `lib/ear.ts` 에 **채널**(`prod`/`dev`) 도입 — 프록시 경로(`/api/ear` vs `/api/ear-dev`)·토큰 저장 키가 채널별. 기존 호출은 전부 기본 `prod` 라 동작 변화 없음
- 프록시·SSO 구현을 `lib/ear-proxy.ts` 로 모으고 `/api/ear-dev/[...path]` · `/api/ear-dev/sso` 추가(env `EAR_DEV_API_BASE_URL` · `EAR_DEV_SSO_SECRET`)
- `/drip-check/test` 페이지 + `components/recommend-test.tsx` — 왼쪽 콘텐츠 목록(행별 6 버튼)·관심 주제 칩·커리어 / 오른쪽 편성 2+1·탐색 피드(직전 대비 NEW ▲ ▼)·취향/신호 요약·행동 로그. `lib/recommend-test-diff.ts`(+테스트 3건)
- 사이드바 라벨: "편성 미리보기 (실배포)" · "추천 테스트"(개발계)

**남은 사람 손 작업(선행 ②)** — 개발계 SSO 가 비어 있어 콘솔이 개발계에 못 붙는다
1. `ear/dev/api` 시크릿에 `PIPELINE_SSO_SECRET=<openssl rand -hex 32>` 와 `RECOMMEND_TEST_EMAIL=jhp99999998@gmail.com` → 다음 dev 배포에서 `.env.prod` 에 반영
2. AI 서버 `/opt/ear/pipeline/deploy/env.prod`(파이프라인 웹) 에 `EAR_DEV_SSO_SECRET=<같은 값>` 추가 → 웹 재배포(dev 머지 시 자동)
3. 개발계 DB 에 팀원 이메일의 `role=admin` 계정이 있어야 SSO 가 통과한다(운영과 별개 DB). 없으면 `UPDATE users SET role='admin' WHERE email='…'`(runbook 3.3)
