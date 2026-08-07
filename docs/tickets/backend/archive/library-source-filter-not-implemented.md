# [BE] 목록 조회에 `source_filter`가 없고 `filter=drip`이 남아 있다

| 항목 | 값 |
|---|---|
| 대상 | `backend/src/modules/library-screen/dto/library-item-query-request.dto.ts` · `backend/src/modules/library/library.enum.ts` · `library-item.repository.ts` · `library-screen.cursor.ts` |
| 요청 파트 | 백엔드 |
| 발견 시점 | 2026-08-07 라이브러리 통합 (`integration/library`) — 카드·필터 개편 문서 반영 중 |
| 근거 문서 | `spec/api/library-api.md` 4.1 · `features/library.md` 4.1-1 · `spec/uiux/library-uiux.md` 4.2 · 4.5 |
| 심각도 | **상** — 실서버로 전환하는 순간 라이브러리 목록 조회가 400으로 실패한다 |
| 상태 | **완료** (2026-08-07) — `fix(be)/library-source-filter` · PR #14 |

> **2026-08-07 반영 결과** — "고쳐야 할 것" 4개 항목을 모두 반영했다.
>
> - `library.enum.ts` — `LibraryItemFilter`에서 `DRIP` 제거, `LibraryItemSourceFilter`(`drip`/`save`) 신설
> - `library-item.repository.ts` — `applyFilter`의 `DRIP` 분기 제거, `applySourceFilter` + `SOURCES_BY_SOURCE_FILTER` 매핑 추가(`save` → `save`·`onboarding`)
> - `library-item-query-request.dto.ts` · `library-screen.controller.ts` · 타입 3곳 — `source_filter` 전달. **미선택은 enum 값이 아니라 `null`** 로 뒀다. 계약이 "미전송 = 출처를 가리지 않음"이라, 전체를 뜻하는 값을 만들면 같은 상태가 두 가지로 표현된다
> - `library-screen.cursor.ts` — 지문에 `sourceFilter` 포함. **미선택을 빈 문자열이 아니라 `-`로 인코딩**했다 — 빈 문자열은 구분자와 합쳐져 서로 다른 조건이 같은 지문을 갖게 만든다
> - 테스트 — 단위 139 → 144, E2E 20 → 21
>
> **완료 조건 5개 중 4개는 자동 테스트로, 나머지 하나(FE 실서버 전환)는 에뮬레이터로 확인했다.** 신규 가입 → 온보딩 → 라이브러리를 완주해 `drip 2 + onboarding 3`이 DB에 남는 것을 확인했고, [내가 담은 콘텐츠] 필터가 온보딩 3건을 제목까지 일치하게 내려줬다. `filter=drip` → 400 `VALIDATION_FAILED`, 커서 발급 후 출처를 바꾸거나 해제하면 400 `LIBRARY_CURSOR_INVALID`인 것도 API로 직접 확인했다.
>
> **남긴 것 2건** — 인덱스에 `source` 축을 더하는 일은 `library-api.md` 9장 미결에 기록만 하고 손대지 않았다(마이그레이션이 걸리고, 나머지 세 건과 함께 `domain.md`에서 보는 편이 낫다). FE의 `library.dto.ts` TODO 주석 제거는 `backend/` 밖이라 FE 담당 몫이다.

## 증상

프론트엔드는 목록 조회에 **`source_filter`를 이미 보내고 있다**(`frontend/src/features/library/api/library.api.ts`). 서버 DTO에 그 필드가 없고 전역 `ValidationPipe`가 `forbidNonWhitelisted: true`라, **`VALIDATION_FAILED`(400)로 거절된다.**

지금 드러나지 않는 이유는 FE가 mock으로 동작하기 때문이다(`IS_LIBRARY_API_MOCKED`). `EXPO_PUBLIC_LIBRARY_API=real`로 전환하는 순간 출처 필터를 건 조회가 전부 실패한다.

반대 방향으로도 어긋나 있다. 서버는 아직 **`filter=drip`을 지원**하는데, 개편으로 상단 탭에서 [이어 PICK]이 사라져 **클라이언트가 그 값을 보내지 않는다.** 계약에서도 제거됐다.

## 재현 절차

1. `backend`를 띄우고 온보딩까지 마친 계정을 준비한다.
2. `GET /users/me/library-items?filter=unplayed&source_filter=drip` 호출.
3. → **400 `VALIDATION_FAILED`.** 기대값은 200 + 드립으로 적립된 미청취 항목 목록.

## 원인

카드·필터 개편(2026-08-07)이 **상태와 출처를 서로 다른 컨트롤로 분리**했다. 개편 전에는 상단 탭 하나가 두 축을 배타적으로 다뤘고(`filter=drip`), 개편 후에는 탭이 상태만·필터 시트가 출처를 맡는다. **두 축이 AND로 조합되어야 하므로 파라미터도 둘이어야 한다.**

백엔드 구현(`feat(be)/library`, PR #13)은 개편 이전 계약을 기준으로 작성됐다. 계약 문서는 이번 통합에서 갱신했고, **코드만 남았다.**

## 고쳐야 할 것

### 1. `filter` enum에서 `drip` 제거 — `library.enum.ts`

```
LibraryItemFilter = ALL | UNPLAYED | COMPLETED     // DRIP 삭제
```

`DRIP` 분기를 지우면 `library-item.repository.ts`의 `source = 'drip'` 조건도 함께 빠진다.

- **하위 호환을 두지 않는다.** 배포된 클라이언트가 없다. 남겨두면 같은 조회를 `filter=drip`과 `source_filter=drip` 두 가지로 표현할 수 있게 되고, 커서 발급 조건에 두 축이 모두 들어가 검증이 복잡해진다(`library-api.md` 4.1).

### 2. `source_filter` 파라미터 추가 — `library-item-query-request.dto.ts`

| 값 | 조건 |
|---|---|
| *(미선택)* | 출처를 가리지 않는다 |
| `drip` | `source = 'drip'` |
| `save` | **`source IN ('save', 'onboarding')`** |

- **`save`가 `onboarding`을 포함한다.** 온보딩의 [담기]도 사용자가 직접 고른 것이다. `source = 'onboarding'`을 따로 기록하는 것은 유입 경로 분석용이지 제3의 출처를 보여주기 위해서가 아니다(`library-api.md` 4.1 · 9장의 온보딩 취급 미결이 이 방향으로 닫혔다).
- `filter` · `source_filter` · `topic_filter`는 **전부 AND**, 선택한 주제끼리만 OR다.

### 3. 커서 발급 조건에 `source_filter` 포함 — `library-screen.cursor.ts`

발급 시점과 다른 `source_filter`로 오면 `LIBRARY_CURSOR_INVALID`(400)로 거절한다. 지금은 `filter` · `sort` · `topic_filter` 셋만 커서에 묶여 있어, **출처만 바꾸면 조건이 섞인 목록이 만들어진다.**

### 4. 테스트

- 단위: 커서 인코딩·디코딩에 `source_filter` 추가, 조건이 바뀐 커서 거절
- E2E `library.e2e-spec.ts`: `filter=drip` 케이스를 `source_filter=drip`으로 바꾸고, **`source_filter=save`에 온보딩 적립분이 포함되는지** 확인하는 케이스를 추가한다(현재 어떤 테스트도 이 규칙을 덮지 않는다)

## 함께 확인할 것

- **인덱스** — `idx_library_items_user_id_deleted_at_added_at`에 `source` 축이 없어 `source_filter`가 걸리면 필터링 후 정렬이 된다. `library-api.md` 9장의 인덱스 미결에 **이 축을 추가해 기록해 두었다.** 이 티켓에서 인덱스까지 고칠지는 판단이 필요하다 — 나머지 세 건(주제 필터·회수 제외·복원 조회)과 함께 `domain.md`에서 한 번에 보는 편이 나을 수 있다.
- **FE 쪽 조치는 없다.** `library.dto.ts`의 `source_filter` TODO 주석(`백엔드 협의 필요`)만 지우면 된다. 이 티켓이 닫힐 때 함께 정리한다.

## 완료 조건

- Given 서버가 기동한다 / When `GET /users/me/library-items?filter=unplayed&source_filter=drip`을 호출한다 / Then 200과 함께 **드립으로 적립된 미청취 항목만** 커서 페이지네이션으로 내려온다
- Given 온보딩에서 담은 항목과 탐색에서 담은 항목이 모두 있다 / When `source_filter=save`로 조회한다 / Then **두 종류가 함께** 내려오고, 드립 항목은 빠진다
- Given `filter=drip`으로 호출한다 / When 응답을 본다 / Then **400 `VALIDATION_FAILED`** 다 — enum에 없는 값이다
- Given `source_filter=drip`으로 첫 페이지를 받았다 / When 그 `next_cursor`를 `source_filter=save`와 함께 보낸다 / Then `LIBRARY_CURSOR_INVALID`(400)로 거절된다
- Given FE를 `EXPO_PUBLIC_LIBRARY_API=real`로 전환한다 / When 필터 시트에서 출처를 고르고 [적용]한다 / Then 400 없이 목록이 갱신된다
