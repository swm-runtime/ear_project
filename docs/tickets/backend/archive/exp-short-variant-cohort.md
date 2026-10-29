# [BE] 단기 실험 ④ 짧은 판 코호트 — 콘텐츠·시리즈 변형 필드 · 가입 시점 코호트 노출 분리

| 항목 | 값 |
|---|---|
| 대상 | `POST /admin/contents`·`POST /admin/series` DTO·`contents`·`series` 스키마 · 드립(첫 드립·일일 편성·시리즈 연속)·탐색·검색·추천·시리즈 목록 노출 |
| 요청 파트 | 백엔드 |
| 요청자 | 박수헌(AI) |
| 담당 | 백엔드(박준현) |
| Jira | [KAN-298](https://runtime364.atlassian.net/browse/KAN-298) |
| 발행 날짜 | 2026-10-29 |
| 시작 날짜 | 2026-10-29 |
| 기한 | 2026-11-01 (Medium — 3일) |
| 선행 | 없음 — 파이프라인 쪽(길이 프로필·재제작·실험 탭, PR #2142)은 배포 완료. **후행**: 파이프라인의 짧은 판 발행은 이 티켓의 업로드 필드가 생긴 뒤에만 한다 |
| 근거 문서 | `tickets/ai/pending/exp-script-length-hook.md`(KAN-296 처리 기록 2026-10-29) · `spec/api/admin-api.md` 4.6 · `spec/api/experiments-api.md` · `features/drip-scheduling.md` · `backend/domain.md` 5.1 |
| 중요도 | Medium |
| 상태 | 반영 |
| 반영 날짜 | 2026-10-29 |

> 단기 실험 8종(2026-10-29) 중 ④ 콘텐츠 길이 단축의 **BE 몫**이다. KAN-296 본문은 "순차 비교"였으나 2026-10-29 박수헌·백엔드 합의로 **코호트 분리**로 바뀌었다: 테스트 기능들을 넣은 새 앱이 심사를 통과해 배포되는 시점부터 가입하는 사용자에게는 **짧은 판만** 노출한다. 짧은 판은 기존 발행 편(단편·시리즈 모두)의 주제를 재활용한 5~12분 재제작이고(파이프라인이 만든다), 도입부 변경도 짧은 판에만 적용된다. 짧은 판 재고는 앱 배포 전에 파이프라인이 최대한 채운다 — 재고가 없어 폴백하는 경우를 두지 않는다.

## 왜

같은 주제를 짧게 만들었을 때 완청률·초반 이탈이 어떻게 달라지는지 본다. 기존 사용자는 기존 편(13분 이상)을 그대로 듣고, 새 코호트는 짧은 판만 듣는다. 파이프라인은 짧은 판을 만들어 업로드할 때 **길이 프로필과 원본 콘텐츠 id**를 함께 보내지만, 서버에 받을 필드도, 코호트를 가르는 판정도, 노출을 나누는 로직도 아직 없다(`experiments-api.md`에는 첫 드립 "짧은 편 먼저" 규칙만 있다).

## 무엇을 한다

1. **콘텐츠·시리즈 변형 필드** — `POST /admin/contents`(및 재발행) payload에 `length_profile`(`"standard"` | `"short"`, 생략 시 standard)과 `variant_of_content_id`(원본 콘텐츠 id, short 단편일 때 필수)를 받고 `contents`에 두 컬럼을 둔다. 시리즈도 같다 — `POST /admin/series` payload에 `length_profile`·`variant_of_series_id`(원본 시리즈 id), `series`에 두 컬럼. 짧은 시리즈의 편은 `length_profile: "short"` 이고 `variant_of_content_id` 는 원본 시리즈의 같은 화(없으면 생략 가능). 원본이 없거나 원본이 이미 변형이면 400 `VALIDATION_FAILED`. 파이프라인 `upload-meta.json`이 싣는 값은 `length_profile` · `remake_of_content_ref`(원본 content_id)다(시리즈 쪽 값은 파이프라인 후속 작업에서 맞춘다 — `domain.md` 수정은 `changes/pending`).
2. **코호트 판정은 서버 한 곳** — 사용자 가입 시각이 설정값 `SHORT_CONTENT_COHORT_SINCE`(새 앱 배포 시각, ISO) 이후면 `short` 코호트, 아니면 `standard`. 설정이 비어 있으면 전원 `standard`(롤백 스위치). 앱은 코호트를 모른다(판정은 서버, 클라이언트는 표시만).
3. **노출 분리** — `short` 코호트에는 `length_profile = short` 인 단편·시리즈만, `standard` 코호트에는 `standard` 만. 적용 지점: 첫 드립·일일 드립 편성·시리즈 연속 편·리텐션 "듣던 콘텐츠"·탐색 피드·검색·추천·시리즈 목록. 라이브러리에 이미 담긴 것과 공유 링크로 직접 여는 콘텐츠 상세는 막지 않는다(재생 거절 없음 — 이 실험은 노출 실험이다). 짧은 판이 없는 주제의 폴백은 두지 않는다 — 재고는 배포 전에 채운다.
4. **문서** — `spec/api/admin-api.md` 4.6·시리즈 만들기 필드 · `experiments-api.md`에 4.3 절 · `features/drip-scheduling.md` 노출 규칙 · `domain.md` 컬럼. 전부 `changes/pending`에 기록.

## 범위 밖

- 파이프라인 쪽(길이 프로필·재제작·실험 탭·업로드 메타) — 완료(#2142).
- FE 변경 — 없음(앱은 서버가 준 목록만 그린다).
- 사용자 id 해시 A/B(동시 분할) — 이 실험은 가입 시점 코호트다.
- 지표 측정(원본 ↔ 짧은 판 완청률 비교) — 티켓 범위 밖, 팀이 실험 지표 탭·기존 조회로 직접 확인한다(2026-10-29 박수헌).

## 미결

- `SHORT_CONTENT_COHORT_SINCE` 값은 새 앱의 스토어 배포 시각으로 운영이 넣는다.

## 완료 조건

- Given 파이프라인 업로드 payload에 `length_profile: "short"` · `variant_of_content_id` / When `POST /admin/contents` / Then 저장되고, 원본이 없으면 400 `VALIDATION_FAILED`(`details.field = "variant_of_content_id"`)
- Given 파이프라인 시리즈 발행 payload에 `length_profile: "short"` · `variant_of_series_id` / When `POST /admin/series` / Then 저장된다
- Given `SHORT_CONTENT_COHORT_SINCE` 이후 가입한 사용자 / When 첫 드립·일일 드립·시리즈 연속 편·탐색·검색·추천·시리즈 목록 / Then `short` 단편·시리즈만 나온다 · 그 이전 가입자는 `standard` 만
- Given 설정값이 비어 있음 / Then 전원 `standard`(짧은 판은 아무에게도 편성되지 않는다)

## 처리 기록

- 2026-10-29 발행(마크다운). 시리즈도 짧은 판으로 다시 만들어 같은 규칙으로 분리한다 · 지표 측정은 범위 밖 · 재고 폴백 없음(배포 전 재고를 채운다) — 박수헌.
- 2026-10-29 반영(백엔드) — 2개 PR로 나눴다.
  - **#2147 스키마 + 업로드 필드**(dev 머지): 마이그레이션 `1792100000000-AddContentLengthProfile`(`contents.length_profile`·`variant_of_content_id`, `series.length_profile`·`variant_of_series_id`, CHECK·같은 표 FK). `POST /admin/contents`·`POST /admin/series` 필드와 400 판정(원본 없음·원본이 short·standard에 원본 → `variant_of_*`, 시리즈 편 프로필 불일치 → `length_profile`). **재발행은 두 필드를 받지 않는다** — 본문 "(및 재발행)"을 "재발행이 값을 유지한다"로 풀었다(`series_*`와 같은 발행 단위의 정체성).
  - **후속 PR 코호트 + 노출 분리**: 판정 `ContentCohortService`/`content-cohort.policy.ts` 한 곳, env `SHORT_CONTENT_COHORT_SINCE`(비면 전원 standard). 요청 경로는 access token 가입 시각 클레임 `signed_up_at`(코호트가 아니라 가입 시각 — 롤백이 토큰 수명을 기다리지 않는다). 노출면은 저장소 `applyVisibility`의 필수 인자로 거른다 — 첫 드립·정규·탐험(시리즈 연속 편 포함)·리텐션 "듣던 콘텐츠"·탐색 피드/목록/인기/새로 나온·검색(키워드·의미·교정어·대체)·관련 콘텐츠 후보·온보딩 추천·시리즈 카드·같은 간행물의 다른 시리즈. 라이브러리·상세·시리즈 화면·재생은 막지 않는다. 계약은 `spec/api/experiments-api.md` 4.3, 문서 반영은 `changes/pending/exp-short-variant-cohort.md`.
  - 파이프라인 정렬: 업로드 payload에 `length_profile` · **`variant_of_content_id`**(= `upload-meta.json`의 `remake_of_content_ref`)를 실어야 한다. 시리즈는 `POST /admin/series`에 `length_profile`·`variant_of_series_id`.
  - 남은 것: `SHORT_CONTENT_COHORT_SINCE` 값(운영 — KAN-300 체크리스트), 주제 칩은 코호트로 거르지 않는다(짧은 판 없는 주제는 목록이 빈다 — 재고 전제).
