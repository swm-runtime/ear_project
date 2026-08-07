# [FE] 주제 칩 목록 — 실서버 호출 경로가 없다

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/features/explore/api/explore.dto.ts`(TODO 주석 제거) · `api/explore.api.ts` · `api/explore.mock.ts` · `hooks/useExploreTopicsQuery.ts` |
| 요청 파트 | 프론트엔드 |
| 발견 시점 | 2026-08-07 탐색 FE 구현 (`feat(fe)/explore`) — 계약에 없는 엔드포인트를 mock으로 선반영 |
| 근거 문서 | `changes/pending/explore-api-topics-endpoint(fe).md`(계약) · `changes/pending/explore-topic-chip-list(be).md`(서버 규칙) · `features/explore.md` 4.2 |
| 심각도 | **상** — 실서버로 전환하면 주제 칩 줄이 채워지지 않고, 칩을 고를 수 없으니 주제 필터(E2) 경로가 통째로 막힌다 |
| 상태 | 대기 |

> **짝 티켓** — `tickets/backend/pending/explore-topics-endpoint.md`. **서버가 먼저 나가야 이 티켓을 닫을 수 있다.** 화면·mock은 이미 이 계약으로 동작하므로 FE 작업량은 작다.
>
> **mock을 없애지 않는다.** 탐색도 다른 화면과 같이 `EXPO_PUBLIC_EXPLORE_API=real`로 실서버 전환을 켜고 끄며(`IS_EXPLORE_API_MOCKED`), **mock은 개발·테스트 경로로 그대로 남는다.** 이 티켓이 더하는 것은 그 스위치의 실서버 쪽 갈래 하나다.

## 증상

`explore.dto.ts`의 `ExploreTopicsResponseDto`에 주석이 그대로 남아 있다.

```
/**
 * 주제 칩 목록 — 제안 계약(TODO: explore-api.md 미반영, 백엔드 협의 필요).
 * … mock에만 구현되어 있다.
 */
```

`IS_EXPLORE_API_MOCKED`가 참인 동안에는 칩 줄이 정상으로 보이지만, **실서버로 전환하면 호출할 곳이 없다.**

## 재현 절차

1. `EXPLORE_MOCK`을 끄고 실서버로 전환한다.
2. 탐색 탭에 진입한다.
3. → 주제 칩 줄이 비고, 칩을 고를 수 없어 **E2(주제 필터 단일 목록)로 갈 방법이 없다.**

## 원인

FE 구현 시점에 `explore-api.md`에 이 엔드포인트가 없었다. 화면 규칙(`explore.md` 4.2)은 있는데 통로가 없어 **mock에만 선반영하고 요청을 올렸다.** 백엔드도 같은 것을 발견해 요청을 올렸고, 두 요청을 **FE 안으로 합쳤다**(2026-08-07). 서버 구현만 남았다.

## 고쳐야 할 것

### 1. 계약 확정 반영 — `api/explore.dto.ts`

계약이 확정됐으므로 **TODO 주석을 제거한다.** 타입 자체는 바뀌지 않는다.

```ts
export interface ExploreTopicsResponseDto {
  topics: { id: string; name: string; is_interest: boolean }[];
}
```

- **필드명은 `is_interest` 그대로다.** 백엔드가 FE 안을 채택했다.
- **정렬을 클라이언트가 다시 하지 않는다.** 서버가 관심 주제를 앞쪽에 배치해 내려준다 — 재배열하면 정렬 규칙이 두 곳에 생긴다.

### 2. 실서버 경로 — `api/explore.api.ts`

다른 다섯 호출과 같은 형태로 `IS_EXPLORE_API_MOCKED` 분기를 붙인다. `GET /explore/topics`, 파라미터 없음.

### 3. mock 데이터 정합 — `api/explore.mock.ts`

**mock은 그대로 유지한다.** 계약이 확정됐으므로 mock 데이터가 **서버 규칙과 같은 순서**를 내도록 맞추기만 한다 — 두 경로가 다른 순서를 내면 mock으로 확인한 화면이 실서버에서 달라진다.

| 구분 | 규칙 |
|---|---|
| 앞쪽 | 활성 관심 주제 **전부** — **선택한 순서**(`created_at` 오름차순) |
| 뒤쪽 | 그 밖의 노출 주제 — `display_order` 오름차순 |

- **숨김 처리된 관심 주제도 앞쪽에 포함된다.** mock에도 그 케이스를 하나 두면 실서버 전환 때 놀라지 않는다.
- **발행 콘텐츠가 0건인 주제도 노출된다.** 고르면 E9(필터 결과 없음)가 뜨는 것이 정상 동작이다.

### 4. 훅 — `hooks/useExploreTopicsQuery.ts`

이미 있으므로 **바뀌는 것이 없다.** 스위치가 mock과 실서버를 가르므로 훅은 그대로 두면 되고, 로딩·에러 처리도 기존 규칙(`common-error-handling.md`)을 따른다.

## 함께 확인할 것

- **E8(피드 비어 있음)에서는 칩 줄을 숨긴다**(`explore-uiux.md` 4.7). 주제 목록 조회가 성공해도 마찬가지다 — 어떤 칩을 골라도 결과가 없는데 조작할 것을 남겨두지 않는다.
- **칩 순서와 프로필 카드의 관심 주제 순서가 달라진다.** 프로필(`profile-api.md` 4.1)은 `display_order` 순, 칩은 선택 순서다. 목적이 달라 의도된 차이지만, 어긋나 보인다는 지적이 나오면 팀이 다시 본다.
- **관심사 관리 화면도 전체 주제 목록이 필요하다**(`interest-management.md` — API 명세 미작성). 같은 엔드포인트를 재사용할지는 그 화면을 설계할 때 정한다. **이 티켓에서는 탐색용으로만 쓴다.**

## 완료 조건

- Given 서버에 `GET /explore/topics`가 배포됐다 / When 실서버로 전환해 탐색 탭에 진입한다 / Then 칩 줄이 채워지고 **관심 주제가 앞쪽**에 온다
- Given 칩 하나를 고른다 / When 목록을 본다 / Then E2 단일 목록으로 전환되고 `GET /explore/contents`가 그 주제로 조회된다
- Given `explore.dto.ts`를 연다 / When `ExploreTopicsResponseDto` 주석을 본다 / Then **"백엔드 협의 필요" TODO가 없다**
- Given 코드에서 칩 정렬 로직을 찾는다 / When 훅과 화면을 본다 / Then **클라이언트가 순서를 재배열하는 코드가 없다** — 서버 응답 순서를 그대로 그린다
- Given 관리자가 사용자의 관심 주제를 숨김 처리했다 / When 칩 줄을 본다 / Then 그 칩이 앞쪽에 그대로 있고 필터를 걸 수 있다
- Given mock 모드로 실행한다 / When 칩 줄을 본다 / Then 실서버와 같은 순서 규칙으로 그려진다
