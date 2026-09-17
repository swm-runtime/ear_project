# [문서] 노출 가능 콘텐츠가 0건인 주제는 노출되지 않는다 — 켜기 거부 + 자동 숨김

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/features/admin.md` 4.5·7·완료 조건 · `docs/spec/api/admin-api.md` 4.1·4.3·5장 · `docs/features/common-error-handling.md` 9.10 · `docs/backend/domain.md` 4.1 · `docs/features/interest-management.md` 4.1·6 · `docs/features/onboarding.md` 3 · `docs/spec/api/interest-management-api.md` · `docs/prd/ear_root_prd.md` FR-38·7 |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-09-17 |
| 반영 날짜 | 2026-09-17 (같은 PR에서 반영 — KAN-58) |
| 발견 시점 | KAN-58(`tickets/backend/archive/topic-visibility-requires-content.md`) 구현 · 검증 에이전트 교차 검토 |
| 심각도 | 하 — 지금 증상 없음. PRD 8.1 "0건 주제 선택 불가"를 서버가 보증하게 만드는 예방 조치 |

## 문제

`admin.md` 4.5(구현 확인 2026-08-30)는 **0건 주제의 노출 켜기를 서버가 거부하지 않고 콘솔 확인창만 띄운다**고 정했다. 그 결과 두 경로로 "고를 수는 있는데 볼 게 없는 주제"가 생긴다.

1. 관리자가 확인창을 넘기고 0건 주제를 켠다.
2. 노출 중이던 주제의 콘텐츠가 **회수·라이선스 만료·재발행 주제 교체**로 전부 빠진다. `is_visible`은 "시스템이 자동으로 내리지 않는다"(`domain.md` 4.1)이므로 그대로 노출된다.

또 "콘텐츠는 0건인데 사용자는 골라둔 주제"는 삭제 시 `user_interests` FK에 걸려 500이 된다(티켓 "배경").

## 수정 내용

**"0건"의 정의 — 노출 가능 콘텐츠(`published` + 라이선스 미만료, 탐색·재생과 같은 노출 조건) 기준이다.** 회수·만료분은 앱에서 보이지 않으므로 세지 않는다. 주제 **삭제** 판정은 종전대로 원시 연결(`content_topics`) 건수다 — FK 보호가 목적이라 회수된 콘텐츠의 연결도 막아야 한다.

1. **켜기 거부** — `PATCH /admin/topics/:id`의 `is_visible` false → true 전이에서 노출 가능 콘텐츠가 0건이면 409 `ADMIN_TOPIC_HAS_NO_CONTENTS`(`content_count: 0`). 이미 노출 중인 주제의 이름·정렬 수정과 끄기는 건수와 무관하게 통과한다.
2. **자동 숨김** — 노출 중인 주제의 노출 가능 콘텐츠가 0건이 되면 **서버가 `is_visible = false`로 내린다.** 판정 시점:
   - 콘텐츠 회수 직후(같은 트랜잭션, 그 콘텐츠의 주제)
   - 재발행으로 주제를 교체한 직후(같은 트랜잭션, 교체 **전** 주제)
   - 매일 04:15 KST 일일 판정(노출 중인 전 주제 — 라이선스 만료분과 규칙 이전에 켜진 0건 주제를 함께 정리. 만료 배치 04:10 뒤)
   - 판정 전에 주제 행을 잠근다 — 노출 켜기와 마지막 콘텐츠 회수, 마지막 두 콘텐츠의 동시 회수가 서로의 커밋 전 상태를 보고 모두 통과하는 것을 막는다
   - 감사 로그 `topic.auto_hide`(`after.trigger` = `withdraw` · `republish` · `daily_sweep`, 배치는 `actor = system`)
3. **자동으로 올리지는 않는다.** 콘텐츠가 다시 생겨도(복구·재발행) 관리자가 켠다 — 발행 직후 노출할지는 사람이 정한다.
4. **숨긴 주제는 종전 규칙대로 사용자 관심사에서 빠진다**(`interest-management.md` 7 — 결정 2026-08-11, 변경 없음). 자동 숨김도 관리자 숨김과 같은 기준이다.
5. 관리자 주제 목록(`GET /admin/topics`)에 `visible_content_count`를 추가한다. 콘솔은 숨김 + 0건 주제의 노출 체크박스를 비활성으로 그리고 사유를 표시한다(종전 `confirm` 제거).

**2026-08-30 결정("서버가 막으면 발행 직전 준비 운영이 곤란하다")을 번복하는 사유** — 콘텐츠 업로드는 숨김 주제에도 배정할 수 있으므로(`admin-api.md` 5장 `ADMIN_TOPIC_NOT_FOUND` — "숨김 주제는 허용된다") **"콘텐츠 발행 → 주제 노출"** 순서가 콘솔에서 항상 성립한다. 0건인 채로 켜야 하는 운영이 남지 않는다.

**"시스템이 `is_visible`을 바꾸지 않는다"를 고치는 사유** — 갱신 주체를 한 곳으로 고정한 목적은 값 어긋남 방지였다. 자동 숨김은 **한 방향(내리기)만, 한 규칙(노출 가능 0건)으로, 한 서비스(admin 모듈 `TopicExposureService`)에서만** 일어나므로 같은 목적을 지킨다. 올리기는 여전히 관리자만 한다.

## 반영 위치

| 문서 | 반영 |
|---|---|
| `features/admin.md` | 4.5 "관리자만 바꾼다" → 켜기는 관리자만 + 0건 자동 숨김 예외 · 확인창 항목 → 서버 409 + 자동 숨김 + 0건 정의 · 건수 두 종류 / 7 자동 숨김과 드립 편성 / 8 완료 조건(확인창 → 409, 자동 숨김 3경로·동시 회수) |
| `spec/api/admin-api.md` | 4.1 `visible_content_count` · 4.3 409 · 5장 에러 표 |
| `features/common-error-handling.md` 9.10 | `ADMIN_TOPIC_HAS_NO_CONTENTS` 등재 |
| `backend/domain.md` 4.1 | `is_visible` 변경 주체 · 0건 정의 · "선택 사용자가 있는 주제는 숨기지 않는다"의 예외 |
| `features/interest-management.md` | 4.1 "시스템이 자동으로 바꾸지 않는다" → 자동 숨김 예외 · 6 표 |
| `features/onboarding.md` 3 · `spec/api/interest-management-api.md` · `prd/ear_root_prd.md` FR-38·7 | "관리자만 변경" · "관리자가 판단해 숨긴다" → 서버 거부 + 자동 숨김 |

**모듈 배치** — 자동 숨김은 content · interest · partner 를 함께 쓰는 판정이라 **admin 모듈**(이미 셋을 조합하는 유스케이스 모듈)에 둔다. content 에 두면 `content → partner`가 생겨 `domain.md` 2장의 `partner → content`와 순환이 예정되므로 피했다. 그래서 `architecture.md` 4.5 의존 표는 바뀌지 않는다.

## 완료 조건

- Given `admin.md` 4.5 / When 읽는다 / Then 0건 주제 켜기를 서버가 409로 거부하고, 노출 중 0건이 되면 서버가 숨긴다고 적혀 있으며 번복 사유가 이 문서를 가리킨다
- Given `admin-api.md` 4.3·5장과 `common-error-handling.md` 9.10 / When 에러 코드를 찾는다 / Then `ADMIN_TOPIC_HAS_NO_CONTENTS`(409, retryable=false)가 두 곳에 같은 뜻으로 있다
- Given `domain.md` 4.1 · `interest-management.md` 4.1 / When `is_visible` 변경 주체를 읽는다 / Then "자동으로 내리지 않는다"가 남아 있지 않고 0건 자동 숨김 예외가 적혀 있다
- Given `onboarding.md` 3 · `interest-management-api.md` · PRD FR-38 / When 주제 노출 변경 주체를 읽는다 / Then "관리자만 변경"·"관리자가 판단해 숨긴다"가 남아 있지 않다
- Given `admin.md` 8 완료 조건 / When 0건 주제 노출 켜기 항목을 읽는다 / Then 확인창이 아니라 409 거부이고, 자동 숨김 3경로와 동시 회수 조건이 있다
