# [FE] 시리즈째 담기 — 시리즈 화면 [+]·🗑·실행 취소를 시리즈 API로, 담김 판정 = `series.is_saved`

| 항목 | 값 |
|---|---|
| 대상 | `features/explore` — `explore.api.ts`(시리즈 담기·빼기·복구 · 상세 DTO `is_saved`) · `hooks/useSeriesScreen.ts`(`saveSeries`·`removeSeries`·`isSeriesSaved`) · mock · 카피(필요 시) · `spec/uiux/explore-uiux.md` 4.11 |
| 요청 파트 | 프론트엔드 |
| 요청자 | 이주호(PM) — 2026-10-22 14:57 "새 편 따라 들어오게 하자" |
| 담당 | 프론트엔드 |
| Jira | [KAN-246](https://runtime364.atlassian.net/browse/KAN-246) |
| 발행 날짜 | 2026-10-22 |
| 시작 날짜 | 2026-10-22 |
| 기한 | 2026-10-25 (Medium — +3일. BE 배포가 늦으면 mock으로 먼저 만들고 사유를 적는다) |
| 선행 | BE `tickets/backend/pending/series-follow-new-episodes.md` ([KAN-245](https://runtime364.atlassian.net/browse/KAN-245)) — `POST`·`DELETE /series/:id/save` · `restore` · `is_saved` |
| 근거 문서 | `changes/pending/series-follow-new-episodes.md` · BE 티켓 "규칙" · `features/explore.md` 4.7 |
| 중요도 | Medium |
| 상태 | 코드 반영(2026-10-22) — 실기기 확인 남음 |

## 왜

새 편이 따라 들어오려면 서버가 "시리즈째 담았다"를 알아야 한다. 지금 [+]는 편 담기를 편 수만큼 보내서 서버엔 낱개 담기로만 남는다(#1835·#1839).

## 무엇을 한다

1. **API** — `fetchSaveSeries(seriesId, clientSeq)` · `fetchUnsaveSeries(seriesId, clientSeq)` → `removedItemIds` · `fetchRestoreSeries(seriesId, itemIds)`. 시리즈 상세 DTO·타입에 `isSaved`. mock 동일.
2. **[+]** — 편별 루프를 지우고 `POST /series/:id/save` 한 번. 낙관 반영(없던 편에 "담음" · `isSaved` true) → 실패면 되돌리고 토스트. 토스트 문구 그대로("N편을 라이브러리에 담았어요" + [보러가기], N = 낙관 대상 수).
3. **🗑** — `DELETE /series/:id/save` 한 번. 낙관 반영 → 토스트 "N편을 라이브러리에서 뺐어요" + [실행 취소] → `POST /series/:id/restore`(받은 `removedItemIds`). 응답 전 [실행 취소]면 응답을 기다렸다가 복구.
4. **판정** — `isSeriesSaved` = `series.isSaved`(종전 "노출 편 전부 담김" 파생 폐기). 시리즈째 담겼으면 편 하나가 빠져 있어도 🗑이다(빼기 = 시리즈째 빼기).
5. 성공·실패 후 시리즈 상세·라이브러리 쿼리 무효화.
6. **테스트** — [+]가 시리즈 API 1회 · 🗑 → [실행 취소]가 restore에 받은 id를 넘김 · `isSaved`로 버튼 분기 · 실패 되돌림.
7. **문서** — `explore-uiux.md` 4.11 담기 원 판정 근거를 `is_saved`로, "새 편이 따라 들어온다" 한 줄.

## 범위 밖

- 라이브러리 시리즈 카드(철회 — `tickets/frontend/archive/library-series-card.md`) · 새 편 푸시

## 완료 조건

- Given 담기 전 시리즈 / When [+] / Then 요청 1회(`POST /series/:id/save`), 편 줄에 "담음", 버튼 🗑
- Given 시리즈째 담김 / When 🗑 → 5초 안에 [실행 취소] / Then `restore`가 받은 id로 1회 불리고 다시 담김
- Given 시리즈째 담긴 뒤 편 하나를 ⋯에서 뺐다 / Then 버튼은 🗑 그대로
- Given 시리즈째 담긴 연재 시리즈에 새 편 발행(서버) / When 라이브러리 / Then 새 편이 맨 위에 보인다

## 처리 기록

- 2026-10-22 14:57 발행.
- 2026-10-22 16:2x 코드 반영(BE KAN-245 #1855 머지 확인 후 착수). [+] = `POST /series/:id/save` 1회, 🗑 = `DELETE` 1회 + [실행 취소] = 빼기 응답의 `removed_item_ids`로 `POST /series/:id/restore`, 판정 = `series.isSaved`. 이미 다 담긴 시리즈의 [+]는 토스트 "새 편이 나오면 라이브러리에 담아 드릴게요". 실패는 시리즈 단위로 되돌림(서버가 한 트랜잭션) — "일부 편" 문구 2종 삭제. **실기기 확인 뒤 archive·Jira 완료.**
