# [FE] 인기 콘텐츠 구간 토글(E13)이 없다

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/features/explore/` — `screens/ExploreScreen.tsx` · `components/`(구간 토글 신설) · `hooks/`(인기 목록 조회 신설) · `api/explore.dto.ts` · `api/explore.api.ts` · `api/explore.mock.ts` · `explore.copy.ts` · `explore.types.ts` |
| 요청 파트 | 프론트엔드 |
| 발견 시점 | 2026-08-07 탐색 통합 (`integration/explore`) — 인기 구간 선택 문서 반영 중 |
| 근거 문서 | `spec/uiux/explore-uiux.md` **4.10(E13)** · 2장·4.1·5~8장 · `features/explore.md` **4.1-1** · `spec/api/explore-api.md` **4.2-1**·4.1 |
| 심각도 | **중** — 기존 화면이 깨지지는 않는다. 확정된 화면 규칙 하나가 통째로 빠져 있다 |
| 상태 | 대기 |

> **짝 티켓** — `tickets/backend/pending/explore-popular-period.md`. **서버가 먼저 나가야 실서버 전환으로 확인할 수 있다.** 그 전까지는 mock으로 화면을 완성해 두면 된다(탐색 FE가 이미 그렇게 동작한다).
>
> **mock을 없애지 않는다.** 탐색도 다른 화면과 같이 `EXPO_PUBLIC_EXPLORE_API=real`로 실서버 전환을 켜고 끄며(`IS_EXPLORE_API_MOCKED`), **mock은 개발·테스트 경로로 그대로 남는다.**

## 증상

인기 콘텐츠의 집계 구간을 사용자가 고르는 규칙이 2026-08-07에 확정돼 세 문서에 반영됐는데, **탐색 화면에 그 컨트롤이 없다.** 인기 섹션은 서버가 준 목록 하나만 그린다.

`explore-uiux.md`가 요구하는 것과 현재 화면의 차이다.

| 문서 | 현재 화면 |
|---|---|
| 인기 섹션 제목 줄에 **주간·월간·전체** 3택 1 토글(4.10) | 제목만 있다 |
| 전환 중에는 **그 섹션만** 인라인 로딩 | 해당 상태가 없다 |
| 전환 실패 시 직전 목록 유지 + 인라인 에러 | 해당 상태가 없다 |
| 첫 진입 선택 상태는 피드 응답의 `period` | 그 필드를 읽지 않는다 |

## 재현 절차

1. 탐색 탭에 진입한다.
2. "인기 콘텐츠" 섹션 제목 줄을 본다.
3. → **구간을 고를 컨트롤이 없다.** 기대값은 주간·월간·전체 세그먼트 컨트롤(기본 월간 선택).

## 원인

탐색 FE 구현(`feat(fe)/explore`, PR #16) 시점에는 이 규칙이 문서에 없었다. 통합 과정에서 확정되면서 화면 명세가 넓어졌고, 구현만 남았다.

## 고쳐야 할 것

### 1. DTO — `api/explore.dto.ts`

```ts
export type ExplorePeriod = 'week' | 'month' | 'all';

/** GET /explore/popular (explore-api.md 4.2-1) */
export interface ExplorePopularRequestDto {
  period?: ExplorePeriod;   // 미전송이면 서버가 month로 해석한다
  cursor?: string;
  limit?: number;
}

export interface ExplorePopularResponseDto extends PlayLimitFieldsDto {
  period: ExplorePeriod;    // 서버가 되돌린 값 — 토글 선택 상태의 근거
  items: ExploreItemDto[];
  next_cursor: string | null;
  has_next: boolean;
}
```

- **`ExploreSectionDto`에 `period?: ExplorePeriod | null`을 추가한다.** `popular` 섹션만 값이 있고 나머지는 `null`이다 — `topic`이 `topic_group`에만 있는 것과 같은 형태다(`explore-api.md` 4.1).
- **행 타입은 그대로 `ExploreItemDto`를 쓴다.** 새 타입을 만들면 담기·재생 처리가 갈라진다.

### 2. 기본값을 클라이언트에 두지 않는다

**`period`를 보내지 않고 첫 조회를 한다.** 기본 구간은 서버가 정하며(`explore-api.md` 4.2-1), 선택 상태는 **응답의 `period`로 그린다.**

- 첫 진입은 애초에 `GET /explore/popular`를 부르지 않는다 — 피드 응답의 `popular` 섹션에 이미 기본 구간 목록과 `period`가 들어 있다.
- `explore.constants.ts`에 `DEFAULT_PERIOD = 'month'` 같은 상수를 만들지 않는다. 서버가 기본 구간을 바꿀 때 토글만 옛 값에 머문다(`explore-uiux.md` 8장 금지 사항).

### 3. 구간 토글 컴포넌트 — `components/`

주간·월간·전체 세그먼트 컨트롤. **인기 섹션 제목 줄에만 붙는다.**

- 라벨은 `explore.copy.ts`에 **"주간 / 월간 / 전체"** 세 단어로 둔다. `period` 값(`week`·`month`·`all`)은 전송값이고 라벨은 화면 문구다.
- **서버가 내려준 "인기 콘텐츠" 제목에 구간명을 덧붙이지 않는다**(`explore-uiux.md` 6장).
- 접근성: 라디오 그룹(또는 탭 목록)으로 읽히게 `aria-checked`/`aria-selected`, 터치 타깃 최소 44×44pt, 전환 완료를 `aria-live="polite"`로 한 번 알린다("월간 인기 콘텐츠, 10개").
- **선택 상태를 색만으로 구분하지 않는다** — 담김 배지와 같은 기준이다.

### 4. 인기 목록 조회 훅 — `hooks/`

`useExploreContentsQuery`와 같은 형태의 커서 무한 스크롤 훅을 하나 더 둔다.

- **피드를 다시 조회하지 않는다.** 토글은 인기 섹션만 갈아끼운다(`explore.md` 4.1-1).
- 전환 중에는 **직전 목록을 유지**한 채 그 섹션만 인라인 로딩. 다른 섹션·검색창 줄·주제 칩 줄·잔여 재생 표시는 건드리지 않는다.
- 전환 실패면 **직전 구간의 목록을 유지**하고 인라인 에러 + [다시 시도], 선택 상태도 직전 구간으로 되돌린다.
- 응답의 잔여 재생 표시값 3필드로 표시를 갱신한다 — 라이브러리·피드와 같은 값이다.
- **400 `EXPLORE_CURSOR_INVALID`** 는 사용자에게 노출하지 않고 커서를 버린 뒤 첫 페이지부터 조용히 재조회한다(`common-error-handling.md` 9.6). 구간을 바꿀 때 **직전 구간의 커서를 그대로 들고 가지 않는 것**이 우선이다.

### 5. 화면 배선 — `screens/ExploreScreen.tsx` · `hooks/useExploreScreen.ts`

- 주제 필터(E2)로 전환하면 **섹션 구조가 사라지므로 토글도 사라진다.**
- 칩을 전부 해제해 E1로 돌아오면 **직전에 고른 구간을 유지한다**(`explore.md` 4.1-1).
- 고른 구간은 **서버에 저장하지 않는다.** 탭 이탈·앱 재실행 시의 유지 범위는 화면이 정한다 — 화면 상태이지 사용자 상태가 아니다.
- **확정 구간이 없다는 이유로 탭을 숨기거나 비활성화하지 않는다.** 세 구간 모두 항상 고를 수 있다(`explore-uiux.md` 8장).

### 6. mock 확장 — `api/explore.mock.ts`

**mock은 그대로 유지하고 새 조회를 더한다.** 세 구간이 서로 다른 목록을 주도록 만든다 — **전부 같은 목록이면 토글이 동작하는지 확인할 수 없다.** 전환 실패 시나리오도 하나 둬 인라인 에러 경로를 확인한다.

## 함께 확인할 것

- **행 컴포넌트는 그대로 쓴다.** `ExploreContentRow`가 피드·필터 목록·인기 목록 셋에 모두 쓰인다 — 모양이 갈라지면 담기·재생 처리가 세 벌이 된다(`explore-uiux.md` 5장).
- **E8(피드 비어 있음)과 헷갈리지 않게 한다.** 구간과 무관하게 발행 콘텐츠가 있으면 목록이 채워지므로, 인기 섹션만 비는 상태는 없다(`explore-uiux.md` 4.10).
- **잔여 재생 표시는 라이브러리와 같은 컴포넌트를 계속 쓴다.** 인기 목록 응답이 새 갱신 시점이 될 뿐 규칙은 그대로다.

## 완료 조건

- Given 탐색 탭에 진입한다 / When 인기 섹션 제목 줄을 본다 / Then 주간·월간·전체 토글이 있고 **월간이 선택**되어 있다(피드 응답의 `period` 기준)
- Given 인기 섹션에서 [주간]을 탭한다 / When 화면을 본다 / Then **그 섹션의 목록만** 바뀌고 다른 섹션·검색창 줄·주제 칩 줄은 그대로다
- Given 구간 전환 요청이 실패한다 / When 화면을 본다 / Then 직전 구간의 목록이 남아 있고 인라인 에러 + [다시 시도]가 보이며, 선택 상태도 직전 구간이다
- Given 주제 칩을 골라 E2로 전환한다 / When 상단을 본다 / Then 구간 토글이 보이지 않는다
- Given [전체]를 고른 뒤 주제 칩을 걸었다 해제한다 / When 인기 섹션을 본다 / Then **[전체]가 그대로 선택**되어 있다
- Given 스크린리더를 켠다 / When 토글을 훑는다 / Then 세 선택지가 라디오 그룹(또는 탭)으로 읽히고 선택 상태가 낭독되며, 전환 후 결과 건수가 한 번 안내된다
- Given 인기 목록의 행 하나를 본다 / When 더보기를 열고 탭도 해본다 / Then 담기/제거·재생 동작이 피드의 행과 완전히 같다
- Given 코드에서 기본 구간을 찾는다 / When `explore.constants.ts`를 본다 / Then **기본 구간 상수가 없다** — 서버 응답의 `period`만 쓴다
