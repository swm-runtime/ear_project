# [BE] common-error-handling.md — 온보딩 에러 코드 8개 추가

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/pages/common-error-handling.md` |
| 위치 | 6장 에러 코드 표 |
| 요청 파트 | 백엔드 |
| 관련 작업 | 온보딩 백엔드 구현 (`feat(be)/onboarding`) |
| 근거 문서 | `docs/spec/api/onboarding-api.md` 5장 · `docs/backend/architecture.md` 7.5 |

## 왜 필요한가

`architecture.md` 7.5는 **"코드를 추가·변경하면 `common-error-handling.md` 6장 표를 함께 갱신한다"** 고 정하고 있다. 온보딩 구현으로 `ErrorCode` enum에 8개가 추가됐는데 그 문서는 클라이언트 계약이라 백엔드가 고칠 수 없다.

갱신하지 않으면 **클라이언트가 분기해야 할 코드가 계약 문서에 없는 상태**가 된다. 프론트엔드는 `onboarding-api.md` 5장을 따로 봐야 하고, 두 문서의 코드 목록이 갈라지기 시작한다.

## 추가할 행

`onboarding-api.md` 5장의 표와 동일하다. 서버는 이 값으로 이미 응답하고 있다.

| error_code | HTTP | retryable | 클라이언트 동작 |
|---|---|---|---|
| `ONBOARDING_INTEREST_REQUIRED` | 400 | false | [다음] 비활성 유지 + "관심 주제를 1개 이상 선택해주세요" |
| `ONBOARDING_INTEREST_LIMIT_EXCEEDED` | 400 | false | 토스트 "관심 주제는 3개까지 선택할 수 있어요" + 선택 상태 재동기화 |
| `ONBOARDING_TOPIC_UNAVAILABLE` | 400 | false | 주제 목록 재조회 후 선택 초기화 |
| `ONBOARDING_INTERESTS_NOT_SET` | 409 | false | 1단계로 되돌림 |
| `ONBOARDING_NOT_COMPLETED` | 409 | false | 폴링 중단. 완료 요청부터 다시 |
| `ONBOARDING_ALREADY_COMPLETED` | 409 | false | 온보딩 스택 제거 후 라이브러리로 진입 |
| `CONTENT_NOT_FOUND` | — | false | **건별 결과**(`POST /onboarding/picks`의 `failed[]`). 해당 카드를 목록에서 제거 |
| `CONTENT_WITHDRAWN` | — | false | **건별 결과**(같은 위치). 토스트 "제공이 종료된 콘텐츠예요" |

## 함께 확인할 것

- **`CONTENT_NOT_FOUND` · `CONTENT_WITHDRAWN`은 공용 코드다.** `onboarding-api.md` 5장은 이 둘을 "온보딩이 새로 만든 코드가 아니다"라고 적고 있는데, 실제로 `common-error-handling.md` 6장에 이미 있는지 확인이 필요하다. 없으면 온보딩이 처음 도입하는 코드가 되므로 공용 위치에 넣어야 한다(라이브러리·탐색·플레이어가 같은 코드를 쓴다).
- **`ONBOARDING_*`은 전부 `retryable: false`다.** 전부 입력·상태 문제라 같은 요청을 다시 보내도 결과가 같다. 자동 재시도가 붙는 것은 5xx·타임아웃뿐이다.
- `CONTENT_NOT_FOUND` · `CONTENT_WITHDRAWN`의 HTTP 열이 `—`인 것은 오타가 아니다. 담기에서는 요청 전체가 실패한 것이 아니라 **200 응답 본문의 `failed[]` 항목**으로 전달된다.

## 서버 구현 상태

`backend/src/common/exceptions/error-code.enum.ts`에 반영 완료. 문서 갱신만 남았다.
