# [BE] common-error-handling.md — 라이브러리 에러 코드 5개 추가

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/features/common-error-handling.md` |
| 위치 | 6장 에러 코드 표 |
| 요청 파트 | 백엔드 |
| 관련 작업 | 라이브러리 백엔드 구현 (`feat(be)/library`) |
| 근거 문서 | `docs/spec/api/library-api.md` 5장 · `docs/backend/architecture.md` 7.5 |
| 선행 문서 | **`common-error-handling-onboarding-codes(be).md`** — 같은 표를 대상으로 하며 보류 중이다 |

---

## 먼저 — 이 문서는 단독으로 실행할 수 없다

**대상인 "6장 에러 코드 표"가 아직 존재하지 않는다.** 이미 온보딩 요청(`common-error-handling-onboarding-codes(be).md`)이 같은 사실을 확인하고 보류 상태로 남아 있다. `common-error-handling.md` 6장은 **"데이터 모델"** 이고 담고 있는 것은 `ApiError`의 **필드 규격**뿐이다.

따라서 **표를 신설하는 결정이 먼저다.** 이 문서는 그 표가 만들어질 때 **라이브러리 코드가 빠지지 않도록** 하는 목록이며, 온보딩 문서와 함께 반영한다.

> 온보딩 문서가 남긴 결정 항목(표를 신설할 위치 / 초기 범위 / `CONTENT_*`의 소유 / 중앙 표와 api 문서 5장의 관계)은 그대로 유효하다. 여기서 다시 묻지 않는다.
>
> **다만 "초기 범위"의 답은 이 문서로 인해 달라진다.** 온보딩 8개만 넣으면 라이브러리 5개가 같은 방식으로 다시 밀린다 — 온보딩 문서가 지적한 "auth·library도 같은 지시를 받았지만 반영된 적 없다"가 한 번 더 반복되는 것이다. **초기 범위를 auth · onboarding · library 전체로 잡는 것을 권한다.**

---

## 왜 필요한가

`architecture.md` 7.5는 **"코드를 추가·변경하면 `common-error-handling.md` 6장 표를 함께 갱신한다"** 고 정하고 있고, `library-api.md` 5장도 같은 문장을 반복한다. 라이브러리 구현으로 `ErrorCode` enum에 5개가 추가됐는데 그 문서는 클라이언트 계약이라 백엔드가 고칠 수 없다.

갱신하지 않으면 **클라이언트가 분기해야 할 코드가 계약 문서에 없는 상태**가 된다. 프론트엔드는 `library-api.md` 5장을 따로 봐야 하고, 두 문서의 코드 목록이 갈라지기 시작한다.

## 추가할 행

`library-api.md` 5장의 표와 동일하다. 서버는 이 값으로 이미 응답하고 있다.

| error_code | HTTP | retryable | 클라이언트 동작 |
|---|---|---|---|
| `LIBRARY_CURSOR_INVALID` | 400 | false | 커서를 버리고 첫 페이지부터 재조회. **사용자에게 노출하지 않는다** |
| `LIBRARY_ITEM_NOT_FOUND` | 404 | false | 목록에서 해당 항목 제거 |
| `LIBRARY_COMPLETION_NOT_REACHED` | 409 | false | **조용히 무시.** 상태를 바꾸지 않는다 |
| `PLAY_LIMIT_EXCEEDED` | 403 | false | **페이월 바텀시트**(`paywall.md` 4.5) |
| `PLAY_LIMIT_REACHED` | 403 | false | "오늘 청취 한도를 모두 사용했어요" 안내. **페이월 아님** |

## 함께 확인할 것

- **`CONTENT_NOT_FOUND` · `CONTENT_WITHDRAWN`을 여기에 다시 넣지 않는다.** 라이브러리도 두 코드를 쓰지만(재생 시작·복구), 온보딩 문서가 이미 같은 두 행을 요청하고 있다. 공용 코드이므로 **한 번만 등재**한다 — 온보딩 문서가 남긴 "`CONTENT_*`의 소유" 결정 항목이 이 둘을 가리킨다.
- **`PLAY_LIMIT_EXCEEDED` / `PLAY_LIMIT_REACHED`는 합치지 않는다.** 무료는 페이월(결제 유도), 최상위 티어는 안내다. 클라이언트 동작이 달라 코드를 나눈 것이며(`architecture.md` 7.5), 403 하나로 두 화면을 구분하게 만들지 않는다(`convention.md` 5.4).
  - 두 이름이 지나치게 비슷해 구현에서 뒤바뀔 여지가 있다는 것은 `library-api.md` 9장이 이미 미결로 남겨 두었다. 유료 티어 한도 값이 정해질 때 함께 본다.
- **409에 해당하는 행이 `common-error-handling.md` 4.1 분류 표에 없다.** 그 표는 400 · 401 · 403 · 404 · 429 · 5xx만 다룬다. `LIBRARY_COMPLETION_NOT_REACHED`의 "조용히 무시"는 4.3의 **"사용자가 시작하지 않은 실패는 알리지 않는다"** 에서 도출되지만, 4.1에 409 행을 하나 추가해 두면 다음에 409를 쓰는 화면이 같은 판단을 반복하지 않는다.
- **전부 `retryable: false`다.** 형식·상태·권한 문제라 같은 요청을 다시 보내도 결과가 같다. 자동 재시도가 붙는 것은 5xx·타임아웃뿐이다(4.2).

## 서버 구현 상태

`backend/src/common/exceptions/error-code.enum.ts`에 반영 완료. 문서 갱신만 남았다.

- 라이브러리 목록·재생·완청·삭제·복구 엔드포인트가 전부 이 값으로 응답하는 것을 E2E(`backend/test/library.e2e-spec.ts`)로 확인했다.
- **표가 신설되어도 서버 코드는 바뀌지 않는다.** 문서 쪽 정리만 남은 상태다.

## 완료 조건

- Given `common-error-handling.md` 6장에 중앙 에러 코드 표가 만들어져 있다 / When 표를 본다 / Then 위 5개 행이 `library-api.md` 5장과 같은 `HTTP` · `retryable` · 클라이언트 동작으로 등재되어 있다
- Given 중앙 표가 만들어져 있다 / When `CONTENT_NOT_FOUND` · `CONTENT_WITHDRAWN`을 찾는다 / Then **각각 한 행만** 존재하고 특정 화면에 종속되지 않은 공용 코드로 적혀 있다
- Given 프론트엔드가 라이브러리 화면을 구현한다 / When `common-error-handling.md`만 보고 분기를 작성한다 / Then `library-api.md`를 따로 열지 않아도 5개 코드의 화면 동작을 알 수 있다
