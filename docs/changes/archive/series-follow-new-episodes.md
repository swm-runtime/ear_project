# explore·domain·api — 시리즈째 담기와 새 편 자동 적립 (BE·FE)

| 항목 | 값 |
|---|---|
| 대상 문서 | `features/explore.md` 4.7(시리즈 담기 서술 — "새로 공개될 편은 따라 들어오지 않는다" 폐기) · `features/library.md` 4.5(시리즈째 빼기) · `backend/domain.md` 5.9("담기는 편 단위" 서술)·6장(`library_series` 신설)·보존 표·탈퇴 파기 목록 · `spec/api/explore-api.md` 4.7(`series.is_saved`)·신규 시리즈 담기·빼기·복구 절 · `spec/uiux/explore-uiux.md` 4.11 |
| 요청 파트 | 백엔드 · 프론트엔드 |
| 발행 날짜 | 2026-10-22 |
| 기한 | 다음 문서 통합 때 — API·스키마는 BE PR, 화면 문서는 FE PR과 같이 |
| 선행 | 없음 |
| 관련 | BE [KAN-245](https://runtime364.atlassian.net/browse/KAN-245) `tickets/backend/archive/series-follow-new-episodes.md` · FE [KAN-246](https://runtime364.atlassian.net/browse/KAN-246) `tickets/frontend/pending/series-follow-ui.md` |

## 배경

PM 결정(2026-10-22 14:57): 시리즈째 담은 사용자에게는 새 편이 따라 들어온다. 라이브러리는 편 단위 그대로다(시리즈 카드 묶음은 14:55 철회). 종전 문서는 "새로 공개될 편은 따라 들어오지 않는다(시리즈 구독 아님 — 보류)"였다(`explore.md` 4.7).

## 수정 내용

1. **`features/explore.md` 4.7** — 시리즈 담기 = 시리즈 단위 요청 한 번(서버가 시리즈째 담기를 기록). **시리즈째 담으면 이후 공개되는 편이 라이브러리에 자동으로 들어온다**(맨 위). 편을 따로 빼도 시리즈째 담기는 유지되고, 뺀 편은 돌아오지 않는다. 🗑 = 시리즈째 빼기(담긴 편 전부 + 따라오기 중단) + [실행 취소]. 담김 판정 = `is_saved`. 라이브러리는 편 단위 그대로.
2. **`features/library.md` 4.5** — 시리즈째 빼기도 편 삭제 규칙(신호·영구 제외·[실행 취소] 5초)을 편마다 그대로 따른다는 한 줄.
3. **`backend/domain.md`** — 6장 `library_series` 표 정의(BE 티켓 1번). 5.9 "담기는 편 단위 그대로"에 "+ 시리즈째 담기 기록 `library_series`(새 편 자동 적립의 근거)". 보존·탈퇴 파기 목록에 `library_series`.
4. **`spec/api/explore-api.md`** — 4.7 `series.is_saved`. 신규 절 `POST`·`DELETE /series/:series_id/save` · `POST /series/:series_id/restore`(요청·응답·에러·멱등) · 새 편 적립 규칙.
5. **`spec/uiux/explore-uiux.md` 4.11** — 담기 원 판정 = `is_saved`, 시리즈째 담기면 새 편이 따라온다는 한 줄.

## 완료 조건

- Given 위 문서들 / When BE·FE PR이 머지됐다 / Then "새로 공개될 편은 따라 들어오지 않는다" 문장이 없고, `library_series`·`is_saved`·시리즈 담기 API가 각 문서에 같은 이름으로 있다

## 처리 기록

- 2026-10-22 발행.
- 2026-10-22 BE PR(KAN-245)에서 **1~4 반영** — `features/explore.md` 4.7(시리즈째 담기·새 편 자동 적립·시리즈째 빼기 + [실행 취소], "두지 않는 것"에서 시리즈 구독·시리즈째 빼기 제거) · `features/library.md` 4.5(시리즈째 빼기도 편 삭제 규칙) · `backend/domain.md` 2장 소유표·5.9·**6.1-1 `library_series` 신설**·12.1 보존 표·12.3 탈퇴 즉시 파기 목록 · `spec/api/explore-api.md` 3장 표·4.7 `series.is_saved`·**4.8 담기 / 4.9 빼기 / 4.10 실행 취소 / 4.11 새 편 자동 적립**·5장·8장. 빼기의 `client_seq`는 편 해제(4.4)와 같이 쿼리, 담기·빼기는 둘 다 200, 실행 취소 응답은 `{ series_id, restored_item_ids, is_saved }`로 정했다.
- **남은 것 — 5번(`spec/uiux/explore-uiux.md` 4.11)은 FE 소유라 FE PR(KAN-246)과 같이 반영한다.** 그때까지 이 문서는 `pending/`에 둔다.
- 2026-10-22 **5번 반영 — 반영 날짜 2026-10-22.** FE PR(KAN-246)에서 `spec/uiux/explore-uiux.md` 4.11 담기 원 판정 근거를 `series.is_saved`로 고침. 1~5 전부 반영되어 `archive/`로 옮긴다.
