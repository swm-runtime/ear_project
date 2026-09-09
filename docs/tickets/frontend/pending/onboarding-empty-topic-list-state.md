# [FE] 주제 목록이 0건이면 온보딩 1단계가 빈 화면이 된다 — 재시도 수단이 없다

| 항목 | 값 |
|---|---|
| 대상 | `features/onboarding/screens/TopicSelectScreen.tsx` · `hooks/useTopicSelectScreen.ts` · `features/interest/` 관심사 관리 화면 |
| 요청 파트 | 프론트엔드 |
| 발행 날짜 | 2026-09-09 |
| 발견 시점 | 2026-09-09 백엔드 수정(`fix(be)/audit-followups-0909`) — 서버가 숨김 주제 폴백을 없애면서 **빈 목록이 실제로 내려올 수 있게 됐다** |
| 근거 문서 | `features/onboarding.md` 7 · `spec/api/onboarding-api.md` 4.2 · `spec/uiux/onboarding-uiux.md` 4.2(O6) |
| 심각도 | **중** — 발생 조건은 드물지만, 걸리면 **온보딩을 진행할 수도 나갈 수도 없다** |

## 무엇이 바뀌었나 (서버)

종전에는 노출 주제(`is_visible = true`)가 0건이면 서버가 **`is_visible`을 무시하고 전체 주제를 폴백으로** 내려줬다. 그런데 그 목록은 **저장할 수 없다** — 저장 API가 같은 `is_visible`로 거부하기 때문에, 사용자는 고를 수는 있는데 [다음]에서 400을 받고 **재조회해도 같은 목록을 다시 본다.** 빠져나갈 수 없는 화면이었다.

문서가 정한 것도 그 반대다.

> 그럼에도 목록이 0건이면 데이터 정합성 오류로 다루어 운영 알림을 발생시키고 … **폴백 주제를 만들지 않는다.** (`onboarding.md` 7)
> `is_visible = false`인 주제는 목록에 담지도, **저장을 허용하지도 않는다.** (`onboarding-api.md` 4.2)

**그래서 서버는 이제 빈 목록(`items: []`)을 200으로 내려준다.** 운영이 `is_visible`을 켜는 순간 같은 재시도가 통과한다.

## 문제 — 지금 화면은 그 상태를 그리지 않는다

`TopicSelectScreen`은 `isError`일 때만 `FullScreenError`(재시도 버튼)를 그린다. 빈 목록은 **정상 응답(200)** 이라 `isError`가 `false`다.

```ts
toRows(topics).map((row, rowIndex) => ( ... ))
```

`toRows`가 `rows.filter((row) => row.length > 0)`로 끝나므로 **크래시는 나지 않는다.** 대신:

- 마퀴 영역이 **아무것도 없이 비어 있다**
- 헤드라인("궁금한 이야기를 / 최대 3개까지 골라주세요")은 그대로 보인다
- [다음]은 0개 선택이라 **비활성**이다
- 이 화면에는 [건너뛰기]가 없다(`onboarding-uiux.md` 4.1 — 의도된 규칙)

**결과: 무엇을 해야 하는지 알 수 없고, 다시 시도할 수단도 없는 화면에 갇힌다.** 앱을 껐다 켜도 같은 화면으로 돌아온다.

## 요청 내용

1. **빈 목록을 조회 실패와 같은 층으로 다룬다.** `topics.length === 0`이면 O6 상태(`FullScreenError` + [다시 시도])를 그린다. 서버가 운영 알림을 이미 올리므로 화면은 재시도만 제공하면 된다.
   - 카피는 기존 `loadFailedTitle` / `loadFailedDescription`을 재사용해도 되는지 확인이 필요하다 — "불러오지 못했어요"가 **응답은 정상인데 내용이 없는** 상태에 맞는지. 맞지 않으면 확정 카피가 필요하다(`onboarding-uiux.md` 8장).
2. **관심사 관리(IM) 화면도 같은 엔드포인트를 쓴다.** 같은 처리가 필요한지 확인한다.
3. **`is_fallback` 필드는 이제 항상 `false`다.** 서버가 폴백을 만들지 않는다. `interest.api.ts`가 매핑만 하고 소비처가 없으므로 동작 영향은 없지만, 남겨둘지 정리할지 판단이 필요하다 — 계약 필드는 유지돼 있다(`onboarding-api.md` 4.2).

## 발생 조건 (참고)

`topics` 테이블에 `is_visible = true`인 행이 하나도 없을 때다. 정상 운영에서는 일어나지 않는다. 다만 **2026-09-09부터 `topics.is_visible`의 DB 기본값이 `false`로 바뀌었으므로**(`domain.md` 4.1대로), 주제를 새로 만들고 노출을 켜지 않은 채 초기화된 환경에서는 그대로 재현된다.

## 완료 조건

- Given 노출 주제가 0건인 서버 / When 온보딩 1단계에 진입한다 / Then 빈 화면이 아니라 재시도할 수 있는 상태가 보인다
- Given 그 화면 / When 운영이 주제를 노출시킨 뒤 [다시 시도]를 누른다 / Then 목록이 그려지고 진행할 수 있다
- Given 관심사 관리 화면 / When 같은 조건에 진입한다 / Then 같은 규칙으로 그려진다

---

## 처리 기록

| 항목 | 값 |
|---|---|
| 상태 | **부분 반영 — 요청 1·3 완료, 요청 2 보류** |
| 반영 날짜 | 2026-09-09 (요청 1·3) |
| 반영 브랜치 | `fix(fe)/onboarding-empty-topic-list` |
| Jira | KAN-41 |
| 문서 수정 요청 | `changes/pending/onboarding-empty-topic-list.md` |

### 요청 1 — 빈 목록을 O6으로 그린다 · 반영

`services/topic-list-state.ts`에 `isTopicListUnavailable`을 두어 **조회 실패와 "200인데 0건"을
한 판정으로 합쳤다.** 조회 중(`isPending`)에는 판정하지 않는다 — 그때의 0건은 "비어 있음"이 아니라
"아직 모름"이라 O5 스켈레톤을 덮으면 안 된다.

`useTopicSelectScreen`이 `isError` 대신 `isUnavailable`·`isEmpty`를 내보내고, `TopicSelectScreen`이
`isUnavailable`이면 `FullScreenError` + [다시 시도]를, 아니면 마퀴와 [다음] 독을 그린다.

**카피는 재사용하지 않았다.** 기존 `loadFailedTitle`("주제를 불러오지 못했어요")은 불러오기가
실패했다는 뜻인데 이 상태는 **200이라 실패가 아니다.** `onboarding.md` 7이 이 상태에
"준비 중입니다" 안내를 이미 지정해 뒀으므로 그 의도를 따라 `emptyTitle`·`emptyDescription`을 새로
뒀다(사용자 확인 2026-09-09). 확정 카피는 uiux 소유이므로 문서 반영 요청에 함께 실었다.

### 요청 2 — 관심사 관리(IM) 화면 · **보류**

**보류 사유.** IM은 앱바 뒤로가기와 `beforeRemove`(변경 없음 → 그대로 이탈)가 있어 **갇히지
않는다.** 칩 영역이 비고 [저장]이 0개 사유로 잠길 뿐이라 온보딩과 심각도가 다르다. 게다가
`interest-management-uiux.md` 9장이 이 처리를 **미결로 남겨 두고** (a) 온보딩과 같은 폴백 세트
(b) 조회 실패(IM9)와 동일 두 선택지를 적어 놨다 — (a)는 폴백 소멸로 자동 탈락했지만 (b)를
확정한 문서가 없다. **동작 규칙은 `features/`가 정한다**는 원칙에 따라 코드로 먼저 정하지 않았다.
(범위 결정: 사용자 2026-09-09 — "온보딩만 고친다".)

**남은 결정 항목.**
1. `features/interest-management.md`가 빈 목록 처리를 정한다 — IM9와 동일하게 그릴 것인가, 빈 칩 영역을 그대로 둘 것인가.
2. IM9와 동일로 정해질 경우, 카피를 기존 `INTEREST_COPY.loadFailed`("주제 목록을 불러올 수 없어요") 재사용으로 둘지 온보딩의 "준비 중" 카피와 맞출지 — 온보딩과 같은 이유로 "불러올 수 없어요"는 사실과 다르다.
3. 정해지면 `refetchAll`도 함께 고쳐야 한다 — 현재는 `isError`인 쿼리만 refetch하므로 **성공 상태(0건)에서는 [다시 시도]가 아무 요청도 보내지 않는다.**

### 요청 3 — `is_fallback` · 반영(정리)

**DTO에는 남기고 모델에서는 뺐다.** 계약 필드는 유지돼 있으므로(`onboarding-api.md` 4.2)
`TopicListResponseDto.is_fallback` 선언은 남겨 서버 응답 모양을 그대로 비추되,
`TopicList`(모델)에서는 제거하고 `toTopicList`의 매핑도 지웠다. 항상 `false`인 값을 모델에 두면
언젠가 늘 거짓인 조건으로 분기가 생긴다. 양쪽에 사유 주석을 남겼다.

### 완료 조건 확인

| 완료 조건 | 결과 |
|---|---|
| 노출 주제 0건 서버 / 온보딩 1단계 진입 / 빈 화면이 아니라 재시도할 수 있는 상태 | **충족** — `isTopicListUnavailable`이 참이 되어 `FullScreenError`("아직 준비 중이에요" + [다시 시도])를 그린다 |
| 운영이 주제를 노출시킨 뒤 [다시 시도] / 목록이 그려지고 진행할 수 있다 | **충족** — [다시 시도]는 `topicsQuery.refetch()`이고, 성공 상태의 refetch라 `isRefetching`으로 연타가 막힌다. 응답에 주제가 실리면 판정이 거짓이 되어 마퀴·[다음] 독이 돌아온다 |
| 관심사 관리 화면 / 같은 조건 진입 / 같은 규칙으로 그려진다 | **미충족(보류)** — 위 "요청 2" 참조 |

**요청 2가 미충족이므로 `archive/`로 옮기지 않고 `pending/`에 둔다.**
