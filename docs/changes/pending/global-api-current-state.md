# global-api 현행화 — 구현된 항목의 상태 표시·사실 서술을 코드에 맞춘다 (i18n 검증 2026-10-20)

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/global-api.md`(머리말 5행 · 0.1 23행 · 2.2 · 2.3 66행 · 3장 4·5·7·11행 · 4.3·4.4·4.6 177행·4.7 195행·4.9 219행·4.10·4.11 프로필 행 · 5장 · 6장 결제 흐름 · 7장 352행 · 8장 · 9장) · `backend/domain.md` 3.x `user_market_changes`(375·378행) · `spec/api/auth-api.md` 4.1 표(118행)·4.2(296행) · `features/common-error-handling.md` 4.6(102행) · `features/notification.md` 4.3 문구 행(81행) |
| 요청 파트 | 백엔드 — 박준현 |
| 발행 날짜 | 2026-10-20 |
| 시작 날짜 | 2026-10-20 |
| 기한 | 다음 통합 때(1.3.0 통합) |
| 선행 | 없음 — 8번(되돌리기 횟수)만 BE 코드 PR `fix(be)/market-change-cooldown-revert` 머지와 같은 통합에 반영한다 |
| 중요도 | Low — 서술 정리. 계약(필드·엔드포인트·에러 코드)은 바뀌지 않는다 |
| 관련 | [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) 에픽 · [KAN-192](https://runtime364.atlassian.net/browse/KAN-192)(요금제 보류) · [KAN-194](https://runtime364.atlassian.net/browse/KAN-194) · [KAN-227](https://runtime364.atlassian.net/browse/KAN-227) · 동시 BE PR `fix(be)/market-change-cooldown-revert`(되돌리기 행을 하루 1회 판정에서 빼도록 코드를 문서에 맞춘다) |

## 배경

2026-10-20 i18n 검증에서 `global-api.md`와 주변 계약 문서를 코드와 한 줄씩 대조했다. 구현이 끝났는데 🟡(가안)로 남은 항목, 보류(KAN-192)된 요금제 설계를 확정처럼 적은 줄, 코드와 다른 사실 서술(경로·인덱스 방향·테스트 범위)이 있었다. `global-api.md` 0장은 "바뀌면 이 문서를 먼저 고친다"를 원칙으로 두므로, 문서가 코드 뒤에 남아 있으면 세 파트가 따라갈 기준이 흐려진다. 계약 문서라 BE가 직접 고치지 않고 여기에 모은다.

## 수정 내용

### 1. `spec/api/global-api.md`

| # | 위치 | 지금 | 바꿀 내용 | 근거(코드) |
|---|---|---|---|---|
| 1-1 | 5행 머리말 | 자식 티켓 `docs/tickets/<파트>/pending/global-*.md` | `docs/tickets/<파트>/{pending,archive}/global-*.md` — 대부분 archive로 옮겨졌다 | `tickets/backend/archive/global-*.md` 8개 · `pending/` 3개 |
| 1-2 | 23행(0.1) · 177행(4.6 "왜") | "스토어에 나가 있는 앱(3.1.x)" · "스토어의 3.1.x 앱" | **1.2.x**. 현재 스토어 버전은 1.2.1이다. 3.1.x라는 버전은 없었다 | `frontend/app.json` 주석 runtime 35 = 앱 1.2.1 · `tickets/frontend/pending/ad-measurement-opt-out.md` "운영 main(1.2.1 · rt 35)" |
| 1-3 | 2.2 제목 | 🟡 | ✅. 서버가 두 헤더를 요청 종료 로그에 남긴다 | `backend/src/common/interceptors/logging.interceptor.ts`(`accept_language`·`timezone` 필드) · FE `frontend/src/shared/api/api-client.ts` 147–148행이 모든 요청에 붙인다 |
| 1-4 | 66행(2.3 에러 `message` 행) | "GLOBAL 사용자에게 보이면 안 된다 → … 계약 문서(`common-error-handling.md` 4장)에 이 규칙을 추가한다(changes/pending)" | "서버 `message`는 한국어 **폴백**이다. **영어 표시**(앱 표시 언어가 영어)에서는 클라이언트가 `error_code`로 번역한다 — 시장이 아니라 **표시 언어**가 정한다. 클라이언트는 9장의 모든 `error_code`에 en 문자열을 갖고 누락을 테스트로 막는다. `common-error-handling.md` 4.6에 반영됨(KAN-194)" | `api-client.ts` 103행 `APP_LANGUAGE === 'en' ? errorMessageEn(errorCode) : body.message` · `common-error-handling.md` 4.6(102행) |
| 1-5 | 3장 4·5·11행 상태 칸, 4.3·4.4·4.10 제목 | 🟡 | ✅ | 4행/4.3: `settings/dto/get-settings-response.dto.ts`(`market` 읽기 전용·`language_code`·`timezone`) · `update-settings-request.dto.ts` `language_code`. 5행/4.4: `user/policies/onboarding-steps.policy.ts` `onboardingStepsFor`(KR `topic,career` · GLOBAL `topic`) · `onboarding/dto/get-onboarding-state-response.dto.ts` `steps` · `onboarding.orchestrator.ts` 172행 GLOBAL 커리어 409 `MARKET_MISMATCH`. 11행/4.10: `admin/dto/admin-content-query-request.dto.ts` `market` · `create-topic-request.dto.ts` `market` · `admin-insights-summary-response.dto.ts` `by_market` |
| 1-6 | 3장 7행 · 6장 `[결제]` 흐름(341–342행) · 8장 `plans` 행(363) · `subscriptions`·`store_notification_logs` 행(365) · 9장 #4 | ✅ 또는 확정 흐름처럼 적혀 있다 | 모두 **⏸ 보류(KAN-192)** 로 표시해 4.6과 맞춘다. 3장 7행 "변경" 칸은 "보류 — 지금은 시장 무관 종전 응답, 이름·설명만 시장 언어(`name_en`·`description_en`)". 6장 결제는 "`GET /plans` → 같은 상품·현지가 표시(시장 무관) → 영수증 제출(종전 계약)"로 바꾸고 storefront 저장 줄에 ⏸. 8장 `plans` 행은 "⏸ 보류 — 현재는 `name_en`·`description_en`만(`domain.md` 8.1, 마이그레이션 `1790400000000`)", `subscriptions` 행은 "⏸ 보류". 9장 #4는 "⏸ 보류(KAN-192 재개 조건)" | `subscription/entities/plan.entity.ts`에 `market` 없음, `name_en`·`description_en`만 · `subscription/policies/plan-text.policy.ts` · `tickets/backend/pending/global-plans-storefront.md` 상태 "보류" |
| 1-7 | 195행(4.7) | "드립 편성·탐험·인기·검색 후보도 같은 필터를 탄다. 이 격리는 서버 e2e(…)가 **보장**한다" | "드립 편성·탐험·인기·검색 후보도 같은 필터를 탄다. 서버 e2e(`test/global-catalog-isolation.e2e-spec.ts`)가 검사하는 것은 **온보딩 주제 목록 · 탐색 목록(주제 지정) · 콘텐츠 상세(다른 시장 404·`language`) · 온보딩 담기 · 공지 목록·상세 · 관심사 저장(409) · 라이브러리 주제별 건수 · 옛 토큰(클레임 없음 → KR)** 이다. 드립·탐색 피드·대본은 단위 테스트가 시장 인자 전달을 본다. **검색·인기·서명 URL·시리즈는 e2e가 없다**" | e2e 파일의 `it` 9개(113–263행) · 단위 `drip-batch.orchestrator.spec.ts` · `explore.orchestrator.spec.ts` · `playback/services/script.service.spec.ts` |
| 1-8 | 352행(7장) | "…같은 가시성 조건을 쓰고, e2e가 교차 접근 0건을 검사한다" | "…같은 가시성 조건을 쓴다. 교차 접근 e2e의 범위는 4.7에 적은 화면까지다(검색·인기·서명 URL·시리즈는 없음)" | 1-7과 같음 |
| 1-9 | 219행(4.9) | "`enrichment.json`에 `language` 키 추가(선택, 없으면 payload 값)" | 이 문장을 지운다. 대신 "`enrichment.json`에는 `language` 키를 **싣지 않는다** — 서버 파서는 모르는 최상위 키가 있으면 파일째 거부하고, 언어는 업로드 payload(`language`)로 간다. 파이프라인은 일부러 뺀다" | `backend/src/modules/admin/enrichment-file.ts` `KNOWN_TOP_LEVEL_KEYS`(language 없음)·80–83행 "알 수 없는 키예요" · `pipeline/apps/worker/src/stages/enrich-global.test.ts` 6·18–20행 |
| 1-10 | 294행(4.11 표 프로필 행) | "주간 주제 분포는 현재 시장 주제만(지금은 시장 무관 — 구현 때 더한다)" | 괄호 "(지금은 시장 무관 — 구현 때 더한다)"를 지운다. 이미 구현됐다 | `profile/profile.orchestrator.ts` 233–244행 `buildWeeklyTopicDistributions(…, user.market)`·`buildListeningTopPercent(…, user.market)` |
| 1-11 | 315행(5장 `MARKET_MISMATCH` 상태) | "🟡 신설 — `common-error-handling.md` 9장 등재는 BE 구현 PR에서" | "✅ — `common-error-handling.md` 9장 등재됨" | `common-error-handling.md` 214행 |
| 1-12 | 9장 표 | #3·#4·#6·#7·#8 | **#6·#7·#8 행을 지운다**(해결). #6 GLOBAL 주제 트리 — 마이그레이션 `1790100000000`으로 8개 시드(4.9). #7 어드민 시장별 집계 — 4.10 `by_market` 구현. #8 `MARKET_MISMATCH` — 코드명 확정·9장 등재(1-11) | 같음 |
| 1-13 | 367행(8장 `user_market_changes` 인덱스) | `(user_id, changed_at DESC)` | `(user_id, changed_at)` — 마이그레이션은 오름차순이다(최신 1행 조회는 역방향 스캔으로 같은 인덱스를 쓴다) | `backend/src/database/migrations/1791000000000-AddUserMarketChanges.ts` 31행 `ON "user_market_changes" ("user_id", "changed_at")` |

### 2. `backend/domain.md` — `user_market_changes`

- 375행 인덱스 `idx_user_market_changes_user_id_changed_at (user_id, changed_at DESC)` → `(user_id, changed_at)`(1-13과 같은 근거).
- 378행 "**서비스 날짜당 1회 판정**(오늘 행이 있으면 막는다. …" → "**서비스 날짜당 1회 판정**(오늘 **되돌리기가 아닌** 행이 있으면 막는다 — 되돌리기는 횟수에 세지 않는다, `global-api.md` 4.11. …". 4.11 "막는 조건"이 이미 "되돌리기는 횟수에 세지 않는다"고 적고 있고, 지금 코드(`UserMarketChangeService.judgeCooldown` → `countByUserIdSince`)는 되돌리기 행까지 센다 — 동시 BE PR `fix(be)/market-change-cooldown-revert`가 코드를 4.11에 맞춘다. **이 항목은 그 PR 머지 뒤에 반영한다.**

### 2-1. `backend/domain.md` — `contents` 시장 격리(643행)

- 643행 목록류 나열 "(탐색·검색·인기·최신·드립 후보·온보딩 추천·라이브러리 목록·주제별 건수·**복원**)"에서 "·복원"을 뺀다.
- 근거: 라이브러리 실행 취소(복원 `POST /library/items/:id/restore`)는 시장을 보지 않고 발행·라이선스만 본다(`library-screen.orchestrator.ts` 273행 `isContentVisibleAt`). 대상은 본인 소유 행뿐이고(`getOwnedItemWithDeleted`) 응답은 `id`·`status`·`added_at`·`deleted_at`이라 콘텐츠 정보가 나가지 않는다. 이전 시장 항목을 복원해도 목록·건수가 시장 조건으로 계속 숨기므로 격리는 깨지지 않는다 — 코드에 시장 확인을 더할 이유가 없어 문서를 코드에 맞춘다(i18n 검증 V11, 2026-10-20 결정).

### 3. `spec/api/auth-api.md`

- 118행(4.1 `locale.region_code` 비고) "(`global-api.md` 2.1, 2026-10-16 🟡)" → "✅(구현 #1614)". `global-api.md` 2.1 연령 행이 이미 ✅(#1614)다.
- 296행(4.2) "보낸 `version`이 null이 아니면 그 시장·기준의 현행 버전과 같아야 한다(null이면 서버가 현행값을 기록한다)" → "보낸 `version`은 그 시장·기준의 현행 버전과 **같아야 한다**. 버전이 있는 항목(약관·처리방침·GLOBAL 연령 확인)에 `null`을 보내도 409 `CONSENT_VERSION_STALE`이다. `null`을 현행값으로 채우는 것은 **재동의**(`POST /users/me/consents`, 4.5)뿐이다". 가입과 시장 전환(`global-api.md` 4.11)은 엄격 비교다.
  - 근거: 가입 `user/services/user.service.ts` `assertRequiredConsents` 488–499행 — `consent.version !== currentConsentVersionOf(...)`면 409(null도 걸린다. 기록 `recordConsents`는 이 검사 뒤에 돈다). 재동의 `user/services/consent.service.ts` 76행 `input.version !== null && …` · 89행 저장 값은 늘 `currentConsentVersionOf(...)`. 시장 전환 `recordForMarketChange` 208행도 엄격 비교.

### 4. `features/common-error-handling.md` 4.6

- 102행 "**영어 표시(기기 언어가 한국어가 아님)에서는**" → "**영어 표시(앱 표시 언어가 영어)에서는**". 판정은 기기 언어가 아니라 앱의 표시 언어 설정이다(설정 › 언어 · 가입 때 A21 선택으로 바뀐다).
  - 근거: `frontend/src/shared/api/api-client.ts` 103행 `APP_LANGUAGE === 'en'` · 147행 `Accept-Language: DISPLAY_LOCALE` · `frontend/src/shared/i18n/locale.ts` 81–84행.

### 5. `features/notification.md` 4.3 문구 행

81행 문구 칸 뒤에 GLOBAL 영어 템플릿을 더한다.

- "**GLOBAL 시장 사용자는 영어**(`global-api.md` 2.3 — 언어는 기기 언어가 아니라 `users.market`으로 고른다): 1편이면 `Your episode for today is here`, N ≥ 2면 `Your N episodes for today are here`. 본문(대표 콘텐츠 제목)은 콘텐츠 그대로."
- 근거: `backend/src/modules/notification/notification.constant.ts` `buildDripArrivalTitle` · `notification/services/drip-arrival-notification.service.ts` 151행 `messageLanguageOf(market)` · 339행 `body: contents[0].title`.

## 완료 조건

- Given `global-api.md` / When 상태 표시를 본다 / Then 2.2·3장 4·5·11행·4.3·4.4·4.10은 ✅, 3장 7행·6장 결제·8장 `plans`·`subscriptions` 행·9장 #4는 ⏸ 보류(KAN-192)이고, 9장에 #6·#7·#8이 없다
- Given `global-api.md` 4.7·7장 / When e2e 서술을 읽는다 / Then e2e가 검사하는 화면이 나열돼 있고 검색·인기·서명 URL·시리즈는 e2e가 없다고 적혀 있다
- Given `global-api.md` 4.9 / Then `enrichment.json`에 `language` 키를 싣지 않는다고 적혀 있다
- Given `global-api.md` 8장과 `domain.md`의 `user_market_changes` / Then 인덱스가 `(user_id, changed_at)`이다
- Given `domain.md` 378행 / Then 되돌리기 행은 하루 1회 판정에 세지 않는다고 적혀 있다(BE PR `fix(be)/market-change-cooldown-revert` 머지 뒤)
- Given `domain.md` 643행 / When 시장 조건을 싣는 목록류를 읽는다 / Then "복원"이 없다
- Given `auth-api.md` 4.2 / Then 가입에서 버전 있는 항목의 `null`은 409이고, `null`을 채우는 것은 재동의뿐이라고 적혀 있다
- Given `common-error-handling.md` 4.6 / Then 영어 번역 조건이 "앱 표시 언어가 영어"다
- Given `notification.md` 4.3 / Then GLOBAL 영어 제목 두 가지(1편 · N편)가 적혀 있다

## 처리 기록

- 2026-10-20 발행(BE — i18n 검증, 브랜치 `docs(be)/i18n-audit-change-requests`). 각 줄의 근거는 dev(942d78fc) 코드로 확인했다.
- 2026-10-20 2-1(`domain.md` 643행 "복원" 삭제) 추가 — i18n 검증 V11, 박준현 결정.
