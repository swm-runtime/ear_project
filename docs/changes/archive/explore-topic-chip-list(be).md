# [BE] 탐색 주제 칩 목록 — FE 제안 계약에 대한 서버 측 보완

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/spec/api/explore-api.md` 3장·4장 · `docs/features/explore.md` 4.2 |
| 요청 파트 | 백엔드 |
| 관련 작업 | 탐색 백엔드 구현 (`feat(be)/explore`) |
| **선행 문서** | **`changes/pending/explore-api-topics-endpoint(fe).md` — 계약(엔드포인트·응답 모양)은 그 문서가 소유한다** |
| 성격 | 같은 요청이 FE·BE 양쪽에서 올라왔다. **계약은 FE 안을 따르고, 이 문서는 그 안이 정하지 않은 서버 규칙만 더한다** |
| 상태 | **반영 완료** (2026-08-07, 탐색 통합 시점) — 계약·규칙 반영. **구현은 티켓으로 이관** |

> **2026-08-07 반영 결과**
>
> - `explore-api.md` **4.2-2** — 계약(FE 문서 소유)과 이 문서의 서버 규칙을 **한 절에 함께** 담았다. 목록 구성 표(앞쪽=관심 주제 전부·선택 순서 / 뒤쪽=`is_visible = true`·`display_order`)와 숨김 관심 주제 예외, 0건 주제 노출, `is_interest`를 내려주는 이유까지
> - `explore.md` 4.2 — 화면 규칙 쪽에는 정렬 소유·숨김 관심 주제·0건 주제 세 줄만 남겼다. 계약 세부는 api 문서가 갖는다
> - `explore-api.md` 9장 미결 — 해소 표시 + 관심사 관리 화면과의 엔드포인트 공유, 프로필과의 정렬 차이를 남은 확인 사항으로 기록
> - 구현: `tickets/backend/pending/explore-topics-endpoint.md` · `tickets/frontend/pending/explore-topics-endpoint.md`

> **왜 두 문서가 남는가** — FE 문서는 **무엇을 어떤 모양으로 주고받을지**(계약)를, 이 문서는 **서버가 그 목록을 어떤 규칙으로 만드는지**를 담는다. 통합 시 두 문서를 함께 읽고 `explore-api.md`·`explore.md`에 반영하면 된다.
>
> **백엔드가 처음에 제안했던 "피드 응답에 `topics` 필드를 얹는 안"은 철회한다.** FE mock이 이미 `GET /explore/topics`로 동작하고 있어(`frontend/src/features/explore/api/explore.dto.ts`) 뒤집을 이유가 없다. 필드명도 FE 안의 **`is_interest`** 를 쓴다.

---

## 합의된 계약 (FE 문서 소유 — 여기서 바꾸지 않는다)

`GET /explore/topics` — 인증 필요, 파라미터 없음.

```json
{
  "topics": [
    { "id": "uuid", "name": "커리어", "is_interest": true },
    { "id": "uuid", "name": "IT·테크", "is_interest": false }
  ]
}
```

- **정렬은 서버 소유다.** 관심 주제를 앞쪽에, 나머지를 뒤에 배치해 내려주고 클라이언트는 재배열하지 않는다.
- 라이브러리의 주제 목록(`library-api.md` 4.2 — 담긴 콘텐츠의 주제)과 다르다. 이쪽은 **필터로 고를 수 있는 전체 주제**다.

---

## 이 문서가 더하는 것 — 서버가 목록을 만드는 규칙 (2026-08-07 확정)

FE 문서의 "함께 결정할 것"에 남아 있던 항목을 포함해 아래를 확정했다.

### 1. 사용자가 가진 관심 주제는 숨김 여부와 무관하게 포함한다

**`is_visible = false`인 주제라도 사용자의 활성 관심 주제이면 목록에 넣는다.**

- 관리자가 나중에 주제를 내리면 그것을 이미 선택한 사용자가 생긴다. 일괄로 걸러내면 **자기가 고른 주제인데 칩이 없어 필터를 걸 수 없다.**
- `profile-api.md` 4.1이 같은 방향을 이미 정하고 있다 — "관리자가 숨긴 주제도 개수에 포함한다. 편집 화면과 같은 기준을 써야 개수가 어긋나지 않는다"
- **뒤쪽의 "나머지 주제"에는 적용하지 않는다.** 관심 주제가 아닌 숨겨진 주제는 노출하지 않는다(FR-38).

정리하면 목록 = `사용자의 활성 관심 주제 전부` + `그 밖의 is_visible = true 주제`.

### 2. 관심 주제끼리는 선택한 순서

**`user_interests.created_at` 오름차순**이다. 서버가 임의의 "대표" 기준을 만들지 않는다. 뒤쪽의 나머지 주제는 `topics.display_order` 오름차순이다.

### 3. 발행 콘텐츠가 0건인 주제도 노출한다

FE 문서의 결정 항목 2번에 대한 답이다. **전부 노출하는 쪽으로 확정한다.**

- 초기 콘텐츠 풀이 작아(PRD 8.1) 0건 주제를 거르면 칩 줄이 거의 비고, 콘텐츠가 들어오는 순간 칩이 나타났다 사라지는 흔들림이 생긴다.
- 고르면 E9(필터 결과 없음 — "이 주제의 콘텐츠는 아직 없어요" + [필터 해제])가 정상 동작으로 받아 준다.
- 개수를 세려면 `content_topics` 집계가 매 조회에 붙는데, `domain.md` 4.1이 `topics.content_count`를 컬럼으로 두지 않기로 한 이유가 그것이다.

### 4. 소유 모듈 — 탐색 경로에 둔다

FE 문서의 결정 항목 1번에 대한 답이다. `topics`·`user_interests`는 `interest` 모듈 소유지만, **두 값을 합쳐 정렬하는 것은 탐색 화면의 규칙**이므로 `ExploreOrchestrator`가 조합한다(`onboarding`·`library-screen`과 같은 형태).

- 온보딩의 `GET /onboarding/topics`에 `is_interest`를 얹지 않는다. 그 경로는 온보딩 단계 전용이고, 온보딩 시점에는 관심 주제가 아직 정해지지 않아 필드가 늘 거짓이다.

---

## 함께 지적할 것 — 프로필과 순서가 달라진다

`profile-api.md` 4.1의 관심 주제 요약(`top_topics`)은 현재 **`topics.display_order`** 순이다. 칩 줄이 **선택 순서**가 되면 두 화면의 주제 순서가 달라진다.

목적이 다르므로(칩은 필터 조작, 카드는 요약 표시) 문제가 아니라고 보면 그대로 두면 된다. **어긋나 보이는 것을 막으려면 프로필 쪽도 함께 정해야 하며, 이 문서의 범위 밖이라 지적만 남긴다.**

## 서버 구현 상태

**미구현.** 재료는 이미 전부 있다.

| 필요한 것 | 이미 있는 것 |
|---|---|
| `is_visible = true` 주제, `display_order` 순 | `TopicService` → `TopicRepository.findAllVisible()` |
| 사용자의 활성 관심 주제, **선택한 순서** | `UserInterestService.findAllActive()` — 이미 `created_at ASC` 정렬이라 2번 결정과 일치한다 |
| 숨김 관심 주제의 이름 붙이기 | `TopicService.findAllByIds()` |

`ExploreModule`이 `InterestModule`을 이미 import 하고 있어 **의존 방향도 바뀌지 않는다.** 실제 작업은 두 목록을 합쳐 정렬하는 조립 코드다.

**참고** — 노출할 주제가 하나도 없는 상태는 별도로 설계하지 않아도 된다. 그때는 피드도 비어 E8(피드 비어 있음)이 되고, `explore-uiux.md` 4.7이 그 화면에서 **주제 칩 줄을 숨기도록** 이미 정하고 있다.

## 완료 조건

- Given 통합 과정에서 두 문서를 함께 반영한다 / When `explore-api.md` 3장·4장을 읽는다 / Then `GET /explore/topics`의 계약(FE 문서)과 목록 생성 규칙(이 문서)이 한 곳에 서술되어 있다
- Given 관리자가 사용자의 관심 주제를 숨김 처리했다 / When 그 사용자가 탐색에 진입한다 / Then 그 주제 칩이 앞쪽에 그대로 노출되고 필터를 걸 수 있다
- Given 사용자가 A → B → C 순으로 관심 주제를 골랐다 / When 칩 줄을 본다 / Then A, B, C 순으로 앞쪽에 배치되고 그 뒤로 나머지 주제가 `display_order` 순으로 붙는다
- Given 발행 콘텐츠가 0건인 주제가 있다 / When 칩 줄을 본다 / Then 그 주제도 칩으로 노출되고, 고르면 E9 빈 결과 화면이 뜬다
- Given 관심 주제 중 콘텐츠가 0건인 주제가 있다 / When 칩 줄을 본다 / Then 그 주제도 칩으로 노출된다(피드에 `topic_group` 섹션이 없는 것과 무관하다)
