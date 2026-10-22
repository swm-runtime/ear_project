# admin-api — 편성 미리보기(4.16)를 가명 `user_id` 조회로 바꾸고 이메일·닉네임 제거 · 열람 감사 로그 (BE)

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/admin-api.md` 3장 엔드포인트 표(4.16 행) · 4.16 절 전체(요청·응답 `user`·오류·읽기 전용 서술) · 4.17 "추천 결과" 문단(`?email=<테스트 계정>` 표기) · `changes/pending/insights-recommendation-inspector.md` 4.22-1 "(4.16 편성 미리보기와 다른 점)" 문구 |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-10-22 |
| 기한 | 다음 문서 통합 때(코드와 같은 PR 로 dev 에 들어간다 — 문서가 늦으면 4.16 이 실제와 다른 `?email=` 계약을 계속 적고 있게 된다) |
| 선행 | 없음 |
| 관련 | 브랜치 `fix(be)/drip-preview-user-id` · 콘솔 `pipeline/apps/web` 편성 미리보기(`/drip-check`)·사용자별 추천(`/drip-check/users`)·추천 테스트 |

## 배경

4.16 `GET /admin/drip/preview`는 **이메일로 사용자를 찾고 응답 `user`에 `email`·`nickname`을 싣는다.** 콘솔 "편성 미리보기 (실배포)"는 이메일 입력칸과 고정 기본 이메일을 두고 화면에 닉네임·이메일을 그렸다. 운영 실사용자를 골라 보는 화면이라 이름·이메일이 콘솔 입력·URL(접근 로그)·화면·세션에 남는다 — 루트 `CLAUDE.md` 공통 원칙("기본은 집계와 `user_id`") 위반이고 수집 목적 밖 이용이다(개인정보 보호법 18조·59조).

같은 날 가명(`user_id`) 기반 추천 검증(`/admin/insights/recommendations/*` — `changes/pending/insights-recommendation-inspector.md`)이 열렸다. 편성 미리보기도 같은 기준으로 맞춘다.

- **이메일 조회 키는 남기지 않는다(한 릴리스 유예 없음).** 유예하면 콘솔이 이메일 입력을 계속 받게 되고, 이메일이 쿼리스트링으로 접근 로그·브라우저 기록에 남는 경로가 그대로 산다. 운영 API 가 새 계약을 받기 전(다음 dev→main 릴리스 전)에는 콘솔이 "운영 API 배포 후 사용 가능"으로 안내하고 멈춘다 — 읽기 전용 검증 도구라 잠시 못 쓰는 비용이 작다.
- **감사 로그 액션 `drip.preview_view`를 새로 둔다.** 추천 검증 `insights.recommendation_view`와 같은 이유(개인 단위 행동 기록의 열람)지만 경로가 달라 나눠 남긴다 — 어느 화면에서 봤는지가 사후 확인 근거다.

## 수정 내용

1. **`admin-api.md` 3장 엔드포인트 표 4.16 행** — 용도 끝에 "· 가명 `user_id`로 조회, 열람 감사 로그(2026-10-22)"를 덧붙인다.
2. **`admin-api.md` 4.16 요청 표** — `email` 행을 아래로 바꾼다.
   > | `user_id` | string(uuid) | ✓ | 대상 사용자 `users.id`. 역할 무관. 없거나 탈퇴(`status ≠ active`)면 404. **`email` 쿼리는 받지 않는다**(2026-10-22 폐기 — 보내면 400) |
3. **`admin-api.md` 4.16 응답 `user` 행** — `id` `email` `nickname` `tier` `job_category` `years_of_experience` `onboarding_completed` → **`id` `tier` `market` `job_category` `years_of_experience` `onboarding_completed`**. 뒤에 한 줄을 붙인다.
   > **개인정보** — 이메일·닉네임·제공자 ID·프로필 사진·직함은 서버가 **조회하지도(SELECT) 싣지도 않는다**(2026-10-22). 콘솔은 `user_id` 앞 8자리로 보인다. 처리 근거는 처리방침의 처리 목적 "콘텐츠 편성과 추천 · 서비스 개선"이다.
4. **`admin-api.md` 4.16 머리 문단의 "호출해도 서버 상태는 바뀌지 않는다"** → "사용자 상태는 바뀌지 않는다. 유일한 쓰기는 열람 1회마다 남기는 **감사 로그 `drip.preview_view`**(actor = 관리자 `user_id`, target = `user:<user_id>`, before/after 없음)다. 감사 로그를 남기지 못하면 계산하지 않고 실패한다. 404·400 은 남기지 않는다."
5. **`admin-api.md` 4.16 오류 표**
   > | 400 | `VALIDATION_FAILED` | `user_id` 누락·uuid 형식 오류, 또는 폐기된 `email` 쿼리 |
   > | 404 | `NOT_FOUND` | 그 `user_id`의 사용자 없음 · 탈퇴 |
6. **`admin-api.md` 4.17 "추천 결과" 문단** — `GET /admin/drip/preview?email=<테스트 계정>` → `GET /admin/drip/preview?user_id=<테스트 계정 id>`(계정 id 는 `/admin/recommend-test/account`의 `user.id`).
7. **`changes/pending/insights-recommendation-inspector.md` 4.22-1 개인정보 문단** — "(4.16 편성 미리보기와 다른 점)"을 지운다(이제 같은 기준이다). 그 요청서를 반영할 때 함께 처리한다.

## 완료 조건

- **Given** 관리자 토큰, **When** `GET /admin/drip/preview?user_id=<활성 사용자 id>`, **Then** 200 이고 `user`는 `id` `tier` `market` `job_category` `years_of_experience` `onboarding_completed`만 가지며 응답 어디에도 `email`·`nickname` 키와 그 사용자의 이메일·닉네임 값이 없다 — `admin-api.md` 4.16 응답 표가 같은 필드를 적고 있다.
- **Given** 같은 요청, **When** 응답이 나간 뒤 `audit_logs`를 보면, **Then** `action = 'drip.preview_view'`, `actor = 관리자 id`, `target = 'user:<user_id>'` 1행이 늘어 있고 4.16 이 이 쓰기를 적고 있다.
- **Given** 없는·탈퇴한 `user_id`, **When** 요청, **Then** 404 `NOT_FOUND`이고 감사 로그는 늘지 않는다. **Given** uuid 가 아닌 값·누락·`?email=`, **When** 요청, **Then** 400 `VALIDATION_FAILED` — 4.16 오류 표가 두 줄을 이 조건으로 적고 있다.
- **Given** 반영 후 `admin-api.md`, **When** `?email=`을 검색하면, **Then** 4.16·4.17 어디에도 편성 미리보기의 `email` 조회 서술이 남아 있지 않다.

## 처리 기록

- 2026-10-22 발행 — 코드(백엔드 조회·응답·감사 로그, 콘솔 입력·후보 목록·링크)는 브랜치 `fix(be)/drip-preview-user-id` PR 에 함께 들어간다. 문서 반영은 다음 통합 때.
