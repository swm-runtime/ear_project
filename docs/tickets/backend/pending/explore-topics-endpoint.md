# [BE] 주제 칩 목록 — `GET /explore/topics` 미구현

| 항목 | 값 |
|---|---|
| 대상 | `backend/src/modules/explore/` — `controllers/explore.controller.ts` · `explore.orchestrator.ts` · `explore.types.ts` · `dto/`(응답 DTO 신설) |
| 요청 파트 | 백엔드 |
| 발견 시점 | 2026-08-07 탐색 백엔드 구현 (`feat(be)/explore`) — 계약에 통로가 없다는 것을 발견 |
| 근거 문서 | `changes/pending/explore-api-topics-endpoint(fe).md`(계약) · `changes/pending/explore-topic-chip-list(be).md`(서버 규칙) · `features/explore.md` 4.2 |
| 심각도 | **상** — 주제 필터 조회(`GET /explore/contents`)는 구현돼 있는데 **무엇으로 필터할지 고를 목록이 없다.** 탐색 칩 줄이 통째로 동작하지 않는다 |
| 상태 | 대기 |

> **짝 티켓** — `tickets/frontend/pending/explore-topics-endpoint.md`. FE는 이 계약으로 **mock을 이미 구현해 두었다**(`frontend/src/features/explore/api/explore.dto.ts`의 `ExploreTopicsResponseDto`). **서버가 나가면 FE는 mock만 벗으면 된다.**
>
> **계약이 아직 `explore-api.md`에 반영되지 않았다.** 두 `changes/pending` 문서가 근거이며, 통합 시 그 둘을 함께 `explore-api.md` 3·4장과 `explore.md` 4.2에 반영해야 한다. 구현과 문서 반영의 순서는 팀이 정한다.

## 증상

`explore.md` 4.2가 칩 줄의 구성을 정한다.

> 상단 가로 스크롤 칩. **사용자의 관심 주제를 앞쪽에 배치하고 나머지 주제를 뒤에 붙인다**

그런데 **그 목록을 내려주는 엔드포인트가 없다.** 탐색 API 5개 중 어느 것도 주제 목록을 주지 않는다.

**피드의 `topic_group` 섹션으로 대신할 수 없다.** 그 섹션은 관심 주제마다 하나씩 생기지만 **콘텐츠가 0건인 주제는 섹션이 통째로 빠진다**(현재 구현이 빈 섹션을 내려주지 않는다). 초기 콘텐츠 풀이 작은 상황에서(PRD 8.1) 사용자가 자기가 고른 주제를 칩 줄에서 볼 수 없게 된다.

다른 화면 API도 맞지 않는다.

| 후보 | 왜 안 되나 |
|---|---|
| `GET /onboarding/topics` | 전체 주제를 주지만 **온보딩 전용 경로**다 |
| `GET /users/me/library-items/topics` | **라이브러리에 담긴** 주제만 준다 |
| `GET /users/me/profile` | 관심 주제 요약은 주지만 프로필 화면 API이고, 통계·커리어·구독까지 딸려 오는 무거운 응답이다 |

## 재현 절차

1. `backend`를 띄우고 온보딩까지 마친 계정을 준비한다.
2. `GET /api/v1/explore/topics` 호출 → **404**(라우트 없음).
3. FE를 실서버로 전환하고 탐색 탭에 진입한다 → 주제 칩 줄을 채울 데이터가 없다.

## 원인

탐색 백엔드 구현(`feat(be)/explore`, PR #17) 시점에 `explore-api.md`의 엔드포인트 목록에 이 조회가 없었다. 계약에 없는 경로를 임의로 만들지 않고(`backend/CLAUDE.md` 6장) `changes/pending`에 올렸다. FE도 같은 것을 발견해 요청을 올렸고, 두 요청을 **FE 안으로 합쳤다**(2026-08-07).

## 고쳐야 할 것

### 1. 엔드포인트 — `GET /explore/topics`

인증 필요, **파라미터 없음**.

```json
{
  "topics": [
    { "id": "uuid", "name": "커리어", "is_interest": true },
    { "id": "uuid", "name": "IT·테크", "is_interest": false }
  ]
}
```

- **필드명은 `is_interest`다**(`is_interested`가 아니다). FE mock이 이미 이 이름으로 동작한다.
- **정렬은 서버가 소유한다.** 클라이언트는 순서를 재배열하지 않는다.

### 2. 목록 구성 규칙

**목록 = `사용자의 활성 관심 주제 전부` + `그 밖의 is_visible = true 주제`**

| 구분 | 대상 | 정렬 |
|---|---|---|
| 앞쪽 | `user_interests.is_active = true`인 주제 **전부** | **`created_at` 오름차순 — 선택한 순서** |
| 뒤쪽 | 위에 없는 `topics.is_visible = true` | `display_order` 오름차순 |

- **관심 주제는 `is_visible = false`여도 포함한다.** 관리자가 나중에 내린 주제를 이미 선택한 사용자가 있다. 걸러내면 **자기가 고른 주제인데 칩이 없어 필터를 걸 수 없다.** `profile-api.md` 4.1이 같은 방향을 이미 정하고 있다("관리자가 숨긴 주제도 개수에 포함한다").
- **뒤쪽에는 그 예외를 적용하지 않는다.** 관심 주제가 아닌 숨겨진 주제는 노출하지 않는다(FR-38).
- **발행 콘텐츠가 0건인 주제도 노출한다.** 거르면 콘텐츠 유입에 따라 칩이 나타났다 사라지고, 개수를 세려면 `content_topics` 집계가 매 조회에 붙는다(`domain.md` 4.1이 `content_count` 컬럼을 두지 않은 이유). 고르면 E9(필터 결과 없음)가 정상 동작으로 받아 준다.

### 3. 소유 — 탐색 경로에 둔다

`topics` · `user_interests`는 `interest` 모듈 소유지만, **두 목록을 합쳐 정렬하는 것은 탐색 화면의 규칙**이므로 `ExploreOrchestrator`가 조합한다.

- **온보딩의 `GET /onboarding/topics`에 `is_interest`를 얹지 않는다.** 그 경로는 온보딩 단계 전용이고, 온보딩 시점에는 관심 주제가 아직 정해지지 않아 필드가 늘 거짓이다.
- **의존 방향은 바뀌지 않는다.** `ExploreModule`이 `InterestModule`을 이미 import 한다.

### 4. 재료는 이미 있다

| 필요한 것 | 이미 있는 것 |
|---|---|
| `is_visible = true` 주제, `display_order` 순 | `TopicService` → `TopicRepository.findAllVisible()` |
| 활성 관심 주제, **선택한 순서** | `UserInterestService.findAllActive()` — 이미 `created_at ASC` 정렬이라 규칙과 일치한다 |
| 숨김 관심 주제의 이름 붙이기 | `TopicService.findAllByIds()` |

`UserInterestService.findAllActive()`는 `UserInterest`를 돌려주므로 주제명이 없다. **관심 주제의 이름은 `findAllByIds`로 따로 붙인다** — 숨김 주제가 섞여 있어 `findAllVisible` 결과만으로는 채울 수 없다.

### 5. 테스트

- 단위: 관심 주제가 앞·선택 순서, 나머지가 뒤·`display_order` 순
- **숨김 처리된 관심 주제가 포함되는지**(이 티켓의 핵심 규칙)
- 숨김 처리된 **비관심** 주제가 제외되는지
- 관심 주제가 없는 경우(정상 상태는 아니지만 방어) 전체 노출 주제만 내려가는지

## 함께 확인할 것

- **관심사 관리 화면(`interest-management.md`)도 전체 주제 목록이 필요하다.** API 명세가 아직 작성되지 않았는데, 같은 엔드포인트를 쓸지 각자 둘지는 그 화면을 설계할 때 함께 본다. **이 티켓에서는 탐색용으로만 만든다.**
- **프로필의 관심 주제 요약(`top_topics`)은 `display_order` 순이다.** 칩 줄이 선택 순서가 되면 두 화면의 주제 순서가 달라진다. 목적이 달라(칩은 필터 조작, 카드는 요약) 문제가 아니라고 봤지만, 어긋나 보인다는 지적이 나오면 프로필 쪽도 함께 정해야 한다.
- **노출할 주제가 하나도 없는 상태는 설계하지 않아도 된다.** 그때는 피드도 비어 E8이 되고, `explore-uiux.md` 4.7이 그 화면에서 주제 칩 줄을 숨기도록 이미 정하고 있다.

## 완료 조건

- Given 서버가 기동한다 / When `GET /api/v1/explore/topics`를 호출한다 / Then 200과 함께 `{ topics: [{ id, name, is_interest }] }`가 내려온다
- Given 사용자가 A → B → C 순으로 관심 주제를 골랐다 / When 응답을 본다 / Then 앞쪽 세 개가 **A, B, C 순**이고 `is_interest`가 전부 `true`다
- Given 관리자가 사용자의 관심 주제 하나를 숨김 처리했다(`is_visible = false`) / When 응답을 본다 / Then **그 주제가 앞쪽에 그대로 포함**되고 `is_interest`가 `true`다
- Given 관심 주제가 아닌 숨겨진 주제가 있다 / When 응답을 본다 / Then **그 주제는 없다**
- Given 발행 콘텐츠가 0건인 노출 주제가 있다 / When 응답을 본다 / Then **그 주제도 포함**된다
- Given 뒤쪽 목록을 본다 / When 순서를 확인한다 / Then `topics.display_order` 오름차순이고, 앞쪽 관심 주제와 중복되지 않는다
- Given FE가 실서버로 전환한다 / When 탐색 탭에 진입한다 / Then 칩 줄이 관심 주제 우선으로 채워지고, 칩을 고르면 `GET /explore/contents`가 정상 동작한다
