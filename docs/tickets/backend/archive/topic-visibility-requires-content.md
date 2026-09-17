# [BE] 콘텐츠 0건인 주제는 노출(`is_visible = true`)을 켤 수 없게 서버가 거부한다

| 항목 | 값 |
|---|---|
| 대상 | `backend/src/modules/admin/services/admin-topic.service.ts`(`update`) · `backend/src/modules/interest/services/topic.service.ts` · 관리자 콘솔 `pipeline/apps/web/app/publish/topics/page.tsx` · `spec/api/admin-api.md` 4.3 · `features/admin.md` 4.5 |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-09-15 |
| 발견 시점 | 백엔드 전체 검증(`refactor(be)/full-audit`) — 주제 삭제 경로의 FK 위반(아래 "배경")을 검토하다 사용자가 방향을 정함 |
| 근거 문서 | `prd/ear_root_prd.md` 8.1("0건 주제 선택 불가") · `features/onboarding.md` 3장 · `features/admin.md` 4.5 · `backend/domain.md` 4.1 |
| 심각도 | **하** — 지금 증상 없음. 운영 규칙을 서버가 보증하게 만드는 예방 조치 |
| 우선순위 | Low(이번 주 안) |

## 배경 — 발견된 문제

`DELETE /admin/topics/:topicId`는 **콘텐츠 0건**만 확인하고 지운다(`admin.md` 4.5). 그런데 `user_interests.topic_id`에도 FK(`fk_user_interests_topics`, `ON DELETE` 없음)가 있어, 콘텐츠는 없지만 **사용자가 골라둔** 주제를 지우면 FK 23503이 그대로 올라와 **500 `INTERNAL_ERROR`(retryable=true)** 가 된다. 콘솔은 사유 없이 재시도만 안내한다.

"콘텐츠는 0건인데 사용자는 골라둔 주제"가 생기는 경로는 하나다 — **0건인 채로 `is_visible = true`가 된 주제를 온보딩·관리 화면에서 선택**하는 것. 사용자 결정(2026-09-15): **삭제 시점에 막지 않고, 0건 주제가 노출되는 것 자체를 서버가 막는다.** 노출되지 않으면 선택할 수 없고, 선택되지 않으면 삭제가 FK에 걸리지 않는다.

## 요청 내용

1. `PATCH /admin/topics/:topicId`에서 `is_visible: true`로 바꾸는 요청은 **그 주제의 콘텐츠 건수가 0이면 409로 거부**한다.
   - 에러 코드 신설: `ADMIN_TOPIC_HAS_NO_CONTENTS`(409, retryable=false, `details.content_count: 0`). 기존 `ADMIN_TOPIC_HAS_CONTENTS`와 대칭.
   - 이미 `true`인 주제의 다른 필드 수정(이름·정렬)은 건수와 무관하게 통과한다 — 판정은 **false → true 전이**에만 건다.
   - 판정에 쓰는 건수는 `ContentService.countByTopicIds`(삭제 판정과 같은 집계)로 센다. 회수·만료 콘텐츠를 포함할지(`published`만 셀지)는 구현 시 `admin.md` 4.5 "주제별 콘텐츠 건수"의 정의와 맞춘다.
2. 문서 반영(`changes/pending` 발행):
   - `admin.md` 4.5 — "**콘텐츠 0건인 주제의 노출을 켜려 하면 경고 확인을 거친다 … 서버는 거부하지 않는다**" 항목을 "**서버가 409로 거부한다**"로 바꾸고, 2026-08-30 결정을 뒤집는 사유를 적는다(아래 "주의").
   - `admin-api.md` 4.3 — "콘텐츠 0건인 주제의 `is_visible: true`를 서버가 거부하지 않는다" 문장 교체 + 5장 에러 표에 새 코드 등재. `common-error-handling.md` 9장 중앙 표에도 등재.
3. **관리자 콘솔 UI 수정** — `pipeline/apps/web/app/publish/topics/page.tsx`(제품 주제 관리 표). 지금은 0건 주제의 노출 체크박스를 켤 때 `confirm("… 그래도 켤까요?")`로 **경고만 하고 통과**시킨다(123행). 서버가 거부하게 되면 이 확인은 뜻이 없어진다.
   - **0건 주제의 노출 체크박스는 비활성**으로 그린다(`content_count === 0 && !is_visible` → `disabled`). 옆에 사유를 상시 표시한다: **"콘텐츠가 0건이라 노출할 수 없어요. 콘텐츠를 먼저 발행해주세요"**. 기존 `confirm` 분기는 제거한다.
   - 이미 노출 중인 0건 주제(규칙 이전에 켜진 것)는 **끄는 쪽만 가능**하게 둔다 — 체크박스는 활성이고, 끄면 다시 켤 수 없다는 점을 같은 문구로 알린다.
   - 건수는 목록 조회 시점의 값이라 어긋날 수 있다. 서버가 **409 `ADMIN_TOPIC_HAS_NO_CONTENTS`** 를 돌려주면 체크박스를 원복하고 서버 `message`를 그대로 표시한 뒤 **목록을 재조회**한다(`act()`의 에러 처리에 이 코드 분기 추가 — `EarApiError.error_code`).
   - 상단 설명 문구(17행) "노출 여부만 사람이 켠다"에 **"콘텐츠가 0건인 주제는 켤 수 없다"** 를 덧붙인다. 체계 대조 결과 문구(96행 "콘텐츠가 없으면 삭제, 있으면 숨김")는 그대로 둔다.
   - 콘텐츠 업로드 화면(`publish/upload/page.tsx`)은 숨김 주제에도 콘텐츠를 배정할 수 있으므로(235행 "(숨김)" 표기) "콘텐츠 발행 → 주제 노출" 순서가 콘솔에서 성립한다. 변경 없음.

## 주의 — 기존 결정과 충돌한다

`admin.md` 4.5(구현 확인 2026-08-30)는 **정반대로 정해 놓았다**: "서버는 0건 주제의 노출 켜기를 거부하지 않는다 … **실제로 0건인 채로 켜야 하는 운영(발행 직전 준비)이 존재하므로 서버가 막으면 오히려 곤란하다.**" 이 티켓은 그 결정을 번복한다. 반영 전에 다음을 정한다.

- **"발행 직전 준비" 운영이 아직 필요한가?** 필요하면 순서를 "콘텐츠 발행 → 주제 노출"로 고정해야 한다(콘텐츠 `published` 전이는 주제 노출 여부와 무관하게 가능한지 확인).
- **이 규칙만으로는 FK 500이 완전히 닫히지 않는다.** 노출 중 사용자가 선택한 뒤 그 주제의 콘텐츠가 전부 **영구 삭제**(`DELETE /admin/contents/:id/storage`, KAN-38 계열)되면 다시 "0건 + 선택 사용자 있음"이 된다. 이 잔여 경로는 (a) 삭제 시 `user_interests` 활성 행도 함께 세어 409로 거부하거나, (b) 운영 규칙("사용자가 선택한 주제는 지우지 않는다 — 숨김만")으로 덮는다. (a)가 방어적이지만 결정은 남겨 둔다.
- 현재 통합 테스트 중인 흐름(주제 생성 → 노출 → 콘텐츠 업로드 순서를 쓰는 시나리오)이 이 규칙에 걸리는지 확인하고, 걸리면 시나리오 순서를 바꾼다.

## 완료 조건

- Given 콘텐츠 0건·`is_visible = false`인 주제 / When `PATCH /admin/topics/:id` `{ "is_visible": true }` / Then 409 `ADMIN_TOPIC_HAS_NO_CONTENTS`, `details.content_count = 0`, 주제는 그대로 숨김
- Given 콘텐츠 1건 이상인 숨김 주제 / When 같은 요청 / Then 200, `is_visible = true`
- Given 이미 노출 중인 0건 주제(규칙 이전에 켜진 것) / When 이름만 바꾸는 PATCH / Then 200 (전이가 아니므로 판정하지 않는다)
- Given `admin.md` 4.5 · `admin-api.md` 4.3 / When 읽는다 / Then "서버가 거부한다"와 번복 사유가 적혀 있다
- Given 콘솔 주제 관리 표의 0건·숨김 주제 / When 노출 체크박스를 본다 / Then 비활성이고 "콘텐츠가 0건이라 노출할 수 없어요 …" 문구가 보이며 `confirm`은 뜨지 않는다
- Given 목록 조회 뒤 콘텐츠가 전부 지워져 건수가 어긋난 주제 / When 노출을 켠다 / Then 서버 409를 받아 체크박스가 원복되고 서버 문구가 표시된 뒤 목록이 재조회된다

## 처리 기록

| 항목 | 값 |
|---|---|
| 보류 | 2026-09-17 — 백엔드 409 거부를 구현한 PR #388을 **머지 전에 닫음**. 서버가 먼저 거부하면 콘솔이 `confirm` 뒤 "재시도"만 안내하게 되므로, **관리자 콘솔 UI(요청 3번, pipeline 파트)를 먼저 맞추고 순서를 상의한 뒤** 서버를 바꾼다. 방향(0건 주제 노출 금지)은 유지 |
| 남은 결정 | ① 콘솔 UI → 서버 순서와 담당(AI 파트) 일정 ② "발행 직전 준비" 운영 순서 고정 여부 ③ 콘텐츠 영구 삭제로 다시 0건이 된 노출 주제의 FK 잔여 경로((a) 삭제 시 `user_interests` 확인 / (b) 운영 규칙) |
