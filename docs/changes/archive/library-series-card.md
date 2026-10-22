# library·explore·domain·api — 라이브러리 시리즈 묶음(시리즈 카드)·시리즈 단위 담기 (BE·FE)

| 항목 | 값 |
|---|---|
| 대상 문서 | `features/library.md` 4.1·4.5·6장 · `features/explore.md` 4.7(시리즈 담기·빼기) · `backend/domain.md` 5.9(담기는 편 단위 서술)·6장(`library_series` 신설)·보존 표 · `spec/api/library-api.md` 4.1(`group=series`, "라이브러리는 시리즈로 묶지 않는다" 폐기) · `spec/api/explore-api.md` 4.7(`is_saved`)·신규 시리즈 담기·빼기·복구 절 · `spec/uiux/library-uiux.md`(묶음 타일·⋯·스낵바) · `spec/uiux/explore-uiux.md` 4.11 |
| 요청 파트 | 백엔드 · 프론트엔드 |
| 발행 날짜 | 2026-10-22 |
| 기한 | 다음 문서 통합 때 — 각 파트 PR과 같이 반영(API·스키마는 BE PR, 화면 문서는 FE PR) |
| 선행 | 없음. 결정 D1~D6 PM 확인 — 상태: 미확인(제안값) |
| 관련 | BE [KAN-243](https://runtime364.atlassian.net/browse/KAN-243) `tickets/backend/pending/library-series-save.md` · FE [KAN-244](https://runtime364.atlassian.net/browse/KAN-244) `tickets/frontend/pending/library-series-card.md` |

## 배경

PM 결정(2026-10-22 14:46): 라이브러리에 시리즈가 카드 하나로 묶여 들어간다. 종전 문서는 "라이브러리는 편 단위 그대로, 시리즈 한 덩어리로 들어가지 않는다 · 새 편은 따라 들어오지 않는다(시리즈 구독 보류)"였다(`explore.md` 4.7 · `library-api.md` 4.1 · `domain.md` 5.9).

## 수정 내용

1. **`features/library.md` 4.1** — 3-2 신설: "시리즈 편은 시리즈 카드 하나로 묶는다(D1). 카드 위치 = 담긴 편 중 가장 최근 `added_at`(D4). 카드 탭 = 시리즈 화면. 필터는 묶음 안 편 하나라도 맞으면 카드를 보인다(D5)." 재생 목록 패널 순서(4번)는 편 단위 그대로라고 덧붙인다.
2. **`features/library.md` 4.5** — 시리즈 카드 삭제 = 담긴 편 전부 + 시리즈 담기 기록 소프트 삭제, 확인 없음 + [실행 취소] 5초, 편마다 종전 신호·영구 제외(D3).
3. **`backend/domain.md`** — 6장에 `library_series` 표 정의(BE 티켓 1번). 5.9의 "담기·재생 위치·완청·통계·페이월 차감은 편 단위 그대로" 중 담기는 "편 단위 행 + 시리즈 담기 기록(`library_series`)"으로. 보존 정책 표·탈퇴 즉시 파기 목록에 `library_series`.
4. **`spec/api/library-api.md` 4.1** — 쿼리 `group=series`, `kind` 유니온, 시리즈 항목 필드(BE 티켓 6번), D6 호환. `content.series` 행의 "라이브러리는 시리즈로 묶지 않는다 — 편 단위 그대로다" 문장을 `group=series` 기준으로 고친다.
5. **`spec/api/explore-api.md`** — 4.7 응답 `series.is_saved`. 신규 절: `POST`·`DELETE /series/:series_id/save` · `POST /series/:series_id/restore`(요청·응답·에러·멱등). 새 편 자동 적립 규칙(D2).
6. **`features/explore.md` 4.7** — 시리즈 담기 = 시리즈 단위 한 번, 시리즈째 담기면 새 편이 따라 들어온다(D2). 담김 판정 = `is_saved`. 🗑 = 시리즈째 빼기 + [실행 취소].
7. **`spec/uiux/library-uiux.md`** — 묶음 타일(겹친 판 · `시리즈 · N편`/`M/N편` · 진행률 = 완청/담긴), 낭독, ⋯ 시트([시리즈 보기] · [라이브러리에서 삭제]), 스낵바 "시리즈를 삭제했어요" + [실행 취소].
8. **`spec/uiux/explore-uiux.md` 4.11** — 담기 원의 판정 근거를 `is_saved`로.

## 완료 조건

- Given 위 문서들 / When BE·FE PR이 머지됐다 / Then "라이브러리는 시리즈로 묶지 않는다"·"새로 공개될 편은 따라 들어오지 않는다" 문장이 남아 있지 않고, `library_series`·`group=series`·`is_saved`·시리즈 담기 API가 각 문서에 같은 이름으로 있다

## 처리 기록

- 2026-10-22 발행.
- 2026-10-22 14:55 **철회 — 반영 날짜 2026-10-22(작업 없음).** PM "묶는 게 아니라 전체로 들어가는 게 맞겠다" — 라이브러리 시리즈 카드(묶음)·시리즈 단위 API·새 편 자동 적립은 하지 않는다. 시리즈 화면 [+]는 현행대로 노출 편 전체를 편 단위로 담고, 다 담겼으면 🗑 전부 빼기 + [실행 취소](#1835·#1839). 문서도 현행(`explore.md` 4.7 · `explore-uiux.md` 4.11)이 맞아 고칠 것이 없다. Jira KAN-243·KAN-244 코멘트 후 완료 전이(취소 상태 없음).
