# domain-conflicts

# 도메인 모델 통합 — 충돌 목록 (결정 요청)

> `docs/pages/*.md` 16개 문서의 “6. 데이터 모델” 항목을 전부 수집·병합하는 과정에서 나온 **결정 필요 항목**이다.
여기서 결정된 내용으로 `docs/backend/domain.md`를 작성한다. 결정이 끝나면 이 문서는 domain.md에 흡수하고 삭제한다.
> 
> 
> 각 항목은 **무엇이 충돌하는지 / 왜 문제인지 / 선택지 / 권고**로 구성했다. 권고에 동의하면 “권고대로”, 아니면 다른 안을 지정하면 된다.
> 

## 수집 결과 요약

16개 문서에서 **47개 개체**가 등장했다(로컬 전용 2개 포함). 이름이 같은데 정의가 다르거나, 이름이 다른데 같은 것을 가리키는 경우가 다수 있다.

**단, 47개가 그대로 테이블이 되지는 않는다.**

| 단계 | 개수 |
| --- | --- |
| 문서에 등장한 개체 | 47 |
| 로컬 전용 제외 (`OfflineItem`, `OfflineLicense`) | 45 |
| 아래 권고대로 병합·폐기 후 (B-1, B-3, B-4, B-6, B-8, A-1) | **36** |
| MVP 필수만 (P1·이연 기능 제외) | **약 25** |

개체 수가 많은 이유는 이 서비스가 사실상 **세 개의 시스템**이기 때문이다 — 앱 서비스(계정·라이브러리·재생) + 콘텐츠 파이프라인(수급·생성·QA·발행) + 사업 시스템(구독·결제·파트너 정산). 파이프라인과 파트너 영역만 15개다.

| 영역 | 등장 개체 |
| --- | --- |
| 계정 | User, Consent, Session, WithdrawalLog, DeviceToken |
| 관심사 | UserInterest, UserCareer, Topic, TopicAdjacency, UserInterestSetting, InterestChangeLog |
| 콘텐츠 | SourceDocument, Episode, Script, QaReport, Content, ContentScript, PipelineRun, ContentStat |
| 라이브러리·재생 | LibraryItem, PlaybackProgress, PlaybackSession, PlayRecord, UserSignal, AudioAccessToken |
| 편성 | DripSchedule, UserPreferenceVector, DripBatchRun |
| 구독·결제 | Plan, Subscription, PurchaseIntent, StoreNotificationLog, PaywallEvent |
| 파트너 | Partner, ContentControlRequest, PartnerReview, WithdrawnContent, AudioAccessLog, PartnerReport, AuditLog |
| 설정·알림 | NotificationSetting, NotificationLog, UserPlayerSetting, UserOfflineSetting |
| 오프라인 | OfflineDownloadRecord (+ 로컬 전용 OfflineItem, OfflineLicense) |

---

# 🔴 A급 — 결정 없이는 테이블을 그릴 수 없음

## A-1. 재생 위치가 3개 모델에 흩어져 있다 ★가장 큰 충돌

| 출처 | 정의 |
| --- | --- |
| `library.md` 6 | `LibraryItem.resume_position_sec` |
| `library.md` 6 | `PlaybackProgress { user_id, content_id, position_sec, updated_at }` |
| `player.md` 6 | `PlaybackSession { user_id, content_id, position_sec, max_reached_sec, playback_rate, started_at, updated_at, ended_at }` |

**`library.md` 한 문서 안에서 두 개를 동시에 정의하고 있다.** 이어듣기(FR-24)를 구현할 때 어느 값을 읽어야 하는지 정해져 있지 않다.

**왜 단순 통합이 안 되는가** — `library.md` 4.4는 “삭제는 `LibraryItem`만 제거하며 **재생 이력은 남긴다**”고 규정한다. 재생 위치를 `LibraryItem`에 합치면 삭제 시 이력이 함께 사라진다.

| 선택지 | 내용 | 결과 |
| --- | --- | --- |
| **(a)** | `LibraryItem`에 통합, `PlaybackProgress`·`PlaybackSession` 폐기 | 가장 단순하지만 삭제 시 이력 소실 → 4.4 위반 |
| **(b) 권고** | `PlaybackProgress`(현재 상태, user×content 1건) 하나로 통일. `LibraryItem`은 위치를 갖지 않고 조회 시 join. `PlaybackSession` 폐기 | 삭제해도 이력 유지. 테이블 1개 |
| **(c)** | `PlaybackProgress`(현재) + `PlaybackSession`(재생 이력 N건) 2단 | 세션 단위 분석 가능하지만 테이블 2개, MVP에 과함 |

> **권고: (b)** — `PlaybackProgress { user_id, content_id, position_sec, max_reached_sec, updated_at }`, PK `(user_id, content_id)`.
`max_reached_sec`은 완청 판정에 반드시 필요하므로(`player.md` 4.4) 여기에 포함시킨다. `playback_rate`는 콘텐츠별이 아니라 전역 설정이므로 `UserPlayerSetting`으로 보낸다(`player.md` 4.2가 “사용자 전역 설정”으로 규정).
> 

→ 권고대로 진행

## A-2. `daily_play_count`가 컬럼인지 파생값인지 명세 안에서 모순

| 출처 | 내용 |
| --- | --- |
| `paywall.md` 6 | `User { daily_play_count: int // 파생값 — PlayRecord에서 계산 }` — 파생값이라면서 컬럼으로 그려져 있음 |
| `paywall.md` 4.2 | `daily_play_count = COUNT(DISTINCT content_id WHERE played_at >= count_reset_at)` |
| `paywall.md` 4.3 | “배치로 리셋하지 않고 **판정 시점에 계산**” |

4장(집계)과 6장(컬럼)이 서로 다른 구현을 지시한다. 컬럼으로 두면 04시 리셋 배치가 필요한데, 4.3은 배치를 쓰지 말라고 한다.

> **권고: 컬럼을 두지 않는다.** `User.daily_play_count` / `User.count_reset_at` 삭제. `PlayRecord` 집계로만 판정한다.
**단 `PlayRecord`에 `play_date` 컬럼이 필요하다** — 04시 기준 “서비스 날짜”(03:59는 전날로 계산)를 저장해야 `(user_id, content_id, play_date)` 유니크가 성립하고, 같은 날 재생 중복 카운트를 DB가 막아준다(`paywall.md` 4.2).
> 

→ User 모델에서 daily_plan_count와 count_reset_at은 삭제한다.
→ PlayRecord에서 Count로 오늘 들은 콘텐츠의 수를 계산한다.

## A-3. `tier`가 User·Subscription·Plan 세 곳에 존재

| 출처 | 정의 |
| --- | --- |
| `auth.md` / `splash.md` / `paywall.md` | `User.tier: enum(free\|light\|daily\|pro)` |
| `subscription.md` | `Subscription.tier: enum(light\|daily\|pro)` — **free 없음** |
| `subscription.md` | `Plan.tier: enum(light\|daily\|pro)` |
| `subscription.md` 6 | `User.entitlements_cache` (추가 캐시) |

무료 사용자는 `Subscription` 행이 없으므로 `free`는 `User.tier`에만 존재한다. 즉 진실의 원천이 두 곳으로 갈린다. `subscription.md` 4.3은 “**서버 알림(S2S)이 진실의 원천**”이라고 규정한다.

| 선택지 | 내용 |
| --- | --- |
| **(a)** | `User.tier` 제거. 티어는 항상 `Subscription`에서 유도(행 없으면 free) |
| **(b) 권고** | `Subscription`이 원천, `User.tier`는 **비정규화 캐시**로 유지. 갱신은 구독 상태 변경 시에만 |
| **(c)** | 현행 유지(양쪽 독립) |

> **권고: (b)** — 단 `User.tier`를 “캐시”로 문서에 명시하고, 갱신 경로를 `SubscriptionService` 한 곳으로 제한한다. `entitlements_cache`는 두지 않는다 — `Plan`에서 매번 조립하면 되고, 캐시가 두 겹이면 어긋난다.
> 

→ 권고 사항대로 진행한다.

→ plan은 light / daily / pro 3가지 plan으로 진행한다.

→ light는 free plan이다.

## A-4. `LibraryItem` 삭제 사유를 구분할 수 없다 ★버그 유발 지점

| 출처 | 규칙 |
| --- | --- |
| `library.md` 4.4 | 라이브러리에서 삭제 → **드립 재적립 대상에서 영구 제외**(FR-16). 소프트 삭제(`deleted_at`)가 근거 |
| `explore.md` 4.3 | 탐색에서 담기 해제 → 삭제하되 **“드립 재적립 제외 규칙은 적용하지 않는다”** |

두 경로 모두 `deleted_at`만 남기므로, **드립 편성 시 이 삭제가 어느 쪽인지 구분할 방법이 없다.** 현재 모델대로 구현하면 탐색에서 담기 해제한 콘텐츠가 드립에서 영구 제외된다.

> **권고: `LibraryItem.deleted_reason: enum(user_delete | unsave | withdrawn | expired)` 추가.**
드립 후보 필터는 `deleted_reason = user_delete`인 것만 제외한다.
> 

→ 탐색에서 담기 해제를 진행해도 드립 재적립 대상에서 영구 제외한다.

→ 즉 어디서 삭제되었는지 구분할 필요가 없다. (라이브러리/탐색에서 담기를 해제하면 모두 드립 재적립 대상에서 영구 제외한다.)

→ LibraryItem에서 deleted_reason은 만들지 않는다.

→ 사용자가 담기를 해제한 목록을 저장하는 DripExcludedContent 테이블을 만든다.

→ DripExcludedContent에는 사용자 시청한 콘텐츠, 라이브러리에서 제거한 콘텐츠, 이미 한 번 추천되었던 콘텐츠 등 drip에서 제거할 콘텐츠들이 들어간다.

→ 라이브러리에 있는 콘텐츠 / 사용자가 들은 이력이 있는 콘텐츠 / 드립 제외 콘텐츠에 있는 콘텐츠 이 3가지는 자동 적립(drip)에서 제외한다.

## A-5. 중복 적립 방지 유니크 제약이 3가지로 서술됨

| 출처 | 제약 |
| --- | --- |
| `library.md` 7 | `LibraryItem (user_id, content_id)` 유니크 |
| `drip-scheduling.md` 6 | `DripSchedule (user_id, content_id)` 유니크 — “중복 적립 방지의 최종 방어선” |
| `drip-scheduling.md` 7 | “`(user_id, scheduled_date)` 기준으로 멱등 처리” |

`DripSchedule`은 **편성 이력** 테이블인데 `(user_id, content_id)` 유니크를 걸면 복구·재편성이 영구 불가능해진다. 그리고 셋째 항목은 앞의 둘과 축이 다르다.

> **권고**
- 중복 적립 방지의 최종 방어선 = **`LibraryItem (user_id, content_id)` 유니크** 한 곳으로 정한다.
- `DripSchedule`은 이력이므로 유니크를 걸지 않는다.
- 배치 중복 실행 방지는 별도로 `DripBatchRun (run_date)` 유니크 + 사용자별 일일 상한 카운트로 처리한다.
> 

→ DripSchedule 테이블은 없앤다.

→ 재편성 방지는 A-4의 DripExcludedContent 테이블을 참고한다.

## A-6. `Content.status`에 파이프라인 상태와 노출 상태가 섞임

| 출처 | 값 |
| --- | --- |
| `library.md` 6 | `published \| withdrawn` |
| `content-pipeline.md` 6 | `published \| withdrawn \| expired \| superseded` |
| `content-pipeline.md` 5 (상태 머신) | `ingested → normalized → script_generated → qa_passed → audio_generated → published`, `qa_failed`, `review_required` |
| `partner-control.md` 5 | `partner_review`, `discarded` 추가 |

**핵심 질문: `Content` 레코드는 언제 생기는가?**
- 발행 시점에 생긴다면 → `Content.status`는 `published/withdrawn/expired/superseded`만 가지면 되고, 그 전 단계는 `Episode`/`PipelineRun`이 관리한다.
- 그런데 `partner-control.md` 4.2의 **발행 전 검수**는 파트너가 대본·오디오를 확인해야 하므로, 발행 전에도 콘텐츠 실체가 필요하다.

> **권고: 상태를 두 축으로 분리한다.**
- `Content.status: enum(draft | partner_review | published | withdrawn | expired | superseded)` — **노출 판정용**. `Content`는 오디오 생성 완료 시점에 `draft`로 생성한다.
- 파이프라인 진행 상태는 `PipelineRun.stage`가 갖는다(`ingested`~`audio_generated`, `qa_failed`, `review_required`).
- 노출 조건은 어디서나 `status = published` 단 하나로 통일한다.
> 

→ 컨텐츠 업로드는 앱 내에서 관리자로 로그인하여 관리자 한정 업로드할 수 있다.

→ 업로드시 바로 published로 설정된다.

→ 컨텐츠 업로드 이전 단계의 상태는 따로 관리하지 않는다.

→ 따라서 Content.status = enum(published/withdrawn/expired) 3가지로 진행한다.

→ PipelineRun 테이블은 삭제한다. 

→ 개발자가 직접 제작하여 업로드한다. 

## A-7. `UserSignal.action` enum이 문서마다 다름

| 출처 | 값 |
| --- | --- |
| `player.md` 6 | play, complete, skip, **seek, rate_change** |
| `explore.md` 6 | play, complete, skip, save, unsave, **share** |
| `drip-scheduling.md` 6 | play, complete, skip, save, unsave, **delete, replay** |

합집합 10종. 그런데 `seek`·`rate_change`는 추천 스코어링(`drip-scheduling.md` 4.3)에서 쓰이지 않는다. 추천 입력과 분석 로그가 한 테이블에 섞여 있다.
추가로 `library.md` 4.3의 **“수동 완료 표시는 완청과 구분해서 기록한다”** 에 해당하는 값이 어느 enum에도 없다.

| 선택지 | 내용 |
| --- | --- |
| **(a) 권고** | `UserSignal`은 **추천에 쓰이는 것만**: `play, complete, manual_complete, skip, save, unsave, delete, replay`. `seek`·`rate_change`·`share`는 로그로만 남기고 테이블에 넣지 않는다 |
| **(b)** | 전부 한 테이블에 넣고 스코어링에서 필터 |

> **권고: (a)** — `manual_complete`를 추가한다.
> 

→ 수동 완료 기능 자체를 삭제한다.

→ 테이블은 권고 사항대로 진행한다.

---

# 🟡 B급 — 정리하지 않으면 중복·불일치가 남음

## B-1. 사용자 설정이 4개 테이블로 쪼개져 있음

`UserPlayerSetting`(배속) / `UserInterestSetting`(자동확장) / `NotificationSetting`(드립알림) / `UserOfflineSetting`(네트워크 정책) — 전부 `user_id` 1:1.

> **권고: `UserSetting` 하나로 통합.** 설정 항목은 앞으로 계속 늘어나는데 그때마다 테이블을 만들 수 없다.
단 `NotificationSetting.os_permission_granted`는 **user가 아니라 device 단위 값**이므로 `DeviceToken`에만 둔다(현재 `settings.md`와 `notification.md` 양쪽에 중복).
> 

→ 권고사항대로 진행한다.

## B-2. `Session`에 `user_id`가 없음

`auth.md` 6의 `Session { refresh_token_hash, device_id, issued_at, expires_at, revoked_at }` — 누구의 세션인지 식별할 컬럼이 빠져 있다. 단순 누락으로 보인다.

> **권고: `user_id` 추가.** 확인만 필요.
> 

→ 권고사항대로 진행한다.

## B-3. `WithdrawnContent`가 별도 테이블로 두 문서에 중복 정의

`partner-control.md` 6과 `offline-download.md` 6에 각각 `WithdrawnContent { content_id, withdrawn_at }`.
그런데 `Content`에 이미 `status = withdrawn`과 `withdrawn_at`이 있다.

> **권고: 별도 테이블을 만들지 않는다.** 클라이언트 동기화는 `GET /contents/withdrawn?since=<timestamp>`로 `Content`에서 조회한다.
> 

→ 권고사항대로 진행한다.

## B-4. `AudioAccessToken` vs `AudioAccessLog` — 같은 것

| 출처 | 정의 |
| --- | --- |
| `player.md` 6 | `AudioAccessToken { content_id, user_id, signed_url, expires_at, issued_at }` |
| `partner-control.md` 6 | `AudioAccessLog { content_id, user_id, device_id, issued_at, expires_at, ip_hash }` |

> **권고: `AudioAccessLog` 하나로 통합하고 `signed_url`은 저장하지 않는다.**
서명 URL을 DB에 남기면 그 자체가 유출 경로가 된다(`architecture.md` 9.4, `convention.md` 8.4의 로그 금지 항목과 동일한 이유). 발급 사실만 기록한다.
> 

→ 권고사항대로 진행한다.

## B-5. `Content` 필드가 문서 간 불일치

| 필드 | `library.md` | `content-pipeline.md` | 판단 |
| --- | --- | --- | --- |
| 오디오 경로 | `audio_url` | `audio_path` | **`audio_path`가 맞다.** URL은 매 요청 서명 발급이므로 컬럼이 아니라 응답 DTO 필드 |
| `content_version` | 없음 | 있음 | **필요하다.** `player.md` 7의 “재발행 시 저장 위치 폐기” 판정에 쓰임 |
| `series_id` / `episode_no` | 없음 | `Episode`에만 있음 | **`Content`에 비정규화 필요.** `drip-scheduling.md` 4.2 시리즈 연속성 스코어링과 7장 “`episode_no` 순서를 지킨다”가 Content 단위 조회를 요구함 |
| `source_name` | 있음 | 있음 | 정의 필요 — 파트너명인가, 원문 매체명인가? `Partner.name`과 다른 값인지 확인 |

> **권고: 위 판단대로.** `source_name`의 의미만 결정해달라.
> 

→ 권고사항대로 진행한다.

→ source_name은 파트너명이 들어간다.

## B-6. `ContentStat`의 `period` 정의가 없음

`explore.md`는 `{play_count, complete_count, save_count, period}`, `drip-scheduling.md`는 `complete_rate` 추가. `period`가 일/주/월/전체 중 무엇인지, PK가 `(content_id, period)`인지 명시가 없다. `partner-control.md`의 `PartnerReport`와 내용이 거의 같다.

> **권고: `ContentStat { content_id, period_type: enum(day|week|month|all), period_date, ... }` PK `(content_id, period_type, period_date)`.**`PartnerReport`는 별도 테이블로 만들지 말고 `ContentStat` 집계 + `Content.partner_id` 필터로 산출한다. 단 `source_link_click_count`(원문 유입, FR-34 핵심 지표)를 `ContentStat`에 추가해야 한다.
> 

→ period는 week/month/all 3가지로 구분해서 권고사항대로 진행한다.

→ 갱신 기준은 week → 매주 월요일 04시, month → 매달 1일 04시 

→ ex). 5월이라면 4월에 측정한 데이터로 순위를 보여준다.

## B-7. `Topic.content_count` / `is_visible`의 갱신 주체가 없음

`onboarding.md` 4는 “콘텐츠가 0건인 주제는 목록에서 제외”, `interest-management.md` 7은 “콘텐츠가 다시 생기면 자동으로 되살아난다”고 규정하는데, 이 값을 **언제 누가 갱신하는지** 어느 문서에도 없다.

| 선택지 | 내용 |
| --- | --- |
| **(a)** | 발행·회수 시점에 즉시 갱신 |
| **(b) 권고** | 컬럼을 두지 않고 조회 시 집계 + 캐시 |

→ 특정 주제의 콘텐츠를 다 소비했더라도 목록에서 제외시키지 않는다.

→ 특정 주제에 포함된 콘텐츠가 0건이라면 is_visible을 false로 설정한다.

→ 주제 추가 및 삭제는 관리자가 관리자 페이지에서 진행한다.

→ 주제를 보여줄지 안보여줄지 자체도 관리자 페이지에서 관리한다.

## B-8. 로그성 테이블이 8개

`WithdrawalLog`, `InterestChangeLog`, `PaywallEvent`, `NotificationLog`, `StoreNotificationLog`, `PipelineRun`, `DripBatchRun`, `AuditLog`.

전부 DB 테이블로 만들면 관리 대상이 급증한다. `convention.md` 8.3의 로깅 규칙과 역할이 겹치는 것도 있다.

> **권고: 세 부류로 나눈다.**
- **DB 필수(감사·법적 근거)**: `AuditLog`(파트너 통제·결제), `WithdrawalLog`(법령), `StoreNotificationLog`(결제 재처리 근거)
- **DB 필요(운영 조회)**: `PipelineRun`, `DripBatchRun`, `NotificationLog`(중복 발송 방지에 필요)
- **구조화 로그로 충분**: `InterestChangeLog`, `PaywallEvent` → 테이블 대신 로그 + 분석 도구
> 

→ 권고사항대로 진행한다.

---

# 🟢 C급 — 확인만 필요

| # | 항목 | 확인 사항 |
| --- | --- | --- |
| C-1 | `ContentScript` | `player.md`·`content-pipeline.md` 정의 동일. 소유 모듈만 `content`로 확정하면 됨 |
| C-2 | `UserCareer` | `User`에 합치지 않고 별도 테이블 유지 권고(전 필드 선택 입력) |
| C-3 | `Consent` | 약관 버전 이력이 필요하므로 별도 테이블 유지. `user_id` 1:N(버전마다 행) |
| C-4 | `PlaybackProgress` 삭제 시점 | 라이브러리 삭제 시 남긴다(A-1). 회원 탈퇴 시 삭제(`auth.md` 4.3) |
| C-5 | `Partner.status` | 값 목록 미정의 → `active \| suspended \| terminated` 제안 |
| C-6 | `Episode` ↔︎ `Content` | 1:1인지 확인. 분할 시 Episode N개 → Content N개이므로 1:1로 보임 |

→ C-2 : User에 UserCareer를 합친다.

→ 나머지는 권고사항대로 진행한다.

---

# 🔴 PRD 미확정 4건 — 스키마에 직접 영향

`docs/pages/README.md`가 이미 지목한 항목이다. 아래는 **각각이 테이블에 어떤 영향을 주는지**만 정리했다.

| # | 항목 | 스키마 영향 |
| --- | --- | --- |
| 1 | **티어 명칭** — PRD 4.1 “베이직/프로” vs FR-28 “라이트/데일리/프로” | `User.tier`·`Plan.tier`·`Subscription.tier` enum 값. **셋 다 같은 값 집합을 써야 한다.** 값을 바꾸면 마이그레이션 + 이미 저장된 데이터 변환 |
| 2 | **오프라인 저장 P0 여부** — FR-26(P0) vs PRD 4.2(이연) | `OfflineDownloadRecord` 테이블과 `Plan.offline_download_enabled` 컬럼의 존재 여부. 이연이면 지금 만들지 않는다 |
| 3 | **무료 티어 온보딩 초기 적립** — PRD 4.1 “드립 없음” vs `onboarding.md` 4 잠정안 | 테이블 변경은 없으나 `LibraryItem.source`에 `onboarding` 값을 유지할지 결정 |
| 4 | **드립 편수** — PRD 1.3 “하루 2편” vs FR-14 “시범 운영 후 결정” | `Plan.daily_drip_count` 컬럼 필요 여부. **현재 어느 명세에도 이 컬럼이 없다** — `drip-scheduling.md`는 “서버 설정값”이라고만 함. Plan에 넣을지 별도 설정 테이블로 뺄지 결정 필요 |

추가로 `subscription.md` 미결 사항의 **“라이트·데일리 티어의 오프라인 저장 허용 여부”** 도 `Plan` 컬럼 값에 직접 영향을 준다.

→ 1. light(=무료티어)daily/pro 3가지 티어로 진행한다.

→ 2. P1으로 진행한다. (고도화 과정에서 제작)

→ 3. 무료티어도 온보딩 초기 적립 및 자동 드립이 가능하다.

→ 4. 무료만 하루 2편 고정 확정. 유료는 시범 운영 후 가격 및 범위 결정 예정

---