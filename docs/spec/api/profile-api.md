# 프로필 API 명세서

> 기준 문서: [`docs/pages/profile.md`](../../pages/profile.md)
> 규약: [`docs/backend/convention.md`](../../backend/convention.md) 5장 · [`docs/backend/architecture.md`](../../backend/architecture.md) 7·9장
> 오류·재시도: [`docs/pages/common-error-handling.md`](../../pages/common-error-handling.md)
> 스키마: [`docs/backend/domain.md`](../../backend/domain.md) 3장 · 4장 · 8장

## 1. 범위

`profile.md`가 정의한 동작을 HTTP 계약으로 옮긴 문서다. 다루는 것은 **프로필 요약 조회 하나**다.

- 헤더(닉네임·제공자) + **3개 카드(현재 플랜 · 이메일 · 관심 주제 관리)** 를 **한 번의 요청**으로 받는다
- 카드별 **부분 실패**의 표현

> **FE 확정(2026-08-06): 프로필에 커리어 카드를 두지 않는다.** 커리어는 [관심 주제 관리] 카드로 들어간 **관심사 관리 화면에서 주제와 함께** 입력·수정한다. 따라서 이 API는 커리어 요약을 내려주지 않는다. `profile.md` 4.1(4개 카드)의 개정이 필요하다 — 9장 미결.

**프로필에서 직접 서버에 쓰는 값은 하나도 없다**(`profile.md` 1장). 따라서 이 문서에 변경(POST/PUT/PATCH/DELETE) 엔드포인트가 없다. 각 카드의 편집은 소유 화면의 API가 담당한다.

**다루지 않는 것** — 경계를 먼저 못 박는다.

| 대상 | 소유 문서 | 이 문서에서 하는 일 |
|---|---|---|
| 이메일 등록·인증·변경 | `auth-api.md` 4.8~4.11 | 현재 값(`email` · `is_email_verified`) **표시용 조회만** |
| 관심 주제·커리어 편집 | `interest-management.md` (API 명세 미작성) | 주제 요약 표시용 조회만. 커리어는 표시조차 하지 않는다(1장). 저장 규칙(최소 1·최대 3, 확인 팝업)에 관여하지 않는다 |
| 구독 변경·해지·복원·영수증 검증 | `subscription.md` (API 명세 미작성) | 현재 플랜 **표시용 조회만.** 프로필에 해지 버튼이 없다(`profile.md` 4.2) |
| 청취 통계 | — (PRD 비범위) | 응답에 담지 않는다 |

---

## 2. 공통 규약

| 항목 | 값 |
|---|---|
| Base URL | `/api/v1` |
| 인증 헤더 | `Authorization: Bearer <access_token>` — **인증 필요** |
| 요청·응답 필드 | **snake_case** |
| 시각 | **ISO 8601 UTC 문자열** |
| 추적 | 모든 응답에 `X-Trace-Id` |
| 멱등키 | 조회뿐이므로 **없다** |

---

## 3. 엔드포인트 목록

| # | 메서드 | 경로 | 설명 | 인증 | 멱등키 |
|---|---|---|---|---|---|
| 1 | GET | `/users/me/profile` | 프로필 요약 — 헤더 + 4개 카드를 한 번에 | 필요 | |

**설계 메모**

- **카드별로 API를 나누지 않는다**(`profile.md` 3장). 항목마다 따로 호출하면 카드가 제각각 늦게 채워져 화면이 계속 흔들리고, 네 값의 조회 시점이 어긋난다.
- **캐시를 두지 않는다.** 편집 화면에서 저장하고 돌아올 때마다 재조회한다(`profile.md` 4.4). 프로필 진입 빈도는 낮고 조회 비용은 단순 조인이라 캐시가 벌 것이 없다.
- **`users.tier` 캐시가 아니라 `subscriptions`를 기준으로 조립한다.** 티어의 진실의 원천은 `subscriptions`다(`domain.md` 8.2). 조회 시점에 두 값이 어긋나 있으면 `subscriptions` 기준으로 응답하고, 캐시 갱신은 `SubscriptionService`가 수행한다(`domain.md` 3.1 — 갱신 경로 한 곳).

---

## 4. 엔드포인트 상세

### 4.1 `GET /users/me/profile`

프로필 탭 진입·편집 후 복귀·당겨서 새로고침이 모두 이 하나를 호출한다.

**Request** — 파라미터 없음

**Response 200**

```json
{
  "user": {
    "nickname": "수현",
    "provider": "kakao",
    "email": "user@example.com",
    "is_email_verified": false
  },
  "plan": {
    "status": "subscribed",
    "tier": "pro",
    "plan_name": "프로",
    "daily_play_limit": null,
    "renews_at": "2026-09-01T00:00:00Z",
    "expires_at": null,
    "has_payment_issue": false
  },
  "interest_summary": {
    "count": 4,
    "top_topics": [
      { "id": "uuid", "name": "커리어" },
      { "id": "uuid", "name": "자기계발" },
      { "id": "uuid", "name": "경제" }
    ]
  },
  "failed_sections": []
}
```

**`user` — 표시 전용**

- `nickname` · `provider`는 헤더에 그대로 그린다. **편집 진입점이 없다** — 닉네임 편집·제공자 변경은 MVP 비범위다(`profile.md` 미결).
- `email`이 `null`이면 "등록되지 않음" 상태다. `email`이 있고 `is_email_verified = false`면 **"인증되지 않음" 배지** 상태다(`profile.md` 4.3). **두 값을 항상 함께 내려준다** — 한쪽만으로는 세 상태를 구분할 수 없다.

**`plan` — 화면 분기용으로 정규화한 값**

| `status` | 판정(서버) | 화면(`profile.md` 4.2) |
|---|---|---|
| `free` | 유효한 `subscriptions` 행 없음(행 자체가 없거나 `expired` · `refunded`뿐) | "무료 이용 중 · 하루 N편" + [구독 알아보기] |
| `subscribed` | `status = 'active'` 이고 `is_auto_renew = true` | 플랜명 + "다음 결제일 N월 N일"(`renews_at`) |
| `cancel_scheduled` | 해지 예약 — `is_auto_renew = false`이고 만료 전 | 플랜명 + "N월 N일까지 이용 가능"(`expires_at`) |
| `grace` | `status = 'grace'`(결제 실패 유예) | 플랜명 + "결제에 문제가 있어요" 경고 → `has_payment_issue = true` |

- **`subscriptions`의 raw `status` enum을 그대로 내려주지 않는다.** 화면이 필요한 것은 위 4분기뿐이고, raw 값을 내려주면 해지 예약 판정(`is_auto_renew` 조합)이 클라이언트마다 재작성된다 — 판정은 서버가 한다.
- `renews_at`과 `expires_at`은 **같은 `subscriptions.expires_at`에서 온 값이지만 의미가 달라 필드를 나눈다.** 자동 갱신이면 그 시각이 다음 결제일이고, 해지 예약이면 이용 종료일이다. 한 필드로 내려주면 화면이 `status`를 보고 라벨을 갈아 끼워야 한다.
- `status = free`일 때 `tier = "light"` · `plan_name` · `daily_play_limit`(무료 한도)을 채워 내려준다. **"하루 N편"의 N은 `plans.daily_play_limit` 값이다** — 2를 하드코딩하지 않는다(`paywall.md` 5장과 같은 규칙).
- `daily_play_limit`는 무료 카드의 문구 조립용이다. `null`은 무제한 티어(문구에 한도를 적지 않는다).

**`interest_summary`**

- `count`는 `user_interests`의 `is_active = true` 개수다. **관리자가 숨긴 주제(`topics.is_visible = false`)도 개수에 포함한다** — 편집 화면과 같은 기준을 써야 개수가 어긋나지 않는다(`profile.md` 7장 · `interest-management.md` 7장).
- `top_topics`는 **최대 3개**다. 나머지는 화면이 `+N`으로 접는다(`N = count - top_topics.length`). 정렬 기준은 `topics.display_order`다.
- 관심 주제가 0개면 `count: 0`, `top_topics: []`다(기존 초과 보유자가 전부 해제한 경우 등).

**커리어를 내려주지 않는다**

- 커리어 요약 카드가 없으므로(1장 — FE 확정) 이 응답에 커리어 필드가 없다. 커리어의 표시·입력·수정은 전부 관심사 관리 화면(`interest-management.md`) 소관이며, 그 화면이 자기 데이터를 직접 조회한다.
- [관심 주제 관리] 카드에 커리어 요약을 함께 표시할지는 미결이다(9장). 표시하기로 확정되면 그때 필드를 추가한다 — 쓰지 않는 값을 미리 내려주지 않는다.

**`failed_sections` — 부분 실패의 표현**

```json
{
  "user": { "...": "정상" },
  "plan": null,
  "interest_summary": { "...": "정상" },
  "failed_sections": ["plan"]
}
```

- **한 섹션의 조회 실패가 응답 전체를 5xx로 만들지 않는다.** `profile.md` 4.5·7장 — "구독 조회만 실패하면 플랜 카드만 에러로 두고 나머지는 정상 노출한다."
- 실패한 섹션은 `null` + `failed_sections`에 키를 담는다. 클라이언트는 그 카드에만 "정보를 불러올 수 없어요" + [다시 시도]를 그린다.
- **`null`과 "값이 없음"을 혼동하지 않도록 `failed_sections`가 반드시 함께 온다.** `user.email`이 `null`인 것(정상 — 미등록)과 섹션 조회가 실패한 것(섹션 자체가 `null` + `failed_sections`에 키 존재)은 다른 상태다.
- [다시 시도]는 **전체 재조회**다. 섹션별 부분 조회 파라미터를 두지 않는다 — 실패는 드문 경로이고, 부분 조회를 두면 조회 시점이 섹션마다 갈라진다.
- `user` 섹션(자기 계정 행)까지 실패하는 상황은 사실상 인증 실패이므로 이때는 요청 전체가 실패한다(401·5xx).

**에러** — 공통 규칙(401·429·5xx — `common-error-handling.md`) 외 고유 에러 없음. 화면 진입 조회이므로 실패 시 각 카드 에러 + 내비게이션 유지가 클라이언트 규칙이다(`profile.md` 4.5 — 화면 자체는 연다).

---

## 5. 에러 코드 표

이 문서 고유의 에러 코드는 없다. 401(세션 만료 → 갱신 후 재시도, 실패 시 시작 화면)·5xx(자동 재시도 후 에러 표시)는 `common-error-handling.md` 4.1~4.2를 따른다.

## 6. 흐름

```
프로필 탭 진입 ──> GET /users/me/profile ──> 4개 카드 렌더
   ├─ [⚙ 설정]        → 설정 화면 (settings-api.md)
   ├─ 플랜 카드        → 구독 관리 (subscription.md)
   ├─ 이메일 카드           → 이메일 인증 화면 (auth-api.md 4.8~4.11)
   └─ 관심 주제 관리 카드   → 관심사 관리 — 주제 + 커리어를 한 화면에서 (interest-management.md)

편집 화면에서 저장 후 복귀 ──> GET /users/me/profile 재조회 (전체 스켈레톤 없이 카드만 갱신)
편집 화면에서 [취소]로 복귀 ──> 재조회하지 않는다 (profile.md 7장)
```

- **이메일 인증에 성공하면 프로필로 복귀하며 재조회한다.** 검증 성공 전에는 서버 값이 바뀌지 않으므로(`auth.md` 4.4) 인증 중 이탈 시에는 재조회해도 기존 값이 그대로다.
- **다른 기기에서 구독을 바꾼 경우**도 진입 시 재조회로 흡수된다. 이 API는 항상 `subscriptions` 기준으로 조립하므로(3장 설계 메모) 별도 동기화 호출이 필요 없다.

## 7. 보안·검증 규칙

- **토큰의 `user_id`로만 조회한다.** 경로에 `userId`를 받지 않고 `me`를 쓴다(IDOR 방지 — `architecture.md` 9.2).
- **이메일 주소를 마스킹하지 않고 내려준다.** 본인 인증된 세션의 자기 정보이며, 마스킹하면 사용자가 어떤 주소가 등록돼 있는지 확인할 수 없어 변경 판단을 못 한다.
- 응답에 `provider_user_id` · 결제 영수증 · 토큰 등 내부 식별자를 담지 않는다. 화면에 필요한 값만 조립한다.

## 8. 데이터 모델

> 스키마는 [`domain.md`](../../backend/domain.md)가 유일한 기준이다. 이 문서에 컬럼을 중복 기재하지 않는다.

| 사용하는 것 | domain.md |
|---|---|
| `users` — 닉네임·제공자·`email` · `is_email_verified` · `tier`(캐시). **커리어 3필드는 조회하지 않는다**(카드 없음) | 3.1 |
| `subscriptions` — 플랜 상태 판정의 진실의 원천 | 8.2 |
| `plans` — 플랜명·`daily_play_limit` | 8.1 |
| `user_interests` — `is_active = true` 요약 | 4.2 |
| `topics` — 주제명·`display_order` | 4.1 |

- **프로필 전용 테이블·컬럼을 만들지 않는다**(`profile.md` 6장). 이 API는 기존 테이블의 조회 조립뿐이다.
- `ProfileSummary`는 응답 DTO다. 저장하지 않는다(`domain.md` 13.2).

## 9. 미결 사항

- **`plan.status` 정규화 enum의 소유** — 이 4분기(`free` / `subscribed` / `cancel_scheduled` / `grace`)는 설정 화면의 구독 요약(`settings-api.md`)과 구독 관리 화면도 그대로 쓰게 된다. `subscription.md`의 API 명세가 작성될 때 그쪽으로 소유를 옮기고 이 문서는 참조로 바꾼다.
- **`renews_at`의 정확성** — 다음 결제일을 `subscriptions.expires_at`으로 표현했다. 스토어 유예 기간·플랜 변경 예약이 겹치면 실제 결제일과 어긋날 수 있어, 구독 API 설계 시 스토어 S2S 값과 대조가 필요하다.
- **`top_topics` 정렬 기준** — `display_order`로 정했으나 "대표 주제"의 의도가 선택 순서·최근 변경 순일 수도 있다. `profile.md`에 기준이 없어 임의로 정했다 — 확정 필요.
- **`profile.md` 개정 필요** — FE 확정(2026-08-06)으로 카드가 3개(현재 플랜·이메일·관심 주제 관리)가 됐고 커리어 카드가 사라졌다. `profile.md` 4.1(4개 카드·순서)·4.4·5장의 개정이 필요하다. **개정 내역은 미결 검토가 끝난 뒤 `changes/pending`에 일괄 기록하기로 했다**(현재 기록 위치: 이 문서와 `profile.html` 검증 섹션).
- **[관심 주제 관리] 카드의 커리어 요약 표시 여부** — 카드에 주제 요약만 둘지, 커리어 한 줄("기획 · 서비스 기획 · 4-6년")을 함께 둘지 미결. 표시하기로 하면 응답에 커리어 필드를 추가하고, 연차 구간 라벨 정의를 `interest-management.md` 입력 UI와 한 곳으로 못 박는다.
