# [BE] common-error-handling.md — 온보딩 에러 코드 8개 추가

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/pages/common-error-handling.md` |
| 위치 | 6장 에러 코드 표 |
| 요청 파트 | 백엔드 |
| 관련 작업 | 온보딩 백엔드 구현 (`feat(be)/onboarding`) |
| 근거 문서 | `docs/spec/api/onboarding-api.md` 5장 · `docs/backend/architecture.md` 7.5 |
| 상태 | **보류** (2026-08-05, 온보딩 통합 시점) — 아래 "보류 사유" 참조 |

---

## 보류 사유 — 대상인 "6장 에러 코드 표"가 존재하지 않는다

> 2026-08-05 온보딩 통합 반영 중 확인한 내용이다. **이 문서를 그대로 실행할 수 없어 `pending/`에 둔다.**

`common-error-handling.md`의 6장은 **"데이터 모델"** 이고, 담고 있는 것은 `ApiError`의 **필드 규격**뿐이다. 에러 코드 목록 표는 이 문서 어디에도 없다.

```
## 6. 데이터 모델
ApiError { error_code, message, retryable, retry_after_sec }   // 서버 응답 규격
```

**이건 온보딩만의 문제가 아니다.** "6장 표"를 가리키는 곳이 이미 6군데인데, 그 표가 만들어진 적이 없다.

| 참조하는 곳 | 문장 |
|---|---|
| `backend/architecture.md` 7.5 | 코드를 추가·변경하면 `common-error-handling.md` 6장 표를 함께 갱신한다 |
| `backend/architecture.md` 7.4 | `common-error-handling.md` 6장의 `ApiError`를 그대로 따르며 (← 이쪽은 규격 참조라 정상) |
| `backend/convention.md` | 클라이언트가 분기해야 하는 상황은 `error_code`로 구분한다(`common-error-handling.md` 6장) |
| `spec/api/auth-api.md` 5장 · `library-api.md` 5장 · `onboarding-api.md` 5장 | 추가·변경 시 … `common-error-handling.md` 6장 표를 함께 갱신한다 |

즉 **auth·library도 같은 지시를 받았지만 반영된 적이 없다.** 온보딩 8개만 넣으면 표는 생기지만 "온보딩 코드만 있는 중앙 표"가 되어, 다음 사람이 또 같은 판단을 해야 한다.

### 결정이 필요한 것

1. **표를 신설할 위치** — 6장(데이터 모델) 안에 넣을지, 별도 절로 뺄지. 코드 목록은 스키마가 아니라 계약이라 별도 절이 자연스럽다.
2. **초기 범위** — 온보딩 8개만 넣을지, `auth-api`·`library-api` 5장의 코드까지 함께 옮겨 담아 실제로 "중앙 표"로 만들지.
3. **`CONTENT_NOT_FOUND` · `CONTENT_WITHDRAWN`의 소유** — `onboarding-api.md` 5장은 이 둘을 "온보딩이 새로 만든 코드가 아니다"라고 적었는데, 중앙 표가 없으니 **실제로는 온보딩이 처음 도입하는 코드**다. 라이브러리·탐색·플레이어가 같은 코드를 쓰므로 공용 위치에 두어야 한다.
4. **표와 각 api 문서 5장의 관계** — 중앙 표가 원본이고 api 문서가 발췌인지, 반대인지. 정하지 않으면 두 벌이 갈라진다(이 문서가 처음에 지적한 것과 같은 문제).

**서버 구현에는 영향이 없다.** `error-code.enum.ts`에는 이미 반영돼 있고 응답도 그 값으로 나간다 — 문서 쪽 정리만 남은 상태다.

---

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
