# [FE] 탐색 피드 — 관심 주제가 2개 이상이면 섹션 React key가 충돌한다

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/features/explore/screens/ExploreScreen.tsx` (171~172행 — `SectionList`의 `sections` 조립) · 필요하면 `explore.types.ts`의 `ExploreSection` |
| 요청 파트 | 프론트엔드 |
| 발견 시점 | 2026-08-08 탐색 통합 테스트 (`integration/explore`, 실서버 전환 `EXPO_PUBLIC_EXPLORE_API=real`) |
| 근거 문서 | `spec/api/explore-api.md` 4.1(`sections[].key`는 분석·로깅용) · `features/explore.md` 4.1(섹션 구성·순서는 서버 제어) |
| 심각도 | **중** — 지금은 화면이 맞게 그려진다. 다만 React가 "duplicated and/or omitted"라고 경고하는 **미정의 동작**이고, 관심 주제 수만큼 매 렌더 반복된다 |
| 상태 | **완료(2026-08-08)** — FE 반영 + mock 확인(아래 기록) |

> **처리 기록 (2026-08-08, FE)**
> ① 화면 타입에서 `ExploreSection.key`를 `sectionKey`로 개명(DTO·변환기는 계약 필드명 `key` 유지) — 스프레드로 예약 필드에 흘러들 경로를 구조적으로 차단
> ② `explore.section-key.ts` 신설 — `buildSectionListKey()`: `topic_group`은 `topic.id`로, 나머지는 섹션명 그대로(응답에 하나씩). 인덱스 미사용(순서 변경 시 재마운트 방지). SectionList에 명시적으로 `key`를 넣는다
> ③ 토글 노출 판정은 `period` 분기 그대로 — 계약 규약 무변경
> ④ mock 피드에 `topic_group` 2개(커리어·생산성) 케이스 추가 — 이 회귀는 이제 mock에서도 재현·검출된다
> mock에서 확인: 두 topic_group 섹션 노출 상태로 진입·토글 전환·필터 선택/해제에 key 에러 0건, `key: section.sectionKey`로 되돌리면 에러 재현됨. 실서버 완료 조건(관심 주제 2개 이상 계정)은 다음 통합 테스트에서 같은 절차로 재확인한다.

## 증상

관심 주제가 2개 이상인 계정으로 탐색 탭에 진입하면 콘솔에 아래 오류가 **관심 주제 수만큼** 찍힌다.

```
ERROR  Encountered two children with the same key, `.$topic_group=2header`.
ERROR  Encountered two children with the same key, `.$topic_group=27f5f103a-38ae-4b43-afc6-3cde6918aaaa`.
ERROR  Encountered two children with the same key, `.$topic_group=2footer`.
```

LogBox가 지목하는 위치는 `ExploreScreen.tsx (171:7)` — `<SectionList<ExploreItem, FeedSection>`이다.

- 관심 주제 2개 계정에서 2건, 3개 계정에서 3건이 나왔다.
- 헤더·행·푸터 **세 자리 모두** 충돌한다. 섹션 하나가 통째로 같은 키를 쓴다는 뜻이다.
- **화면 갱신마다 다시 발생한다** — 인기 구간 토글 전환, 주제 필터 선택·해제, 담기·제거 후 재조회 모두에서 재현됐다.

**지금 화면은 정상으로 보인다.** 통합 테스트에서 `커리어`·`생산성` 두 섹션, `심리학`·`커리어`·`재테크` 세 섹션 모두 헤더와 행이 빠짐없이 그려졌다. 그래서 **버그가 아니라 시한폭탄에 가깝다** — React 공식 경고문 그대로 "children may be duplicated and/or omitted, the behavior is unsupported and could change in a future version"이다.

## 재현 절차

1. 온보딩에서 관심 주제를 **2개 이상** 고르고 완주한다.
2. 실서버로 전환한다(`EXPO_PUBLIC_EXPLORE_API=real`).
3. 탐색 탭에 진입한다 → 콘솔에 위 오류가 뜬다.
4. 인기 구간 토글을 눌러 구간을 바꾼다 → 같은 오류가 다시 쌓인다.

`GET /explore/feed` 응답에서 `key = "topic_group"`인 섹션이 몇 개인지 보면 그 수와 오류 건수가 일치한다.

## 원인

```tsx
sections={screen.sections.map((section) => ({ ...section, data: section.items }))}
```

**서버 응답의 `sections[].key`를 그대로 펼쳐 넣는다.** 그런데 `key`는 React Native `SectionList`(`VirtualizedSectionList`)가 **섹션의 React key로 쓰는 예약 필드**다 — 있으면 그 값을, 없으면 인덱스를 쓴다. `topic_group` 섹션은 주제마다 하나씩 생기면서 `key`가 전부 `"topic_group"`이므로, 주제가 몇 개든 섹션 키가 하나로 뭉친다.

**`keyExtractor`는 이 문제와 무관하다.** 그쪽은 행(item)의 키를 정하고, 지금 충돌하는 것은 섹션 단위 키다(`...header` · `...footer`가 함께 찍히는 이유).

역설적인 지점을 적어 둔다 — `explore-api.md` 4.1은 **"`key`는 분석·로깅용이며 화면 분기에 쓰지 않는다"**고 못박고 있고 코드도 그 규약을 지키고 있다(토글 노출은 `period`로 가른다). 그런데 RN에서 `key`는 **분기에 쓰지 않아도 프레임워크가 자동으로 소비한다.** 계약의 필드명과 RN의 예약 필드명이 우연히 겹친 것이 원인이다.

## 고쳐야 할 것

### 1. 서버의 `key`를 SectionList의 `key`로 흘려보내지 않는다

`sections`를 조립할 때 **서버 `key`를 그대로 펼치지 말고**, 화면용 키를 따로 만들어 넣는다. 같은 `key`를 가진 섹션이 여러 개 있을 수 있다는 것이 계약이므로(주제별 모아보기), **`key` 하나만으로는 어떤 조합으로도 유일해지지 않는다.**

유일성을 만들 재료는 응답 안에 이미 있다.

| 섹션 | 구분 재료 |
|---|---|
| `topic_group` | `topic.id` — 주제마다 다르다 |
| `popular` · `new` · `interest` | 응답에 하나씩만 온다 |

- **인덱스를 섞어 쓰는 것으로 충분하다면 그렇게 한다.** 다만 인덱스만 쓰면 서버가 섹션 순서를 바꿀 때 전체가 재마운트된다 — `topic.id`가 있는 섹션은 그것을 우선 쓰는 편이 낫다.
- **`ExploreSection.key`의 이름을 바꿀지는 함께 판단한다.** 뷰 모델에서 `sectionKey` 같은 이름으로 옮기면 앞으로 누가 다시 펼쳐 넣어도 충돌하지 않는다. 다만 `explore-api.md`의 필드명은 `key`이므로 **DTO 계층에서는 이름을 유지한다** — 바꾸는 것은 화면이 쓰는 타입까지다.

### 2. `key`를 화면 분기에 쓰지 않는 규약은 그대로 둔다

이 티켓은 **키의 유일성만 고친다.** 토글 노출 판정을 `period`로 가르는 현재 구현(`ExploreScreen.tsx` 194~195행 주석)은 계약대로이므로 건드리지 않는다.

### 3. 회귀 방지

관심 주제가 2개 이상인 피드를 렌더할 때 섹션 키가 유일한지 확인하는 테스트를 둔다. mock 피드에 `topic_group` 섹션이 2개 이상 들어가는 케이스가 없으면 그것부터 추가한다 — **mock에 한 개만 있으면 이 버그는 mock 개발 중에는 영원히 재현되지 않는다**(실제로 실서버 전환 후에야 발견됐다).

## 함께 확인할 것

- **라이브러리·다른 화면에도 같은 형태가 있는지 본다.** 서버 응답 객체를 `SectionList`/`FlatList`의 아이템으로 그대로 펼쳐 넣는 곳이 있으면 같은 충돌이 잠재한다.
- **섹션이 0건인 주제는 서버가 내려주지 않는다**(`explore-api.md` 4.1). 그래서 `topic_group` 섹션 수는 관심 주제 수 이하이며, 관심 주제가 1개인 계정에서는 이 버그가 재현되지 않는다. **테스트 계정을 1개짜리로만 쓰면 놓친다.**

## 완료 조건

- Given 관심 주제가 3개인 계정으로 실서버에 접속한다 / When 탐색 탭에 진입한다 / Then 콘솔에 `Encountered two children with the same key` 오류가 **한 건도** 뜨지 않는다
- Given 같은 계정으로 탐색에 있다 / When 인기 구간을 주간→월간→전체로 바꾼다 / Then 오류가 다시 뜨지 않고, 인기 섹션만 갈아끼워지는 동작도 그대로다
- Given 같은 계정으로 탐색에 있다 / When 주제 칩을 선택했다가 해제한다 / Then 섹션형 피드로 돌아오며 오류가 없고, 직전에 고른 인기 구간이 유지된다
- Given `topic_group` 섹션이 2개 이상인 피드 응답 / When 섹션 키 목록을 본다 / Then 중복이 없다
- Given 코드에서 토글 노출 판정을 찾는다 / When `renderSectionHeader`를 본다 / Then 여전히 `period` 값으로 가르고 `key`로 분기하지 않는다
