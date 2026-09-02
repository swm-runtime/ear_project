# [FE] library-api.md — 목록 조회에 source_filter 파라미터 추가 (백엔드 협의 필요)

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/spec/api/library-api.md` 4.1 (목록 조회 Request) · 3장 설계 메모 |
| 요청 파트 | 프론트엔드 |
| 관련 작업 | 라이브러리 FE 구현 (`feat(fe)/library`, 2026-08-07) — 카드·필터 개편(`library-card-and-filter-redesign(fe).md`)의 후속 |
| 백엔드 협의 | ~~필요~~ → **완료 (2026-08-07)** |
| 상태 | **반영 완료** (2026-08-07, 라이브러리 통합 시점) |

> **2026-08-07 협의 결과** — 제안대로 `source_filter`를 추가하고, "함께 결정할 것" 3건을 다음과 같이 닫았다.
>
> 1. **`filter=drip` 존치** → **제거.** 같은 조회를 두 파라미터로 표현할 수 있게 되면 커서 발급 조건에 두 축이 들어가고 어느 쪽이 맞는지 판단해야 하는 순간이 생긴다. 배포된 클라이언트가 없어 하위 호환을 지킬 이유도 없다. `filter`는 상태 전용(`all`/`unplayed`/`completed`)이 됐다.
> 2. **인덱스 영향** → `library-api.md` 9장의 인덱스 미결에 **`source` 축을 항목으로 추가**했다. 나머지 세 건과 함께 `domain.md`에서 보기로 하고 이번에 고치지 않았다.
> 3. **응답 변경 없음** → 그대로. `is_counted_today`·잔여 표시값은 손대지 않았다.
>
> 반영한 문서는 `spec/api/library-api.md` 4.1(Request 표 · `source_filter` 조건 표 · 커서 조건 · 3장 엔드포인트 설명 · 1장 범위)과 9장 미결 2건이다. `source = 'onboarding'` 취급 미결도 **`save`에 포함**으로 닫혔다.
>
> **서버 구현은 아직 없다** — `tickets/backend/pending/library-source-filter-not-implemented.md`로 발행했다. FE의 `library.dto.ts` TODO 주석은 그 티켓이 닫힐 때 함께 지운다.

## 왜 필요한가

카드에서 출처 배지를 없애고 출처 구분을 필터 팝업으로 옮기면서(연관 changes 문서 참조),
**상태 탭과 출처 필터의 AND 조합**(예: 미청취 + 이어 PICK)이 필요해졌다.
현행 계약의 `filter` enum(`all/unplayed/completed/drip`)은 상호 배타라 상태와 출처를
동시에 걸 수 없다.

## 제안 계약

`GET /users/me/library-items` Request에 추가:

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| source_filter | enum `drip` / `save` | 선택 | `drip` → `source = 'drip'` · `save` → `source IN ('save', 'onboarding')` |

- `filter`(상태)·`source_filter`(출처)·`topic_filter`(주제)는 **전부 AND 조합**이다.
- **커서 발급 조건에 `source_filter`를 포함한다** — 발급 시점과 다르면 기존 규칙대로
  `LIBRARY_CURSOR_INVALID`(400)로 거절한다.
- FE 구현·mock은 이 계약으로 이미 동작한다(`frontend/src/features/library/api/library.dto.ts`
  TODO 주석 참조). 백엔드 합의 후 이 문서를 library-api.md 4.1에 반영하고 TODO를 지운다.

## 함께 결정할 것 (백엔드 협의 항목)

1. **`filter=drip`의 존치** — 탭에서 [이어 PICK]이 빠지면 클라이언트는 `filter`를 상태로만,
   출처는 `source_filter`로 보낸다. `filter` enum에서 `drip`을 제거할지(계약 단순화),
   하위 호환으로 남길지 결정 필요. 아직 배포된 클라이언트가 없으므로 제거가 깔끔하다.
2. **인덱스 영향** — library-api.md 9장이 이미 지적한 목록 조회 인덱스 미결에
   `source` 축이 추가된다. domain.md 인덱스 보강 논의에 포함시킬 것.
3. `is_counted_today`·잔여 표시값 등 응답 쪽은 변경 없음.

## 완료 조건

- Given 백엔드와 계약이 합의된다 / When `spec/api/library-api.md` 4.1을 읽는다 /
  Then `source_filter` 파라미터(값 의미·AND 조합·커서 규칙 포함)가 Request 표에 있고,
  `filter=drip`의 존치 여부가 명시되어 있다
- Given 서버가 구현된다 / When `filter=unplayed&source_filter=drip`으로 조회한다 /
  Then 드립으로 적립된 미청취 콘텐츠만 커서 페이지네이션으로 내려온다
