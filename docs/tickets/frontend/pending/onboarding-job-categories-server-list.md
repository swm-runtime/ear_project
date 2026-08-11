# [FE] 온보딩 2단계 — 직군 선택지를 클라이언트 상수에서 서버 목록으로 전환

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/features/onboarding/onboarding.copy.ts`(`JOB_CATEGORY_OPTIONS` 상수 제거) · 온보딩 2단계 직군 시트(`useCareerScreen.ts` 계열) · 신설될 커리어 정보 화면(`features/career` — 구현 시 처음부터 서버 목록 사용) |
| 요청 파트 | 백엔드 |
| 발견 시점 | 2026-08-11 커리어 백엔드 구현 (`feat(be)/career`) — `GET /job-categories` 신설 시점 |
| 근거 문서 | `spec/api/career-api.md` 4.3(목록 계약 소유 — **온보딩 2단계와 커리어 정보 화면이 같은 목록을 쓴다, 클라이언트 상수 금지**, 확정 2026-08-10) · `onboarding-api.md` 4.4(공용 참조) · `features/career.md` 4.1 |
| 심각도 | **중** — 지금은 서버 상수가 FE 상수와 같은 값으로 시작해 동작이 어긋나지 않는다. 다만 목록이 한쪽만 바뀌는 순간, 온보딩에서 고른 직군이 커리어 저장(PUT)의 목록 소속 검증(`CAREER_JOB_CATEGORY_UNAVAILABLE`)에 걸린다 |
| 상태 | pending |

## 배경

커리어 백엔드 구현으로 `GET /job-categories`가 생겼다(인증 필요, 응답 `{ items: [{ name }] }`, 배열 순서 = 노출 순서). 서버 상수의 시작 값은 **FE 온보딩이 현재 노출 중인 7종 그대로**다(개발 · 기획 · 디자인 · 마케팅·영업 · 운영·CS · 연구·교육 · 기타) — 기존 사용자가 온보딩에서 이미 저장한 값이 커리어 재저장 검증에 걸리지 않게 하기 위해서다.

FE 온보딩은 아직 클라이언트 상수를 쓴다 — `onboarding.copy.ts`의 `JOB_CATEGORY_OPTIONS`에 "TODO(카피 미확정): 직군 선택지" 주석이 붙어 있는 그 값이다. 계약(2026-08-10 확정)은 클라이언트 상수를 금지한다.

## 요청 내용

1. **온보딩 2단계 직군 시트의 선택지를 `GET /job-categories` 응답으로 교체한다.** `JOB_CATEGORY_OPTIONS` 상수는 제거한다(두 벌이 남으면 한쪽만 바뀌는 순간 값 체계가 갈라진다).
2. 배열 순서를 그대로 그린다 — 정렬은 서버가 소유한다(`career-api.md` 4.3).
3. **[선택 안 함] 행은 화면이 그린다.** 서버 목록에 없다 — 비움은 값이 아니라 `null`이다.
4. 커리어 정보 화면(`features/career`)을 구현할 때도 같은 엔드포인트를 쓴다 — 이 티켓과 같은 fetch·query key를 공유하면 두 화면의 선택지가 어긋날 수 없다(interest의 주제 목록 공용화와 같은 패턴).
5. 조회 실패 시 온보딩 2단계는 전부 선택 입력이라 [건너뛰기]는 막히지 않는다 — 시트만 에러 + [다시 시도] 처리하면 된다(구체 표현은 FE 판단).

## 완료 조건

- Given 온보딩 2단계 직군 시트 / When 시트를 연다 / Then 선택지가 `GET /job-categories` 응답과 같고, 같은 순서로 노출된다
- Given `frontend/src` 전체 / When `JOB_CATEGORY_OPTIONS`를 검색한다 / Then 클라이언트 상수 정의가 남아 있지 않다
- Given 서버 목록에서 고른 직군으로 온보딩을 완료한 사용자 / When 커리어 정보 화면에서 다른 필드만 고쳐 저장한다 / Then 목록 소속 검증(`CAREER_JOB_CATEGORY_UNAVAILABLE`)에 걸리지 않는다
