# 관심사 관리 API 명세서

> 기준 문서: [`docs/features/interest-management.md`](../../features/interest-management.md)
> 규약: [`docs/backend/convention.md`](../../backend/convention.md) 5장 · [`docs/backend/architecture.md`](../../backend/architecture.md) 7·9장
> 오류·재시도: [`docs/features/common-error-handling.md`](../../features/common-error-handling.md)
> 스키마: [`docs/backend/domain.md`](../../backend/domain.md) 3.5 · 4장
> 공용 계약: [`docs/spec/api/onboarding-api.md`](onboarding-api.md) 4.2(주제 목록) · [`docs/spec/api/settings-api.md`](settings-api.md) 4.2(자동 확장 토글)

## 1. 범위

`interest-management.md`가 정의한 동작을 HTTP 계약으로 옮긴 문서다. 다루는 것은 다음 넷이다.

- 주제 목록 조회 — **온보딩과 같은 목록**(`is_visible = true` · `display_order` 순). 기존 계약(`onboarding-api.md` 4.2)을 공용으로 참조한다
- 현재 관심사 조회 — 선택 상태 복원 + `source` 원값("자동 추가됨" 배지는 P1)
- 관심사 일괄 저장 — **최종 목록 전체 전송**(델타 아님·멱등), 서버 diff, 최소 1·최대 3 검증, 초과 보유자 규칙, 캐시 무효화
- 자동 확장 토글 즉시 저장(P1) — `settings-api.md` 4.2의 공용 PATCH를 참조한다

**이 문서는 동작 규칙을 새로 정하지 않는다.** 규칙이 충돌하면 `interest-management.md`가 기준이며, 이 문서는 그것을 요청·응답으로 표현할 뿐이다. 스키마는 `domain.md`가 유일한 기준이다.

**다루지 않는 것** — 경계를 먼저 못 박는다.

| 대상 | 소유 문서 | 이 문서에서 하는 일 |
|---|---|---|
| 온보딩 1단계의 관심 주제 저장 | `onboarding-api.md` 4.3 (`PUT /onboarding/interests`) | **공용이 아니다.** 그 저장은 `onboarding_step` 전진이 붙은 상태 전이라, 완료된 계정의 변경은 이 문서의 저장(4.3)만 담당한다 |
| 커리어 정보 편집 | `career.md` (합의 2026-08-06 분리) | 엔드포인트를 정의하지 않는다. 화면에도 없다 |
| 드립 편성 알고리즘·배치 실행 | `drip-scheduling.md` | 저장이 **캐시를 무효화한다**는 사실까지만. 다음 배치가 무엇을 편성하는지는 다루지 않는다 |
| 자동 확장 배치(FR-18, P1) | `drip-scheduling.md` · `domain.md` 4.3 | 토글 값 저장 경로만 안다(4.4). 배치는 MVP에서 돌지 않는다 |
| 관심 주제 요약 표시(프로필·설정 카드) | `profile-api.md` 4.1 · `settings-api.md` 4.1 | 정의하지 않는다. 요약은 각 화면 조회 응답의 몫이다 |
| 주제 노출(`is_visible`) 변경 | `admin.md` | **관리자만 변경한다**(FR-38). 이 API는 읽기만 한다 |
| 해제된 주제의 기존 라이브러리 콘텐츠 | `library.md` | **아무것도 하지 않는다.** 해제는 신규 적립만 중단하며, 라이브러리 항목을 지우는 요청·응답이 없다(FR-05) |

---

## 2. 공통 규약

| 항목 | 값 |
|---|---|
| Base URL | `/api/v1` |
| 인증 헤더 | `Authorization: Bearer <access_token>` — 이 문서의 **모든 엔드포인트가 인증 필요** |
| 요청·응답 필드 | **snake_case** |
| 시각 | **ISO 8601 UTC 문자열** (epoch 정수 금지) |
| 추적 | 모든 응답에 `X-Trace-Id` |
| 멱등키 | **없다.** 저장(4.3)은 전체 교체(PUT)라 같은 본문을 두 번 보내도 결과가 같다(3장 설계 메모) |

- 성공 응답에 `success: true` 같은 공통 봉투를 씌우지 않는다. **성공은 HTTP 상태로, 실패는 에러 규격으로 판단한다.**
- 에러 응답은 `architecture.md` 7.4 규격을 따른다.

```json
{
  "error_code": "INTEREST_LIMIT_EXCEEDED",
  "message": "관심 주제는 3개까지 선택할 수 있어요",
  "retryable": false,
  "retry_after_sec": null,
  "trace_id": "01H8X..."
}
```

**서버가 받지 않는 값**

- **변경 확인 팝업의 노출·응답 여부를 요청에 싣지 않는다.** 팝업(해제 포함 시 저장당 1회 — `interest-management.md` 4.2)은 클라이언트의 고지 UI이고, 서버가 받는 것은 [변경하기] 이후의 최종 목록뿐이다. 팝업을 봤는지는 판정에 쓸 일이 없으므로 필드 자체가 없다.
- **"변경 사항 N개"를 서버가 계산해 내려주지 않는다.** 그 숫자는 편집 중 화면 표시값이라 로컬 상태와 서버 상태의 diff이며, 서버는 저장 시점에만 diff를 계산한다(4.3). 표시용 diff와 저장용 diff는 계산 주체가 다를 뿐 같은 규칙이다(해제 후 같은 편집 안 재선택 = 변경 없음).
- **클라이언트가 보낸 델타(추가·해제 목록)를 받지 않는다.** 받는 것은 언제나 **최종 목록 전체**다. 델타를 받으면 여러 기기의 동시 편집에서 순서에 따라 결과가 달라지고, 전체 목록이면 마지막 저장이 그대로 최종이 된다(last-write-wins — `interest-management.md` 7장).

---

## 3. 엔드포인트 목록

| # | 메서드 | 경로 | 설명 | 인증 | 소유 |
|---|---|---|---|---|---|
| 1 | GET | `/onboarding/topics` | 주제 목록 — **온보딩과 공용**(같은 목록·같은 순서) | 필요 | `onboarding-api.md` 4.2 |
| 2 | GET | `/users/me/interests` | 현재 관심사 조회(선택 상태 + `source` 원값) | 필요 | 이 문서 |
| 3 | PUT | `/users/me/interests` | 일괄 저장 — 전체 교체 + 서버 diff + 캐시 무효화 | 필요 | 이 문서 |
| 4 | PATCH | `/users/me/settings` | 자동 확장 토글 즉시 저장(P1) — **설정과 공용** | 필요 | `settings-api.md` 4.2 |

**설계 메모**

- **주제 목록 엔드포인트를 새로 만들지 않는다.** 관심사 관리의 목록 요건은 온보딩과 완전히 같다 — `is_visible = true`만, `display_order` 오름차순, 상한(`max_selectable`)은 서버가 내려줌(`interest-management.md` 4.1 — "온보딩과 동일하게"). 같은 목록을 두 엔드포인트로 내려주면 한쪽만 고쳐지는 순간 두 화면의 선택지가 어긋난다.
  - `GET /onboarding/topics`는 **부작용 없는 순수 조회**라 공용에 안전하다. 온보딩 경로에 모은 이유는 저장 계열이 `onboarding_step`을 전진시키기 때문인데(`onboarding-api.md` 3장), 목록 조회는 그 부수 효과가 없고 완료된 계정을 거부하는 에러도 없다(그 절의 에러는 `INTERNAL_ERROR`뿐이다).
  - 경로 이름이 온보딩 색을 띠는 문제는 9장에 남긴다. **계약(응답 모양)은 공용이며, 경로가 바뀌더라도 두 화면이 함께 바뀐다.**
- **저장이 POST가 아니라 PUT인 이유**: 편집 후 **최종 주제 집합 전체를 교체**하는 요청이다(`convention.md` 5.1 — `onboarding-api.md` 4.3과 같은 판단). 같은 본문의 재전송·재시도가 결과를 바꾸지 않으므로 멱등키가 필요 없다.
- **조회(2)와 저장(3)을 같은 경로의 GET/PUT으로 둔다.** 같은 리소스(사용자의 관심 주제 집합)의 읽기와 교체다. 경로가 갈리면 "조회한 것과 저장하는 것이 같은 대상"이라는 사실이 계약에서 사라진다.
- **자동 확장 토글을 이 문서의 저장(3)에 싣지 않는다.** 토글은 단일 값의 즉시 저장이고(`interest-management.md` 3장 — "일괄 편집 대상이 아님"), 저장소도 `user_interests`가 아니라 `user_settings.is_auto_expand_enabled`다(`domain.md` 3.5). 설정 화면과 같은 값을 같은 계약으로 저장해야 진실이 한 곳에 남는다 — `settings-api.md` 4.2가 이미 그 계약이다(그 문서 1장 — "자동 확장 토글만 이 문서의 PATCH가 저장한다").

---

## 4. 엔드포인트 상세

### 4.1 `GET /onboarding/topics` — 공용 참조

**정의는 [`onboarding-api.md` 4.2](onboarding-api.md)가 소유한다. 여기에 중복 기재하지 않는다.** 관심사 관리 화면이 의존하는 사실만 적는다.

- `items`는 `is_visible = true`인 주제만, `display_order` 오름차순 — 온보딩 1단계와 **같은 목록, 같은 순서**다(`interest-management.md` 4.1).
- `max_selectable`(현재 3)을 이 응답으로 받는다. **"N/3 선택"의 분모를 클라이언트에 상수로 두지 않는다** — 상한 검증은 서버가 하므로(4.3), 화면 문구와 서버 판정이 다른 상수를 보면 고를 수 있는 개수를 서버가 거부하게 된다.
- `is_fallback = true`(기본 주제 세트)도 그대로 적용된다. 폴백 주제 역시 실재하는 `topics` 행이라 저장(4.3)에 쓸 수 있다.
- 조회 실패는 전체 화면 에러 + [다시 시도]다(`interest-management.md` 5장 — IM9). 목록 없이 편집이 성립하지 않으므로 [저장]은 비활성이다.

### 4.2 `GET /users/me/interests`

화면 진입 시 현재 선택 상태를 받아온다. 주제 목록(4.1)과 **병렬로 호출**한다.

**Response 200**

```json
{
  "interests": [
    { "topic_id": "uuid-a", "source": "onboarding" },
    { "topic_id": "uuid-b", "source": "manual" },
    { "topic_id": "uuid-c", "source": "auto_expand" }
  ]
}
```

| 필드 | 의미 |
|---|---|
| `interests` | `is_active = true`이면서 **주제가 현재 노출 중**(`topics.is_visible = true`)인 관심사. 순서는 의미가 없다 — 칩의 배치는 주제 목록(4.1)의 `display_order`가 정한다 |
| `source` | `onboarding` / `manual` / `auto_expand` — `user_interests.source` 원값(`domain.md` 4.2). **배지 매핑은 화면이 한다**(`library-api.md` 4.1의 `source`와 같은 방침). `auto_expand` → "자동 추가됨" 배지는 P1이며, MVP 화면은 이 값을 읽지 않아도 된다 |

- **주제명을 담지 않는다.** 이름·순서는 주제 목록(4.1)이 소유하며, 클라이언트는 `topic_id`로 조인한다. 두 응답에 같은 이름을 실으면 관리자가 주제명을 바꿨을 때 화면이 어느 쪽을 그릴지 판단해야 한다.
- **숨겨진 주제(`is_visible = false`)의 활성 관심사는 응답에서 제외한다.** 숨김 주제는 보유 여부와 무관하게 모든 사용자에게서 제거된다(결정 2026-08-11 — `interest-management.md` 7장). 편집·저장의 대상 범위(4.3의 diff 범위)와 응답 범위가 같아야 "조회한 것을 고쳐서 되돌려보낸다"는 계약이 성립한다. 행 자체는 물리 삭제되지 않지만 4.3이 이 행을 건드리지 않으며, 재노출 시 돌아오는 것은 보장이 아니다.
- 활성 관심사가 노출 주제에 하나도 없으면 `interests: []`다. **404가 아니다** — 온보딩 필수라 정상적으로는 최소 1개가 있지만, 보유 주제가 전부 숨겨진 극단 상황에서도 화면은 0개 상태(저장 비활성 + 최소 1개 문구)로 동작해야 한다.
- **`N/3`의 N은 이 배열의 길이다.** 초과 보유자 화면(IM6 — "5/3 선택")의 N도 같다. 숨겨진 주제는 세지 않는다 — 세면 화면의 칩 수와 숫자가 어긋난다.

**에러** — 고유 코드 없음. 조회 실패(5xx)는 전체 화면 에러 + [다시 시도](`common-error-handling.md` 4.3).

---

### 4.3 `PUT /users/me/interests`

일괄 저장. [저장] → (해제 포함 시 확인 팝업 [변경하기]) 이후 호출된다. **편집 후 최종 목록 전체를 보낸다.**

**Request**

```json
{ "topic_ids": ["uuid-a", "uuid-b", "uuid-d"] }
```

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| `topic_ids` | string[] | 필수 | **최소 1개.** 상한은 아래 판정 규칙 참조. 중복 값은 거부한다 |

**Response 200**

```json
{
  "interests": [
    { "topic_id": "uuid-a", "source": "onboarding" },
    { "topic_id": "uuid-b", "source": "manual" },
    { "topic_id": "uuid-d", "source": "manual" }
  ]
}
```

- 저장 후의 최종 상태를 4.2와 **같은 모양**으로 되돌린다. 클라이언트는 이 값으로 화면을 확정하고 성공 토스트("관심사가 변경되었어요") 후 이전 화면으로 복귀한다(`interest-management.md` 4.4).

**상한·하한 판정** — 규칙 소유는 `interest-management.md` 3장·7장이다.

| 검증 | 판정 | 위반 시 |
|---|---|---|
| 하한 | `topic_ids`가 1개 미만 | `INTEREST_REQUIRED` |
| 상한 | `topic_ids` 개수 > **max(3, 저장 전 활성 개수)** | `INTEREST_LIMIT_EXCEEDED` |
| 주제 유효성 | 존재하지 않거나 `is_visible = false`인 `topic_id` 포함 | `INTEREST_TOPIC_UNAVAILABLE` |

- **상한을 상수 3이 아니라 "기존 개수보다 늘어나지 않으면 통과"로 판정한다**(`interest-management.md` 7장). 상한 도입 이전·자동 확장으로 3개를 넘게 보유한 사용자에게 강제 축소를 요구하지 않기 위해서다 — 5개 보유자의 5개 재저장(해제 없이 다른 변경만)도, 5개 → 4개 저장도 통과하고, 5개 → 6개는 거부된다. 3개 이하로 내려간 뒤부터는 상수 3이 그대로 상한이 된다.
- **"저장 전 활성 개수"는 diff 범위와 같은 기준으로 센다** — `is_active = true`이면서 주제가 노출 중인 행(4.2 응답과 같은 집합). 판정 분모와 요청 목록의 재료가 같아야 "늘었는가"가 성립한다.
- **0개 저장은 클라이언트가 막지만 서버도 거부한다.** 0개 상태에서 [저장]은 비활성이므로(`interest-management.md` 4.2 — 개정 2026-08-09) 정상 클라이언트에서 `INTEREST_REQUIRED`는 나오지 않는다. 서버 검증은 우회 방어다 — 드립 편성이 최소 1개 주제를 전제한다.
- **초과분을 잘라내고 성공시키지 않는다.** 거부하고 코드로 알린다(`onboarding-api.md` 4.3과 같은 이유 — 화면의 선택과 서버 상태가 어긋나면 사용자는 무엇이 빠졌는지 알 수 없다).
- **"없는 주제"와 "숨겨진 주제"를 다른 코드로 구분하지 않는다.** 구분하면 임의 UUID로 비노출 주제의 존재를 탐침할 수 있다(`onboarding-api.md` 4.3과 동일).

**서버 처리** — 하나의 트랜잭션에서 수행한다(`architecture.md` 8.1). 부분 반영이 없어야 한다(`interest-management.md` 7장 — 저장 도중 앱 종료).

1. 검증(위 표) — 순서는 하한 → 주제 유효성 → 상한
2. 현재 활성 관심사(노출 주제 한정)와 `topic_ids`의 **diff 계산**
3. **추가분**: `user_interests` upsert — `is_active = true`, `source = manual`, `is_user_removed = false`, `deactivated_at = null`. 해제했던 주제의 재선택은 기존 행 복원이다(`uq_user_interests_user_id_topic_id` — 행을 새로 만들지 않는다)
4. **해제분**: `is_active = false`, `is_user_removed = true`, `deactivated_at` 기록. **행을 물리 삭제하지 않는다** — 재선택 이력 추적 + 자동 확장 재추가 금지(`domain.md` 4.2)
5. **유지분·숨겨진 주제의 행은 건드리지 않는다.** 유지분의 `source`를 `manual`로 덮지 않는다 — `auto_expand`로 들어온 주제를 해제하지 않고 저장했다고 해서 "직접 고른 것"이 되지 않는다
6. 추천·편성 **캐시 무효화**(`interest-management.md` 4.3 · `drip-scheduling.md` 3장). diff가 비면(변경 없음) 생략한다
7. 변경 내역을 **구조화 로그**로 남긴다(`InterestChangeLog`는 테이블이 아니다 — `domain.md` 13.3)

- **diff의 범위는 노출 중인 주제로 한정한다.** 관리자가 숨긴 주제의 활성 행은 요청 목록에 없어도 해제로 처리하지 않는다 — 클라이언트는 그 주제를 화면에 그릴 수 없어 목록에 담을 방법이 없고, `is_user_removed = true`가 서면 사용자가 하지 않은 해제가 자동 확장 영구 제외로 기록된다(`interest-management.md` 7장 — 숨김은 제거이지 사용자의 해제가 아니다).
- **해제는 `user_interests`만 바꾼다.** 라이브러리의 기존 콘텐츠(미청취분 포함)에는 아무 일도 일어나지 않는다(FR-05). 이 계약에 라이브러리를 만지는 필드·부작용이 없다.
- **변경 없음 요청(현재와 같은 목록)도 200이다.** [저장]이 비활성이라 정상 흐름에서는 오지 않지만, 재시도·복수 기기에서 도착할 수 있고 실패시킬 이유가 없다 — 전체 교체는 멱등이다.
- **`onboarding_step`을 건드리지 않는다.** 온보딩 저장(`onboarding-api.md` 4.3)과 이 저장이 분리된 이유가 그 부수 효과다. 온보딩 미완료 계정이 이 엔드포인트를 부를 일은 없지만(화면 진입 경로가 온보딩 이후에만 열린다), 호출돼도 단계는 움직이지 않는다.

**반영 시점** — 저장 성공 직후 무엇이 언제 달라지는가(FR-05).

| 대상 | 반영 |
|---|---|
| 탐색(추천 피드·주제 칩) | **다음 조회부터 즉시.** 캐시 무효화(6번)의 결과다 |
| 드립 편성 | **다음 배치부터.** 이미 오늘 편성이 확정된 콘텐츠는 되돌리지 않는다(`interest-management.md` 4.3 — 해제 주제의 확정분도 그대로 적립되며 별도 안내 없음) |
| 라이브러리 기존 콘텐츠 | 변화 없음 |

- **반영 완료 시점을 응답에 담지 않는다.** "다음 배치"는 배치 스케줄의 사실이지 이 요청이 알 수 있는 값이 아니고, 클라이언트가 그 시각으로 판정할 것도 없다.

**클라이언트 규칙**

- **확인 팝업(해제 포함 시)은 호출 전에 끝난다.** [취소]면 호출 자체가 없고, [변경하기]면 위 요청이 나간다 — 팝업 여부가 요청을 바꾸지 않는다.
- **저장 실패 시 편집 상태를 유지한다** — 인라인 에러 + [다시 시도](`interest-management.md` 5장 — IM8). **오프라인 큐에 넣지 않는다**(`common-error-handling.md` 4.5 — 폼 제출은 전송 시점의 사용자 확인이 의미를 갖는 조작이다). 오프라인 저장 시도도 같은 처리다.
- 타임아웃·5xx는 `common-error-handling.md` 4.2의 자동 재시도 대상이다(전체 교체 PUT — 멱등 보장). 소진되면 인라인 에러로 알린다.
- 저장 중에는 [저장] 로딩 + 화면 조작 차단(`interest-management.md` 5장). **연타로 두 번 나가도 결과는 같지만**, 차단은 이중 확인 팝업 같은 UI 겹침을 막기 위한 화면 규칙이다.

**에러**

| 코드 | HTTP | 상황 |
|---|---|---|
| `INTEREST_REQUIRED` | 400 | `topic_ids`가 비었음(0개 저장 시도) |
| `INTEREST_LIMIT_EXCEEDED` | 400 | 저장 전 활성 개수보다 늘면서 3개 초과 |
| `INTEREST_TOPIC_UNAVAILABLE` | 400 | 존재하지 않거나 숨겨진 `topic_id` 포함 |

---

### 4.4 `PATCH /users/me/settings` — 공용 참조 (P1)

**정의는 [`settings-api.md` 4.2](settings-api.md)가 소유한다.** 자동 확장 토글(FR-06)은 이 화면에서도 **같은 계약으로 즉시 저장**한다 — `{ "is_auto_expand_enabled": false, "client_seq": n }`.

- **일괄 저장(4.3)과 무관하다.** 토글 조작 즉시 호출되며 [저장] 활성화에 관여하지 않는다(`interest-management.md` 3장). 낙관적 UI·실패 시 원복 + 토스트·오프라인 큐(마지막 상태만 유지)·`client_seq` 규칙 전부 `settings-api.md` 4.2를 그대로 따른다.
- 저장소는 `user_settings.is_auto_expand_enabled`다(`domain.md` 3.5). **`user_interests`에 대응 컬럼이 없다.**
- **MVP에서는 섹션 자체를 노출하지 않으므로**(`interest-management.md` 5장) 이 화면에서 호출이 발생하지 않는다. 값의 조회도 이 문서에 없다 — 화면이 P1에 그리게 되면 조회 경로(설정 조회 재사용 또는 4.2 응답 확장)를 그때 확정한다(9장).
- 자동 확장으로 추가된 주제의 **해제**는 토글이 아니라 일괄 저장(4.3)의 해제분이다 — `is_user_removed = true`가 서면서 재추가가 영구히 막힌다.

---

## 5. 에러 코드 표

**`INTEREST_*` 세 코드는 이 문서가 신설했고, `common-error-handling.md` 9.8 중앙 표에 등재됐다**(협의 완료 2026-08-10). enum 반영은 백엔드 구현 시(`architecture.md` 7.5 순서에서 enum만 남음). 두 곳이 어긋나면 9장이 기준이다.

| error_code | HTTP | retryable | 클라이언트 동작 |
|---|---|---|---|
| `INTEREST_REQUIRED` | 400 | false | [저장] 비활성 유지 + "관심 주제를 1개 이상 선택해주세요". 정상 클라이언트에서는 도달하지 않는다(저장 비활성이 선행) |
| `INTEREST_LIMIT_EXCEEDED` | 400 | false | 토스트 "관심 주제는 3개까지 선택할 수 있어요" + 관심사 재조회(4.2)로 선택 상태 재동기화 |
| `INTEREST_TOPIC_UNAVAILABLE` | 400 | false | 주제 목록(4.1)·관심사(4.2) 재조회 후 편집 상태 재구성. 사라진 주제의 선택만 걷어낸다 |

- 401·429·5xx는 `common-error-handling.md` 4.1~4.2의 공통 규칙을 따른다. 이 문서가 따로 정의하지 않는다.
- **온보딩의 `ONBOARDING_INTEREST_*` 코드를 재사용하지 않는다.** 문구는 같지만 **상한 판정 규칙이 다르다** — 온보딩은 상수 3, 여기는 "기존 개수보다 늘지 않으면 통과"라, 같은 코드가 화면에 따라 다른 조건에서 나오면 코드의 의미가 갈라진다(`architecture.md` 7.5 — 배포된 코드의 의미를 바꾸지 않는다). `ONBOARDING_` 접두 코드에는 온보딩 스택 정리 같은 화면 동작이 이미 묶여 있기도 하다(9.4).

## 6. 흐름

**화면 진입 · 편집 · 저장**

```
프로필 카드 · 설정 > 콘텐츠 · 라이브러리 드립 배너 [관심 주제 추가하기]
   ↓
GET /onboarding/topics  ┐ 병렬 — 목록(display_order·max_selectable)
GET /users/me/interests ┘        + 현재 선택(source 원값)
   ↓ 칩 편집 (0개·3개 초과 상태 허용, N/3 표시, 초과 시 저장 게이트 — 전부 클라이언트. 개정 2026-08-11)
[저장] 탭
   ├─ 추가만 있음        → 팝업 없이 바로 ↓
   ├─ 해제 포함           → 확인 팝업(저장당 1회) → [변경하기] → ↓ / [취소] → 편집 유지
   └─ 0개                 → [저장] 비활성 — 호출 자체가 없다
PUT /users/me/interests
   ├─ 200                → 토스트 "관심사가 변경되었어요" → 이전 화면 복귀
   ├─ 400 INTEREST_*     → 5장 표의 동작. 편집 상태 유지
   └─ 타임아웃·5xx        → 자동 재시도 → 소진 시 인라인 에러 + [다시 시도]. 편집 상태 유지
```

- **팝업을 띄울지는 클라이언트가 정하고, 저장을 받아줄지는 서버가 정한다.** 팝업은 고지이지 판정이 아니다.
- 뒤로가기(변경 있음)의 "저장하지 않고 나갈까요?" 팝업은 서버 호출이 없다 — [나가기]는 편집을 버릴 뿐이다.

**자동 확장 토글 (P1)**

```
토글 조작 → 즉시 PATCH /users/me/settings { is_auto_expand_enabled, client_seq }   (settings-api 4.2)
   └─ 실패 → 토글 원복 + 토스트
```

## 7. 보안·검증 규칙

`architecture.md` 9장을 이 도메인에 적용한 결과다.

- **모든 조회·변경은 토큰에서 꺼낸 `user_id`로 스코프한다.** 경로에 `userId`를 받지 않고 `me`를 쓴다(IDOR 방지 — `architecture.md` 9.2).
- **하한·상한·주제 유효성은 서버가 반드시 재검증한다.** 칩 비활성화·저장 버튼 비활성은 우회된다(`interest-management.md` 8장 — "클라이언트를 우회해 주제 4개를 서버로 보낸다 / Then 서버가 상한을 검증해 거부한다").
- **상한 판정(초과 보유자 포함)은 DTO가 아니라 Service가 한다.** 판정에 저장 전 활성 개수 조회가 필요하고, `INTEREST_REQUIRED`와 `INTEREST_LIMIT_EXCEEDED`를 구분해 내려줘야 한다(`onboarding-api.md` 7장과 같은 구조). **DTO에는 대량 쓰기를 막는 안전 상한만 둔다** — 도메인 상한이 가변(max(3, 기존))이라 DTO 상수로 표현할 수 없다.
- **`topic_id`는 `is_visible = true`인 주제만 허용한다.** 목록에 없던 주제를 직접 보내 저장하는 경로를 남기지 않는다.
- **없는 주제와 숨겨진 주제를 같은 코드로 응답한다**(4.3) — 비노출 주제 탐침 방지.
- 전역 `ValidationPipe`(`whitelist: true`, `forbidNonWhitelisted: true`) — DTO에 없는 필드는 잘라낸다. 팝업 상태·변경 개수 같은 화면 로컬 값이 실려 와도 서버에 도달하지 않는다.

## 8. 데이터 모델

> 스키마는 [`domain.md`](../../backend/domain.md)가 유일한 기준이다. 이 문서에 컬럼을 중복 기재하지 않는다.

| 사용하는 것 | domain.md |
|---|---|
| `user_interests` — `source` · `is_active` · `is_user_removed` · `deactivated_at`, `(user_id, topic_id)` 유니크 | 4.2 |
| `topics` — `is_visible`(관리자만 변경) · `display_order` | 4.1 |
| `user_settings.is_auto_expand_enabled` — 자동 확장 토글의 저장소(변경은 `settings-api.md` 4.2) | 3.5 |
| `topic_adjacencies` — 자동 확장 배치(P1). **이 API는 읽지도 쓰지도 않는다** | 4.3 |

- **관심사 개수를 저장하는 컬럼을 만들지 않는다.** "N/3"의 N도, 상한 판정의 기존 개수도 `user_interests` 집계다(`domain.md` 1.5).
- **`InterestChangeLog`는 테이블이 아니다.** 변경 내역은 구조화 로그로 남긴다(`domain.md` 13.3).
- **해제가 라이브러리·재생 계열 테이블을 건드리지 않는다.** `library_items` · `drip_excluded_contents`는 이 API의 쓰기 대상이 아니다.
- 추천·편성 캐시의 실체(무효화 대상·재계산 시점)는 `drip` 모듈 소유다(`drip-scheduling.md` · `domain.md` 7.2). 이 API는 무효화 신호를 보낼 뿐이다.

## 9. 미결 사항

- ~~주제 목록 공용 경로의 이름~~ → **해소(협의 2026-08-10): (a) 현행 유지.** `GET /onboarding/topics`를 그대로 쓴다 — 계약이 한 곳에 있고 배포 전 개명의 실익이 없다.
- ~~숨겨진 주제를 diff·개수 판정에서 제외하는 규칙(4.2·4.3)~~ → **해소(2026-08-10): features에 명문화됨.** `interest-management.md` 7장(관리자 숨김 항목)에 "숨겨진 주제는 일괄 저장의 diff·개수 판정 범위에서 제외한다"가 추가됐다.
- **자동 확장 토글 값의 조회 경로(P1)** — 저장은 `settings-api.md` 4.2로 확정했지만, 이 화면이 토글의 현재 값을 어디서 읽을지는 미정이다. 선택지: (a) `GET /users/me/settings` 재사용(응답에 이미 있음 — 다만 이 화면에는 과한 응답) / (b) 4.2 응답에 `is_auto_expand_enabled`를 얹는다(저장 경로와 갈라지는 대신 왕복 1회). P1 화면 작업 시 확정한다.
- **`INTEREST_LIMIT_EXCEEDED`의 message와 초과 보유자** — 고정 문구 "관심 주제는 3개까지 선택할 수 있어요"는 초과 보유자의 실제 상한(기존 개수)과 다를 수 있다. 정상 클라이언트는 추가 자체가 막혀 이 코드에 도달하지 않으므로 고정 문구로 뒀다 — 우회 요청에 정확한 안내를 만들 이유가 없다.
- **자동 확장(FR-18) P1 도입 시 재확인** — 상한 3과의 충돌(3개 보유자에게 배치가 동작하지 않음), 서버 기본값 ON/OFF, "자동 추가됨" 배지 노출은 전부 features의 미결이다(`interest-management.md` 미결 사항). 이 계약에서는 `source` 원값 전달(4.2)까지만 준비해뒀다 — 배지가 확정돼도 응답은 바뀌지 않는다.
