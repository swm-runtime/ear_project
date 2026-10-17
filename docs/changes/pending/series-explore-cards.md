# 시리즈 2단계 — 탐색 시리즈 카드(`type: "content" | "series"`) · 서버 스위치 `SERIES_EXPLORE_CARDS_ENABLED` (BE)

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/explore-api.md` 4.1 피드 · 4.2 주제별 · 4.2-1 인기 · 4.5 검색(항목 종류·시리즈 카드·커서·시리즈 제목 일치) · 5장 에러(변경 없음 확인) · `features/explore.md` 4.1·4.4·4.5-5(소유 파트 몫 — 아래 "범위 밖") · `infra/runbook.md`(스위치 켜는 순서) |
| 요청 파트 | 백엔드 — 박준현 |
| 발행 날짜 | 2026-10-17 |
| 관련 | [KAN-134](https://runtime364.atlassian.net/browse/KAN-134) 확정 설계 4번 · FE [KAN-225](https://runtime364.atlassian.net/browse/KAN-225)(`tickets/frontend/pending/series-display.md`) · 1단계 계약 `changes/pending/series-backend-phase1.md` · 브랜치 `feat(be)/series-explore-cards`(1단계 `feat(be)/series-backend` 위) |

## 배경

탐색에서 시리즈는 하나의 요소다(결정 2026-10-09). 지금은 편마다 한 줄이라 16편짜리 시리즈 하나가 목록을 덮는다. 같은 시리즈 편들을 **시리즈 카드 하나**로 접는다. 항목 종류가 새로 생기므로(`type: "series"`) **1.2.x 앱은 이 응답을 그리지 못한다** — 헤더로 가르지 않고(철회 2026-10-17) 앱 1.3.0과 함께, 최소 지원 버전을 1.3.0으로 올린 뒤 서버 스위치로 켠다.

## 수정 내용

### 1. 서버 스위치 `SERIES_EXPLORE_CARDS_ENABLED`

- 선택 키, 값 `true`/`false`/빈 값. **`true`를 명시했을 때만 켜진다**(`GLOBAL_SIGNUP_ENABLED`와 같은 꼴 — `env.validation.ts`, `deploy/push.sh`의 알려진 선택 키, `.env.example`). Secrets에 없으면 빈 채로 꺼진다.
- **꺼져 있으면 응답·커서가 1단계와 같다** — 항목에 `type` 키가 없고, 시리즈 편은 편마다 한 줄이고, 커서 payload에 `g`가 없고, 검색은 시리즈 제목을 보지 않는다. 피드 섹션의 후보 수도 종전 그대로(10)다. e2e `test/series-explore-cards.e2e-spec.ts`가 피드·주제 칩·주제별·인기·검색에서 이를 확인한다.
- 개발계: FE KAN-225가 준비되면 켠다(지금 개발계 미리보기 앱에는 카드 UI가 없어 켜면 탐색이 깨진다). 운영: 아래 "켜는 순서".

### 2. `explore-api.md` — 항목 종류(스위치 켬)

피드 섹션의 `items[]` · 주제별(4.2) · 인기(4.2-1) · 검색(4.5)의 `items[]`와 검색 `fallback.popular_items[]`가 **두 종류가 섞인 목록**이 된다. 클라이언트는 `type`으로 가른다(모르는 `type`은 건너뛴다).

**콘텐츠 행** — 종전 행과 같고 `type`만 붙는다(시리즈가 아닌 콘텐츠만 이 모양으로 나온다 — 시리즈 편은 카드가 대신한다):

```jsonc
{
  "type": "content",
  "content": {
    "id": "uuid", "title": "…", "author_name": null, "source_name": "…", "source_url": null,
    "duration_sec": 620, "thumbnail_url": "https://…", "language": "ko", "content_version": 1,
    "topic_ids": ["uuid"], "tags": ["…"],
    "series": null
  },
  "library": { "item_id": "uuid", "source": "save", "status": "completed" } | null,
  "is_counted_today": false
}
```

**시리즈 카드**:

```jsonc
{
  "type": "series",
  "series": {
    "id": "7de91e6e-2e96-4aea-9ddb-80fe99179c2e",
    "title": "키워드로 빠르게 배우는 CS 지식",
    "description": "소프트웨어 개발부터 …",
    "total_episodes": 16,     // 계획 편수(시리즈 표)
    "episode_count": 16,      // 지금 사용자 시장에 노출 중인 편 수 — 진행 중 시리즈면 total_episodes 보다 적다
    "status": "completed",    // ongoing | completed — 표시용
    "thumbnail_url": "https://…/1화.webp",   // 표지 = 노출 중인 가장 앞 편(보통 1화)의 썸네일
    "topic_ids": ["uuid", "uuid"]            // 노출 중인 편들의 주제 합집합(처음 나온 순서)
  }
}
```

- 카드를 탭하면 `GET /series/:series_id`(1단계 계약)로 시리즈 화면을 연다 — "행 탭 = 즉시 재생"(`explore.md` 4.4)의 예외. 카드에는 편 단위 상태(`library`·`is_counted_today`)가 없다 — 시리즈 화면이 편마다 준다.
- **카드의 자리(순위) = 그 시리즈 편 중 순위가 가장 높은 편의 자리**(= 편 점수의 최댓값, 확정한 세부). 그 목록의 정렬 규칙(인기·추천 랭킹·검색 점수)을 바꾸지 않고, 순위순으로 훑다가 시리즈를 처음 만난 편에서 카드를 낸다.
- **한 목록(페이지를 넘어도)에 같은 시리즈 카드는 한 번**이다. 피드는 **섹션마다** 접는다 — 같은 시리즈가 인기·새로 나온 콘텐츠 두 섹션에 각각 카드로 나올 수 있다(콘텐츠가 섹션마다 겹쳐 나오는 것과 같다).
- 주제 필터·검색은 **편 단위로 걸고** 접는다 — 필터에 맞는 편이 하나라도 있으면 카드가 나오고, 카드의 `topic_ids`·`episode_count`는 필터와 무관한 시리즈 전체(노출 편) 값이다.
- 시장 격리는 종전과 같다 — 다른 시장 편은 목록에 없으므로 카드도 없다.

### 3. 페이지네이션(주제별·인기·검색) — 커서 의미

- **정렬 키·커서 위치는 종전 그대로다**(편 단위 키셋). 서버는 `limit`개 항목을 채울 때까지 편 행을 순위순으로 훑으며, 이미 낸 시리즈의 편은 건너뛴다. 건너뛰어 모자라면 **마지막으로 훑은 위치에서 이어 읽는다**(최대 5번).
- 다음 커서 = **마지막으로 훑은 편 행의 위치**(낸 항목이 아니다) + **`g`: 이미 낸 시리즈 id 목록(정렬)**. 서버 상태 없이 뒤 페이지가 같은 시리즈를 다시 내지 않게 한다. 같은 데이터·같은 커서면 같은 페이지다.
  - 커서는 여전히 불투명 문자열이다(클라이언트는 해석하지 않는다). `g`에 uuid가 아닌 값이 있으면 400 `EXPLORE_CURSOR_INVALID`(종전 코드).
  - `g`의 길이는 그 목록에 나온 시리즈 수만큼이다(시리즈는 수십 단위).
- `has_next`·`next_cursor` 규칙은 종전과 같다(`has_next = false`면 `next_cursor = null`). 이어 읽기 상한에 걸리면 **`limit`보다 적은(드물게 0개) 항목과 `has_next: true`** 가 올 수 있다 — 클라이언트는 `has_next`만 보고 다음 페이지를 부른다(개수로 끝을 판정하지 않는다).
- 스위치를 켜기 전에 받은 커서(`g` 없음)를 켠 뒤에 쓰면, 앞 페이지에서 편으로 나왔던 시리즈가 카드로 한 번 더 나올 수 있다(전환 순간 한 번). 켠 뒤 받은 커서를 끈 뒤에 쓰면 `g`는 무시된다.

### 4. 검색(4.5) — 시리즈 제목 일치

- 스위치를 켜면 **시리즈 제목이 맞는 편도 결과에 든다**(가중은 제목과 같다). 그 편들이 카드로 접히므로 결과는 시리즈 카드 하나다. 편 제목이 이미 시리즈 이름을 품고 있는 경우(CS 시리즈)는 결과가 같다.
- 태그 전용 검색(`#…`)은 종전대로 태그만 본다.
- 검색 로그(`search_query_logs`)의 결과 수·결과 콘텐츠 id는 **낸 항목** 기준이다(카드는 그 자리의 편 id).
- 빈 결과의 `fallback.popular_items`도 같은 규칙으로 접는다.

### 5. 피드(4.1) 섹션

- 섹션은 커서가 없어 이어 읽지 않으므로, 켜져 있으면 후보를 **30건(10 × 3)** 읽어 접은 뒤 10칸으로 자른다. 관심사 섹션은 개인 적합도로 다시 줄 세운 뒤 접는다.

## 켜는 순서 (운영)

1. 스토어에 앱 **1.3.0**(KAN-225 — 카드·시리즈 화면을 그리는 앱)이 출시돼 있다.
2. `dev → main` 배포(이 브랜치 포함 — 스위치는 빈 값이라 꺼진 채 나간다. 응답은 1단계와 같다).
3. **최소 지원 버전을 1.3.0**으로 올린다(1.2.x는 업데이트 화면으로 막힌다).
4. Secrets에 `SERIES_EXPLORE_CARDS_ENABLED=true`를 넣고 API 컨테이너를 다시 띄운다(`compose-recreate`는 `API_IMAGE` 고정 — runbook). 끄려면 값을 비우고 다시 띄운다(즉시 1단계 응답).

## 범위 밖

- `features/explore.md` 4.1(시리즈 카드)·4.4(카드 탭 예외)·4.5-5(시리즈 제목 일치) 개정 — 화면 쪽(FE·PM) 몫(KAN-225가 같은 PR에서 고친다).
- 라이브러리의 시리즈 묶음 — 두지 않는다(편 단위 그대로).
- 카드 순위의 별도 점수식 — 두지 않는다(목록의 정렬 규칙 그대로, 편 최고 순위 자리).

## 완료 조건

- Given 스위치가 비어 있다 / When 피드·주제 칩·주제별·인기·검색을 부른다 / Then 항목에 `type` 키가 없고 시리즈 편이 편마다 한 줄이며 커서에 `g`가 없다(1단계와 같은 모양)
- Given 스위치 `true` · 발행된 시리즈 3편 / When 주제별·인기·검색을 끝까지 넘긴다 / Then 시리즈 카드가 한 번 나오고 편 3개가 따로 나오지 않으며 단일 콘텐츠는 빠짐·중복 없이 전부 나온다
- Given 스위치 `true` / When 시리즈 제목에만 있는 낱말로 검색한다 / Then 그 시리즈 카드가 나온다
- Given 스위치 `true` / When 피드를 본다 / Then 섹션마다 같은 시리즈는 카드 하나이고 섹션은 10칸까지 채워진다
- Given `explore-api.md` / When 4.1·4.2·4.2-1·4.5를 읽는다 / Then 항목 종류 두 가지의 JSON·카드 자리 규칙·커서(`g`)·스위치·켜는 순서가 적혀 있다

## 처리 기록

- 2026-10-17 발행. 단위(`explore.series-grouping.spec.ts`·`explore.orchestrator.spec.ts` 스위치 켬 블록·`series.service.spec.ts` findCards)와 e2e(`test/series-explore-cards.e2e-spec.ts` — 꺼짐/켬 두 앱) 통과.
