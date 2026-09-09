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
| 상태 | **완료 — 요청 1·2·3 전부 반영** |
| 반영 날짜 | 2026-09-09 (요청 1·3) · 2026-09-09 (요청 2) |
| 반영 브랜치 | `fix(fe)/onboarding-empty-topic-list`(요청 1·3, PR #257) · `fix(fe)/interest-empty-topic-list`(요청 2) |
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

### 실기기 확인 (2026-09-09)

프로덕션에서 `topics`를 전부 숨긴 짧은 창을 열어 확인했다(확인 직후 원복 — 켜져 있던 30개
id를 백업해 그것만 되돌렸다. 원래 숨김이던 6개는 건드리지 않았다).

| 조건 | 결과 |
|---|---|
| 노출 주제 0건 서버 / 온보딩 1단계 진입 / 재시도 가능한 상태가 보인다 | ✅ "아직 준비 중이에요" + [다시 시도] |
| 그 화면에서 운영이 주제를 노출시킨 뒤 [다시 시도] / 목록이 그려지고 진행 가능 | ✅ **앱 재시작 없이** 목록이 떴다 |
| 관심사 관리 화면도 같은 규칙 | ⬜ 보류(위 사유) |

**두 번째가 이 티켓의 핵심이다** — 종전에는 앱을 껐다 켜도 같은 화면으로 돌아왔다.

### 검증 과정에서 드러난 별건 — 릴리즈 누락

이 수정은 `dev` 머지만으로는 기기에 닿지 않는다. 스토어 빌드는 `production` 채널이고 그
채널은 `main` 머지에서만 발행된다. 첫 확인 시도가 "아무것도 안 뜸"으로 나온 원인이 그것이었다
(수정 전 증상과 구분되지 않아 코드 문제로 오독하기 쉽다).

**그런데 `dev → main` 릴리즈 PR(#260)이 충돌로 막혀 있다** — `main`에 `dev`를 거치지 않고
직접 머지된 커밋이 있다(#231·#236·#240·#242, 전부 `fix(pipeline)`). `CLAUDE.md`가 정한
"`main`은 `dev → main` PR로만 갱신한다"가 지켜지지 않은 결과다. 충돌 파일이 전부 `pipeline/`
이라 프론트 파트가 풀 수 없어, `dev`와 `main`의 프론트 차이가 이 티켓의 8개 파일뿐임을
확인한 뒤 **OTA만 따로 발행**해 확인을 진행했다. 충돌 해소는 파이프라인 파트 몫으로 남아 있다.


---

## 처리 기록 — 요청 2(관심사 관리) 반영

| 항목 | 값 |
|---|---|
| 반영 날짜 | 2026-09-09 |
| 반영 브랜치 | `fix(fe)/interest-empty-topic-list` |
| 결정 | **(b) 조회 실패(IM9)와 같은 층으로 그린다** (사용자 2026-09-09) |

보류 시 남겼던 결정 항목 3개가 모두 해소되어 마저 반영했다.

### 1. 빈 목록 처리 = IM9와 동일

`useInterestManagementScreen`이 온보딩과 **같은 판정**(`isTopicListUnavailable`)을 쓰고,
`isError`를 `isTopicsUnavailable || interestsQuery.isError`로 넓혔다. 화면은 그대로
`FullScreenError` + [다시 시도]를 그린다.

**게이트를 `isLoading`이 아니라 주제 쿼리의 `isPending`으로 잡았다.** `isLoading`에는
`selectedIds === null`이 섞여 있는데, 관심사 조회가 실패하면 `serverIds`가 계속 null이라
`isLoading`이 참으로 굳는다. 그걸 게이트로 쓰면 에러 화면이 영영 뜨지 않는다.

### 2. 카피 — 온보딩과 문자열까지 동일

`INTEREST_COPY.emptyTitle`·`emptyDescription`을 온보딩과 **같은 문자열**로 뒀다. 기존
`loadFailed`("주제 목록을 불러올 수 없어요")는 재사용하지 않는다 — 온보딩과 같은 이유로 200이라
사실과 다르다. 레이아웃 조정은 하지 않았다: 두 화면 모두 `FullScreenError`가 `flex: 1` 중앙 정렬
한 벌이라 앱바 유무가 본문 배치에 영향을 주지 않았다.

`ONBOARDING_COPY`를 import하지 않고 문자열을 각자 뒀다 — `architecture.md` 4.4의 방향이
`onboarding → interest` 한쪽뿐이라 반대로 참조하면 순환이다. 헤드라인·상한 문구가 이미 같은
방식으로 양쪽에 있다(`interest-management-uiux.md` 6장 — 변형 금지). 양쪽 주석에 "문자열까지
동일해야 한다"를 적었다.

### 3. `refetchAll` 죽은 버튼 수정

`isError`인 쿼리만 refetch하던 것을 `isTopicsUnavailable`(0건 포함) 기준으로 바꿨다. 0건은 성공
상태라 종전에는 [다시 시도]를 눌러도 아무 요청이 나가지 않았다.

### 판정 로직 위치 — `shared/`가 아니라 `features/interest/`로 옮겼다

온보딩에서 만든 `isTopicListUnavailable`을
`features/onboarding/services/` → **`features/interest/services/`** 로 옮기고 interest의 공개
API로 내보냈다. 온보딩은 `@/features/interest`에서 가져다 쓴다.

- **왜 공유하는가** — 같은 엔드포인트의 같은 상태를 두 화면이 각자 판정하면 한쪽만 고쳐지는
  순간 두 화면이 갈라진다. `useTopicsQuery`를 공용하기로 한 것과 같은 이유다.
- **왜 `features/interest/`인가** — 주제 목록의 소유자가 이 feature다(계약·캐시·`useTopicsQuery`·
  `TopicChip`). `architecture.md` 4.4의 방향이 `onboarding → interest` 한쪽뿐이라 판정을 온보딩에
  두면 IM이 역방향으로 import해 순환이 된다.
- **왜 `shared/`가 아닌가** — `shared/`는 api·hooks·lib·storage·theme·ui, 즉 도메인을 모르는 횡단
  인프라 층이다. 특정 목록의 도메인 판정을 거기 두면 주제 목록 지식이 두 층으로 흩어진다.

### 문서

`changes/pending/onboarding-empty-topic-list.md`에 4·5항을 덧붙였다 — `features/interest-management.md` 7에
**규칙 자체를 신설**(지금 이 규칙을 가진 문서가 없다)하고, `interest-management-uiux.md` 9장의
미결 항목을 삭제하며 4.7에 0건 변형·확정 카피를 넣는다. 온보딩 건과 같은 결정이라 파일을 나누지
않고 합쳤다.

### 완료 조건 최종 확인

| 완료 조건 | 결과 |
|---|---|
| 노출 주제 0건 서버 / 온보딩 1단계 진입 / 빈 화면이 아니라 재시도할 수 있는 상태 | **충족** — 실기기 확인 완료(위 "실기기 확인") |
| 운영이 주제를 노출시킨 뒤 [다시 시도] / 목록이 그려지고 진행할 수 있다 | **충족** — 실기기에서 앱 재시작 없이 목록이 떴다 |
| 관심사 관리 화면 / 같은 조건 진입 / 같은 규칙으로 그려진다 | **충족** — 같은 판정·같은 카피로 `FullScreenError` + [다시 시도]. 실기기 확인 대기 |

세 조건이 모두 충족되어 `archive/`로 옮긴다.

### 실기기 확인 — 관심사 관리 (2026-09-09)

온보딩과 같은 방식으로 프로덕션에서 주제를 전부 숨긴 짧은 창을 열어 확인하고 즉시 원복했다
(켜져 있던 30개 id만 되돌림 — 원래 숨김이던 6개는 건드리지 않았다).

| 조건 | 결과 |
|---|---|
| 0건 서버 / `설정 › 관심 주제` 진입 | ✅ "아직 준비 중이에요" + [다시 시도] |
| 그 화면에서 [다시 시도](주제 여전히 0건) | ✅ 같은 화면 유지 — 빈 화면·크래시 없음 |
| 주제 노출 후 [다시 시도] | ✅ **앱 재시작 없이** 칩 목록이 뜨고 저장까지 진행됨 |

**세 번째가 `refetchAll` 수정의 실증이다** — 종전에는 `isError`인 쿼리만 refetch해서 0건(200)
상태에서는 [다시 시도]가 아무 요청도 보내지 않는 죽은 버튼이었다.

**완료 조건 3개 전부 충족. Jira KAN-41 완료 전이(2026-09-09).**

### 남은 문서 반영

확정 카피는 uiux 소유이므로 `changes/pending/onboarding-empty-topic-list.md`에 반영 요청이
남아 있다 — `onboarding-uiux.md`(8장 금지 사항·4.2·2·3장 흐름도) · `onboarding-api.md` 4.2·9 ·
`interest-management-uiux.md` 9장(미결 해소) · `features/interest-management.md`(빈 목록 처리
규칙 신설). **통합 시 함께 반영한다.**

