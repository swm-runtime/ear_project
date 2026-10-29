# 단기 실험 API 계약 (2026-10-29)

단기 실험 8종(2026-10-29 확정) 중 **다른 파트와 계약이 필요한 것**만 모은 HTTP 계약이다. 실험 기간 동안 이 문서가 기준이고, 통합 때 각 화면 문서(`onboarding-api.md` · `player-api.md` · `explore-api.md` · `content-detail-api.md` · `library-api.md`)와 `features/common-error-handling.md`로 옮긴다(`changes/pending/exp-contracts.md`).

| 절 | 실험 | BE 티켓 | 이 계약을 기다리는 티켓 |
|---|---|---|---|
| 4.1 | ⑧ 온보딩 완료 후 플레이어 띄우기 | KAN-292 | KAN-295 (FE) |
| 4.2 | ⑤ 시리즈 유료화 — 4편부터 프로 전용 | KAN-290 | KAN-294 (FE) |
| 4.3 | ④ 짧은 판 코호트 — 가입 시점으로 노출 분리 | KAN-298 | 없음(앱 변경 없음) · 업로드 필드는 파이프라인(KAN-296) |
| 4.4 | ① 구독 가격 인하 — 할인 표시(정가 취소선 + "지금 할인 중") | KAN-286 | FE 티켓(발행 예정) |
| 4.5 | ④ 짧은 판·도입부 — 실험 지표 조회 `GET /admin/insights/short-variant` | KAN-298 · KAN-296 | 없음(관리자 콘솔 "실험 지표" 탭 — 같은 PR) |
| 4.6 | ③-1 도착 알림 시각 — 실험 지표 조회 `GET /admin/insights/drip-arrival-time` | KAN-289 | 없음(관리자 콘솔 "실험 지표" 탭 — 같은 PR) |

판정은 서버가 한다 — 앱은 서버가 준 값(`first_content_id`, `is_locked`, 에러 코드)으로만 그린다. 티어명으로 분기하지 않는다(루트 `CLAUDE.md`).

---

## 4.1 `GET /onboarding/first-drip` — `first_content_id` 추가 (KAN-292 ↔ KAN-295)

온보딩이 끝나면 앱이 첫 콘텐츠를 **멈춘 플레이어**로 연다(KAN-295 결정 — 자동재생하지 않는다). 앱은 첫 드립이 무엇을 담았는지 모르므로 서버가 열 편을 정해 준다.

**Response 200** — 기존 필드(`onboarding-api.md` 4.8)에 하나를 더한다

```json
{
  "status": "completed",
  "library_item_count": 2,
  "completed_at": "2026-10-29T09:12:03Z",
  "first_content_id": "6c0f0f1e-2c2a-4a0e-9f3b-6a9d6c1c2b11"
}
```

| 필드 | 타입 | 비고 |
|---|---|---|
| `first_content_id` | uuid \| null | 온보딩 직후 열 콘텐츠. **`status = completed`일 때만 값이 있다** — `pending` · `no_candidates` · `queued`면 `null` |

**어떤 편을 주나 (서버 규칙)**

- 첫 드립이 적립한 편(라이브러리 `source = drip`, 첫 드립 완료 시각에 적립된 행) 중에서 고른다.
- **길이가 짧은 편 먼저**, 같으면 콘텐츠 id 순. 근거: 길이가 5분 늘 때 완청 오즈가 0.62배(실험 지표 탭 "길이별 완청률", 2026-10-28) — 첫 편은 끝까지 들을 가능성이 높은 쪽을 연다.
- 사용자가 그 사이 지웠거나(소프트 삭제) 이미 재생한 편은 건너뛴다. 남은 편이 없으면 `null`.
- 콘텐츠가 회수·만료됐으면 건너뛴다.

**클라이언트 동작**

| 응답 | 동작 |
|---|---|
| `status = completed` · `first_content_id` 있음 | 그 콘텐츠의 플레이어를 **멈춘 상태**로 연다(알림 탭과 같은 경로 — 차감 확인은 ▶ 때) |
| `status = completed` · `first_content_id = null` | 지금처럼 탐색 탭 |
| `no_candidates` · `queued` · 대기 상한 초과 | 지금처럼 탐색 탭 |

- 이 필드는 **열 편의 제안**이지 재생 허가가 아니다. 재생 판정은 ▶ 때 `POST /contents/:id/play`가 한다(한도·잠금 포함).
- 옛 서버(필드 없음)는 `null`과 같이 다룬다.

---

## 4.2 시리즈 유료화 — 4편부터 프로 전용 (KAN-290 ↔ KAN-294)

### 4.2-1 판정 규칙 (서버)

- **잠긴 편** = 시리즈 편(`contents.series_id` 있음)이고 `episode_no > 무료 편수(3)`인 편. 모든 시리즈(글로벌 포함)가 대상이다.
- **열리는 사람** = 유효 티어(`resolveEffectiveTier` — 초대 코드 Pro 포함)가 **pro** 이거나, **가입 체험 중(trial)** 인 사용자.
- 그 밖(무료·데일리)은 잠긴다. 이미 4편 이후를 듣던 사용자도 예외 없이 잠긴다(KAN-290 결정).
- 무료 편수는 서버 설정 하나(`SERIES_FREE_EPISODES`, 기본 3)다. 시리즈별로 다르게 두지 않는다.
- 서버 스위치 `SERIES_PAYWALL_ENABLED`가 `true`일 때만 잠근다. 꺼져 있으면 모든 `is_locked = false`이고 4.2-3 에러도 나지 않는다 — **앱은 스위치를 몰라도 된다**(필드만 본다).

### 4.2-2 응답 필드 `is_locked`

앱이 재생 버튼을 그리는 **모든 콘텐츠 객체**에 붙인다. 사용자마다 값이 다르다(같은 편이라도 프로에게는 `false`).

| 필드 | 타입 | 비고 |
|---|---|---|
| `is_locked` | boolean | `true`면 이 사용자는 이 편을 재생할 수 없다. 잠금 아이콘·차단 시트를 그린다 |

붙는 곳:

| 엔드포인트 | 위치 |
|---|---|
| `GET /explore/feed` · `GET /explore/contents` · `GET /explore/popular` · `GET /explore/search` | 콘텐츠 카드마다 |
| `GET /series/:series_id` | 편 목록 항목마다 |
| `GET /contents/:content_id` | 상세 최상위 |
| `GET /contents/:content_id/related` | 항목마다 |
| `GET /users/me/library-items`(라이브러리 목록) | 항목의 콘텐츠마다 |

- 시리즈가 아닌 콘텐츠·1~3편은 늘 `false`다.
- 옛 서버(필드 없음)는 `false`로 다룬다.

### 4.2-3 재생 거절 — 새 에러 코드 `SERIES_EPISODE_LOCKED`

잠긴 편을 재생하려 하면 **같은 판정 함수**(재생 게이트)가 거절한다 — 오디오 URL·재생 시작·대본이 같은 판정이다.

| 엔드포인트 | 거절 |
|---|---|
| `POST /contents/:content_id/audio-urls` (`player-api.md` 4.1) | 403 `SERIES_EPISODE_LOCKED` |
| `POST /contents/:content_id/play` (4.2) | 403 `SERIES_EPISODE_LOCKED` |
| `POST /contents/:content_id/replay` (4.4) | 403 `SERIES_EPISODE_LOCKED` |
| `GET /contents/:content_id/script` (4.7) | 403 `SERIES_EPISODE_LOCKED` |

```json
{
  "error_code": "SERIES_EPISODE_LOCKED",
  "message": "이 편은 프로 구독에서 들을 수 있어요",
  "retryable": false
}
```

| 코드 | HTTP | retryable | 클라이언트 동작 |
|---|---|---|---|
| `SERIES_EPISODE_LOCKED` | 403 | false | **잠금 차단 시트**(카피는 `spec/uiux` — KAN-294). 플레이어를 열었으면 닫는다. 구독 화면으로 이어 준다 |

- **재생 횟수를 차감하지 않는다.** 재생 한도 판정(`PLAY_LIMIT_*`)보다 먼저 본다 — 잠긴 편에 한도 시트가 뜨지 않는다.
- 잠금과 한도가 둘 다 해당하면 `SERIES_EPISODE_LOCKED`가 이긴다.
- `is_locked`를 보고 앱이 미리 막아도, 서버는 요청이 오면 다시 판정한다(앱 값은 표시용).

### 4.2-4 편성·알림 (앱 변경 없음, 참고)

- 드립 시리즈 연속 편은 잠긴 편을 비프로 사용자에게 넣지 않는다 — 3편을 완청해도 4편이 드립으로 오지 않는다.
- 리텐션 알림 "듣던 콘텐츠"는 잠긴 편을 고르지 않는다.

---

## 4.3 짧은 판 코호트 — 가입 시점으로 노출 분리 (KAN-298 · 파이프라인 KAN-296)

기존 발행 편(단편·시리즈)의 주제를 재활용해 5~12분으로 다시 만든 **짧은 판**(`length_profile = short`)을, 새 앱 배포 뒤 가입한 사용자에게만 노출한다. 기존 사용자는 기존 편(`standard`)만 본다. **앱 계약 변화는 없다** — 앱은 서버가 준 목록을 그대로 그리고 코호트를 모른다. 이 절은 업로드 계약(파이프라인)과 서버 규칙을 적는다.

### 4.3-1 코호트 판정 (서버 한 곳)

- 가입 시각(`users.created_at`)이 서버 설정 `SHORT_CONTENT_COHORT_SINCE`(ISO 8601 + 오프셋, 예 `2026-11-05T10:00:00+09:00`) **이상**이면 `short` 코호트, 아니면 `standard`.
- **설정이 비면 전원 `standard`** — 롤백 스위치다. 짧은 판은 아무에게도 노출되지 않는다. 값은 새 앱의 스토어 배포 시각으로 운영이 넣는다.
- 판정은 `ContentCohortService`(규칙은 `content-cohort.policy.ts`) 한 곳이다. 요청 경로는 access token의 가입 시각 클레임(`signed_up_at`, ms)으로, 배치는 `users.created_at`으로 같은 함수를 부른다. 클레임이 없는 옛 토큰은 `standard`다(이 기능 배포 전 발급 = 배포 전 가입자).
- 클레임은 코호트가 아니라 **가입 시각**이라, 설정을 비우는 롤백이 토큰 수명을 기다리지 않고 바로 먹는다.

### 4.3-2 노출 분리

`short` 코호트에는 `length_profile = short`인 단편·시리즈 편만, `standard` 코호트에는 `standard`만 나간다. **폴백 없음** — 짧은 판이 없는 주제는 그 코호트에게 비어 있다(재고는 배포 전에 채운다).

| 걸리는 곳 | 비고 |
|---|---|
| 첫 드립(`first-drip`) | 관심 주제 후보와 인기 대체 편성 모두 같은 프로필 안에서 |
| 일일 드립 정규·탐험 편성 | 후보 SQL(`findCandidates`)에서 거른다 |
| 시리즈 연속 편 | 연속 편은 위 후보 풀에서 나온다. 시리즈 편은 시리즈와 같은 프로필이다(업로드가 맞춘다) |
| 리텐션 알림 "듣던 콘텐츠" | 같은 프로필의 진행 중 편만 고른다 |
| 탐색 피드·주제 목록·인기·새로 나온 | |
| 검색(키워드·의미·교정어 어휘·빈 결과 인기 대체) | |
| 관련 콘텐츠(`GET /contents/:id/related`) · 온보딩 추천 | 기준 편은 막지 않고 후보만 거른다 |
| 시리즈 목록(탐색 시리즈 카드 · 같은 간행물의 다른 시리즈) | |

**막지 않는 곳** — 이미 손에 든 콘텐츠다. 노출 실험이지 접근 제한이 아니다: 라이브러리 목록, 공유 링크로 연 콘텐츠 상세(`GET /contents/:id`), 시리즈 화면(`GET /series/:id`), 재생·서명 URL·대본·담기. 재생 거절 에러는 없다.

### 4.3-3 업로드 필드 (파이프라인)

`POST /admin/contents` payload — `length_profile`(`"standard"` | `"short"`, 생략 시 단편은 standard · 시리즈 편은 시리즈의 값), `variant_of_content_id`(원본 콘텐츠 id — **short 단편이면 필수**, 짧은 시리즈의 편이면 원본 시리즈의 같은 화 · 없으면 생략, standard면 넣지 않는다). `POST /admin/series` — `length_profile`, `variant_of_series_id`(short면 필수). 원본이 없거나 이미 short면 400 `VALIDATION_FAILED`(`details.field` = 그 칸), 시리즈 편의 `length_profile`이 시리즈와 다르면 400(`length_profile`). 재발행(`PATCH`)은 두 칸을 받지 않는다. 상세 표는 `changes/pending/exp-short-variant-cohort.md`.

- 파이프라인 `upload-meta.json`의 `remake_of_content_ref`(원본 제품 content_id)는 업로드 payload에서 **`variant_of_content_id`** 로 보낸다.

### 4.3-4 도입부 버전 `intro_version` (지표 전용, 2026-10-29 범위 추가)

짧은 판은 길이와 함께 새 도입부(훅)를 쓴다. 나중에 standard 편에도 새 도입부가 들어갈 수 있어, `length_profile`만으로는 초반 이탈의 원인(길이인가 도입부인가)을 가를 수 없다 — 그래서 도입부를 따로 기록한다.

| 항목 | 값 |
|---|---|
| 칸 | `contents.intro_version` — 문자열, NULL 허용(기본값 없음) |
| NULL | **기존 도입부** — 이 칸 이전에 발행한 전부, 그리고 값을 보내지 않은 업로드 |
| 업로드 | `POST /admin/contents` payload `intro_version`(선택). 값 이름은 파이프라인이 정한다(예 `hook-v2`) |
| 검증 | 32자 이하 · `^[a-z0-9][a-z0-9._-]{0,31}$`(소문자·숫자로 시작, 소문자·숫자·`.`·`_`·`-`). 어기면 400 `VALIDATION_FAILED`. DB CHECK `ck_contents_intro_version`도 같은 식 |
| 재발행 | `PATCH`는 이 칸을 받지 않는다(보내면 모르는 필드 400) — **기존 값 유지**, `length_profile`과 같은 규칙. 바꾸려면 회수하고 새로 올린다 |
| 쓰임 | **지표 전용.** 실험 지표 탭이 초반 이탈(10초·30초·1분)을 이 값으로 묶는다. **노출 규칙은 `length_profile`만 본다** — 이 칸으로 거르지 않는다 |
| 응답 | 사용자 응답에 싣지 않는다. 관리자 `AdminContentItem`·감사 로그 `content.upload` `after`에만 있다 |

- 파이프라인은 `UploadPayload`에 `intro_version`을 실어 보낸다(KAN-296). 보내지 않으면 기존 도입부로 집계된다.

---

## 4.4 `GET /plans` — 정가·할인 표시 필드 추가 (KAN-286 ↔ FE 티켓 발행 예정)

스토어 가격을 실제로 내렸다(2026-10-29 — daily 3,900 → 1,900원 · pro 9,900 → 3,900원, `plans.price_krw`도 같은 값). 앱은 이를 **할인처럼** 보여 준다: ~~3,900원~~ **1,900원** + "지금 할인 중". **종료일은 표시하지 않는다**(종료일 미정). 앱은 스토어 `displayPrice`만 알고 정가를 모르므로 **정가와 할인 여부를 서버가 준다.** 실험을 끝낼 때 앱 배포 없이 끌 수 있도록 표시 여부는 서버 스위치로 둔다.

**Response 200** — 기존 요금제 항목(`subscription-api.md` 4.1)에 필드 둘을 더한다

```json
{
  "plans": [
    { "tier": "light", "price_krw": 0, "is_free": true, "original_price_krw": null, "is_discounted": false, "...": "..." },
    { "tier": "daily", "price_krw": 1900, "is_free": false, "original_price_krw": 3900, "is_discounted": true, "...": "..." },
    { "tier": "pro", "price_krw": 3900, "is_free": false, "original_price_krw": 9900, "is_discounted": true, "...": "..." }
  ],
  "is_email_verified": true
}
```

| 필드 | 타입 | 비고 |
|---|---|---|
| `original_price_krw` | number \| null | 취소선으로 그릴 정가(원). **`is_discounted = true`일 때만 값이 있다** — 아니면 `null` |
| `is_discounted` | boolean | 정가 취소선 + "지금 할인 중"을 그리는가. **서버 판정** |

**판정 규칙 (서버)**

- `is_discounted = true` ⇔ 서버 스위치가 켜져 있고 · 유료 요금제이고(`is_free = false`) · 그 티어에 설정된 정가가 있고 · 정가 **>** `price_krw`. 이때 `original_price_krw` = 설정된 정가.
- 그 밖은 전부 `is_discounted = false` · `original_price_krw = null`. 무료(light) 요금제는 언제나 `false`/`null`.
- 정가가 `price_krw` 이하이면(가격을 되돌리고 설정을 안 지운 경우) 할인이 아니다.
- 시장·플랫폼·구독 상태와 무관하다. 스키마 변경 없음 — 설정은 서버 env다.

| env 키 | 값 | 비고 |
|---|---|---|
| `PLAN_DISCOUNT_DISPLAY_ENABLED` | `true` / `false` / 빈 값 | **정확히 `true`일 때만 켜진다.** 기본 꺼짐 |
| `PLAN_DISCOUNT_ORIGINAL_PRICE_DAILY_KRW` | 양의 정수 / 빈 값 | daily 정가. 비우면 정가 없음 → 할인 아님. 실험 값 `3900` |
| `PLAN_DISCOUNT_ORIGINAL_PRICE_PRO_KRW` | 양의 정수 / 빈 값 | pro 정가. 실험 값 `9900` |

값을 바꾸면 API를 다시 띄운다(다른 서버 스위치와 같다). 앱 배포는 필요 없다.

**클라이언트 동작**

| 응답 | 동작 |
|---|---|
| `is_discounted = true` | 스토어 `displayPrice` 옆에 `original_price_krw`를 원화 형식으로 **취소선** 표시 + "지금 할인 중" 배지. 정확한 카피·배치는 `spec/uiux`(FE 티켓) 소관 |
| `is_discounted = false` | 지금처럼 `displayPrice`만 |
| 옛 서버(필드 없음) | `false`와 같이 다룬다 — 할인 UI 없음 |

- **취소선 정가는 서버가 소유한 참고값이다.** 결제되는 가격은 언제나 스토어 가격이다(`displayPrice`). 앱이 `price_krw`·`original_price_krw`로 할인율을 계산하거나 결제 가격을 그리지 않는다.
- 할인 여부를 티어명이나 기기 시각으로 판정하지 않는다(루트 `CLAUDE.md`). 종료일을 추정해 표시하지 않는다.

---

## 4.5 `GET /admin/insights/short-variant` — 짧은 판·도입부 실험 지표 (KAN-298 · KAN-296, 2026-10-29)

4.3의 실험을 읽는 관리자 조회다. **기존 판 vs 짧은 판 완청률**과 **기존 도입부 vs 바뀐 도입부의 10초·30초·1분 이탈률**을 낸다. 관리자 전용(`JwtAuthGuard` + `AdminRoleGuard`, 아니면 403), 읽기 전용, `Cache-Control: no-store`. 집계뿐이다 — 사용자는 수로만 들어 있고 `user_id`·이름·이메일은 없다. 로그 콘솔 "실험 지표" 탭이 열 때 1회 + [새로고침]으로 읽는다.

**요청** — `market` `kr` | `global` | 없음(전부). **콘텐츠 시장**(`contents.market`)으로 거른다. 모르는 값은 400 `VALIDATION_FAILED`.

**정의**

| 항목 | 정의 |
|---|---|
| 단위 | (사용자, 편) |
| 시작 | 0초가 아닌 재생 행(`play_records.listened_sec > 0`)이 있고, 첫 재생이 24시간(`SHORT_VARIANT_MIN_AGE_HOURS` = 길이별 완청률과 같은 값) 전 |
| 완청 | 공용 정의(`domain.md` 6장) — 라이브러리 `completed` · 최대 도달 ≥ 길이 × 90% · 완청 신호 중 하나 |
| 초반 이탈 | 그 (사용자, 편)의 청취 합(`listened_sec` 합)이 10 · 30 · 60초 이하. 비율의 분모는 시작자 |
| 첫 편 | 그 사용자가 처음 0초 아닌 재생을 한 편(시장·시점 무관). **`excluding_first`** = 이 편을 뺀 값 — 같은 날 시작한 다른 실험(첫 드립 무작위 · 온보딩 뒤 플레이어)이 첫 편 행동을 바꾸기 때문이다 |
| 가입 코호트 | 4.3-1 판정(`content-cohort.policy.ts`의 SQL판)을 그대로 쓴다. 경계 뒤 가입 = `short`, 전 = `standard`. 비교를 맞추려고 **`standard`는 경계 직전 같은 길이 창(지금 − 경계) 안 가입자만**, 두 코호트 모두 **가입 뒤 그 길이 안에 시작한 편만** 센다. 창 밖 가입자는 코호트 비교에서 빠지고 콘텐츠 단위 비교에는 들어간다 |
| 경계 미설정 | `SHORT_CONTENT_COHORT_SINCE`가 비면 `cohort_since`·`cohort_window_hours`·`by_cohort`가 null. 콘텐츠 단위 비교만 나온다 |

**Response 200**

```jsonc
{
  "generated_at": "2026-10-29T09:00:00.000Z",
  "market": null,                    // 요청값, 없으면 null
  "min_age_hours": 24,
  "min_sample": 20,                  // 시작자가 이보다 적은 행은 콘솔이 "표본 작음"으로 표시
  "drop_thresholds_sec": [10, 30, 60],
  "cohort_since": "2026-11-05T01:00:00.000Z",   // null = 경계 미설정
  "cohort_window_hours": 192.0,                 // 지금 − 경계(경계가 미래면 0). 경계가 없으면 null
  "by_cohort": [                                // 경계가 없으면 null. 늘 standard · short 두 행
    { "key": "standard", "all": Metrics, "excluding_first": Metrics },
    { "key": "short", "all": Metrics, "excluding_first": Metrics }
  ],
  "by_length_profile": [ { "key": "standard", ... }, { "key": "short", ... } ],   // 늘 두 행
  "by_intro_version": [ { "key": null, ... }, { "key": "hook-v2", ... } ],        // null(기존 도입부) 먼저, 나머지 이름 순
  "pairs": [                                    // variant_of_content_id 가 있는 short 편 — 짧은 판 시작자 많은 순
    {
      "short":    { "content_id": "…", "title": "…", "duration_sec": 420, "intro_version": "hook-v2", "all": Metrics, "excluding_first": Metrics },
      "original": { "content_id": "…", "title": "…", "duration_sec": 900, "intro_version": null, "all": Metrics, "excluding_first": Metrics }
    }
  ]
}
```

`Metrics` = `{ starters, completers, completion_rate, drop_10s, drop_30s, drop_60s, rate_10s, rate_30s, rate_60s }` — 비율은 시작자가 0이면 `null`(0%와 "잴 사람이 없다"를 구분).

- 콘텐츠 단위 묶음(`by_length_profile` · `by_intro_version` · `pairs`)은 코호트와 무관하게 전 사용자 값이다. 짝은 상태를 따지지 않는다(회수된 편도 지난 재생은 남는다). `market`은 짧은 판의 시장으로 거른다.
- **한계** — 코호트 비교는 같은 날 시작한 다른 실험과 섞인다(위 "첫 편"). 짝 비교도 두 편을 듣는 사람(코호트)이 달라 사람 차이가 남는다. 인과 판정이 아니라 방향 확인용이다.

---

## 4.6 `GET /admin/insights/drip-arrival-time` — 도착 알림 시각 실험 지표 (KAN-289, 2026-10-30)

드립 도착 알림 시각 A/B(`DRIP_ARRIVAL_AB_ENABLED` — A 07:30 · B 08:00, 꺼지면 전원 07:00)를 읽는 관리자 조회다. **재생률만** 낸다 — 앱이 알림 탭을 서버에 알리지 않아 `notification_logs.opened_at`이 비어 있으므로 클릭률(열람률)은 싣지 않는다. 관리자 전용(`JwtAuthGuard` + `AdminRoleGuard`, 아니면 403), 읽기 전용, `Cache-Control: no-store`. 집계뿐이다 — 사용자는 수로만 들어 있고 `user_id`·이름·이메일은 없다. 로그 콘솔 "실험 지표" 탭이 열 때 1회 + [새로고침]으로 읽는다.

**요청** — `days` 1~90(기본 14, 창 = 지금 − `days`) · `market` `kr` | `global` | 없음(통합). 시장은 **사용자의 지금 시장**(`users.market`)으로 거른다 — 요약(`admin-api.md` 4.22)의 알림 반응과 같다. 범위 밖·모르는 값은 400 `VALIDATION_FAILED`.

**정의**

| 항목 | 정의 |
|---|---|
| 대상 | 창 안에 **보낸**(`status = 'sent'`, `sent_at ≥ 창 시작`) 알림 |
| 묶음 | `baseline` 07:00 = `type = 'drip_arrival'`(스위치 꺼짐 기간) · `a` 07:30 = `drip_arrival.a` · `b` 08:00 = `drip_arrival.b` · `morning` 참고 행 = `retention.morning.*`(아침 알림 KAN-288 — 드립 없는 날에만 가서 **대상이 달라 A/B 비교가 아니다**) |
| 보낸 알림 · 받은 사람 | 행 수 · 서로 다른 `user_id` 수 |
| 2시간 재생 | 보낸 시각부터 2시간 안(`[sent_at, sent_at + 2h)`)에 그 사용자의 새 재생 행(`play_records.played_at`) 또는 재생 위치 저장(`playback_progresses.updated_at`)이 있다 — 알림 반응(`push_reactions`)과 같은 판정(쿼리 조각 하나를 함께 쓴다) |
| 당일 재생 | 같은 판정 · 보낸 시각부터 **그 서비스 날짜의 끝**까지(05:00 KST 경계, 전환 전 시각은 04:00 — `toServiceDayRange`) |
| 재생률 | 2시간 · 당일 각각 재생으로 이어진 알림 ÷ 보낸 알림. 보낸 알림이 0이면 `null` |
| 기간 | 묶음마다 `first_sent_at`·`last_sent_at`을 낸다. **07:00은 스위치를 켜기 전 기간이라 A·B와 기간이 다르다** — 요일·계절 차이가 섞인다 |

**Response 200**

```jsonc
{
  "generated_at": "2026-10-30T09:00:00.000Z",
  "market": null,                 // 요청값, 없으면 null
  "days": 14,
  "since": "2026-10-16T09:00:00.000Z",
  "min_sample": 100,              // 보낸 알림이 이보다 적은 행은 콘솔이 "표본 작음"으로 표시
  "reaction_window_hours": 2,
  "arms": [                       // 늘 네 행 · 이 순서
    { "key": "baseline", "send_time": "07:00", "reference": false, "sent": 600, "users": 540,
      "played_2h": 66, "played_same_day": 120, "play_rate_2h": 0.11, "play_rate_same_day": 0.2,
      "first_sent_at": "2026-10-16T22:00:03.000Z", "last_sent_at": "2026-10-29T22:00:05.000Z" },
    { "key": "a", "send_time": "07:30", "reference": false, "sent": 0, "users": 0, "played_2h": 0, "played_same_day": 0,
      "play_rate_2h": null, "play_rate_same_day": null, "first_sent_at": null, "last_sent_at": null },
    { "key": "b", "send_time": "08:00", "reference": false, ... },
    { "key": "morning", "send_time": "08:00", "reference": true, ... }
  ]
}
```

- `send_time`은 그룹 현지 시각(서버 정책값 `DRIP_ARRIVAL_SLOT_TIMES`)이다. 콘솔은 이 값을 그대로 표시한다.
- **한계** — 재생은 알림 탭이 아니라 "그 사이 들었다"로 역산한다(탭 없이 앱을 열어 들은 것도 든다). 07:00 기준선과 A·B는 기간이 달라 인과 판정이 아니라 방향 확인용이다. A·B끼리는 같은 기간·해시 분할이라 직접 비교할 수 있다.

---

## 미결 · 확인 필요

| 항목 | 상태 |
|---|---|
| 4.1 "짧은 편 먼저" 선정 | 이 문서에서 정했다 — 다르게 하려면 KAN-292 처리 기록에 남기고 이 절을 고친다 |
| 4.2 차단 시트 카피·잠금 아이콘 | `spec/uiux`(FE·KAN-294) 소관 |
| 4.2 탐색 피드에서 잠긴 편을 뺄지 보여 줄지 | 보여 준다(잠금 표시) — 유료 동기가 실험 목적이다. 바꾸려면 이 절을 고친다 |
| 4.3 `SHORT_CONTENT_COHORT_SINCE` 값 | 새 앱의 스토어 배포 시각으로 운영이 넣는다(KAN-298 미결 · 운영 반영 체크리스트 KAN-300) |
| 4.3 주제 칩·주제별 건수 | 코호트로 거르지 않는다 — 짧은 판이 없는 주제도 칩은 보이고 목록이 빈다(폴백 없음과 같은 결과). 재고를 채우는 것이 전제다 |
| 4.4 "지금 할인 중" 카피·취소선 배치 | `spec/uiux`(FE 티켓 — 발행 예정) 소관 |
| 4.4 할인 표시 기간 | **실험 기간 한정이다.** 인하 가격을 장기간 유지하면 정가가 사실상 사라져 "할인" 표시가 부당 할인 표시(표시·광고 관련 위험)가 될 수 있다 — 가격을 유지하기로 하면 스위치를 끄고(`PLAN_DISCOUNT_DISPLAY_ENABLED`) 이 표시를 없앤다 |
