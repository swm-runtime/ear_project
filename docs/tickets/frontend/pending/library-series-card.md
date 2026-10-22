# [FE] 라이브러리 시리즈 카드 — 격자에 시리즈 묶음 타일, 시리즈 화면 담기·빼기를 시리즈 API로

| 항목 | 값 |
|---|---|
| 대상 | `features/library`(목록 API `group=series` · 묶음 타일 · 묶음 더보기·삭제·실행 취소 · 필터) · `features/explore`(시리즈 화면 [+]·🗑을 `POST`·`DELETE /series/:id/save`로, `isSeriesSaved` = `series.is_saved`) · 카피 · `spec/uiux/library-uiux.md` · `explore-uiux.md` 4.11 |
| 요청 파트 | 프론트엔드 |
| 요청자 | 이주호(PM) — 2026-10-22 14:46 |
| 담당 | 프론트엔드 |
| Jira | [KAN-244](https://runtime364.atlassian.net/browse/KAN-244) |
| 발행 날짜 | 2026-10-22 |
| 시작 날짜 | 2026-10-22 |
| 기한 | 2026-10-25 (Medium — +3일. BE가 늦으면 mock으로 화면을 먼저 만들고, 기한을 넘기면 사유를 처리 기록에 적는다) |
| 선행 | BE `tickets/backend/pending/library-series-save.md` ([KAN-243](https://runtime364.atlassian.net/browse/KAN-243)) — 시리즈 담기·빼기·복구 API, 목록 `group=series`, `series.is_saved`. 배포 전에는 mock으로 화면을 만든다 |
| 근거 문서 | `changes/pending/library-series-card.md` · BE 티켓의 결정 D1~D6 · `features/library.md` 4.1·4.5 · `features/explore.md` 4.7 |
| 중요도 | Medium |
| 상태 | 발행 |

## 왜

시리즈 화면의 [+]는 지금 편 담기를 편 수만큼 보낸다(#1835 · 다 담겼으면 🗑 전부 빼기 #1839). 라이브러리 격자에 같은 시리즈 타일이 편 수만큼 깔리고, 새 편은 따라오지 않는다. PM 결정(2026-10-22): 라이브러리에 시리즈가 **카드 하나로** 묶여 들어간다.

## 무엇을 한다

1. **API·타입** — 목록 요청에 `group=series`(라이브러리 화면만. 재생 목록 패널 `sort=queue`는 그대로 편 단위). 항목 유니온 `kind: 'content' | 'series'` DTO·매퍼·mock. `fetchSaveSeries`·`fetchUnsaveSeries`·`fetchRestoreSeries`. 시리즈 상세 DTO에 `is_saved`.
2. **묶음 타일** (격자 한 칸, 낱개 타일과 같은 크기) — 시리즈 표지 · 제목 2줄 · `시리즈 · N편`(담긴 편 수, 계획 편수보다 적으면 `M/N편`) · 진행률 바 = 완청 편 수 / 담긴 편 수. 표지 뒤로 겹친 판 한 장(앨범 묶음 표시 — 낱개와 구분). 낭독 "시리즈, {제목}, {N}편 담김, {M}편 완청".
3. **묶음 탭** → 시리즈 화면(E14). 재생 확인 팝업을 바로 띄우지 않는다 — 어느 편을 들을지는 시리즈 화면에서 고른다.
4. **묶음 더보기 ⋯** — [시리즈 보기] · [라이브러리에서 삭제]. 삭제 = `DELETE /series/:id/save`, 확인 없이 즉시 + 스낵바 "시리즈를 삭제했어요" + [실행 취소] 5초 → `POST /series/:id/restore`(받은 `removed_item_ids`). 스와이프 삭제는 낱개 타일과 같은 규칙이면 같이.
5. **시리즈 화면** — [+] = `POST /series/:id/save` 한 번(편별 루프 제거), 🗑 = `DELETE` + [실행 취소] = `restore`. `isSeriesSaved` = `series.is_saved`(종전 "노출 편 전부 담김" 파생 폐기 — 편 하나 빼도 시리즈째 담김은 유지). 성공 후 시리즈 상세·라이브러리 쿼리 무효화.
6. **필터** — 서버가 D5대로 묶음을 내린다. 클라이언트 판정 없음.
7. **카피** — 묶음 타일·낭독·삭제 스낵바(ko/en), ko 스냅샷.
8. **테스트** — 매퍼(kind 분기) · 묶음 타일 렌더·낭독 · 묶음 삭제 → 실행 취소 · 시리즈 화면 담기/빼기가 시리즈 API를 한 번 부름 · `sort=queue`는 `group` 없이.

## 범위 밖

- 재생 목록 패널의 시리즈 묶음 · 새 편 공개 푸시 · 묶음을 펼쳐 격자 안에서 편을 보이는 것(탭 = 시리즈 화면)

## 완료 조건

- Given 시리즈째 담긴 16편 / When 라이브러리 전체 탭 / Then 그 시리즈 타일이 하나이고 "시리즈 · 16편", 낱개 타일은 없다
- Given 편 하나만 담긴 시리즈 / When 라이브러리 / Then 묶음 타일 하나, "시리즈 · 1/16편"
- Given 묶음 타일 / When 탭 / Then 시리즈 화면이 열린다
- Given 묶음 ⋯ > [라이브러리에서 삭제] / When 5초 안에 [실행 취소] / Then 타일이 같은 자리로 돌아온다
- Given 시리즈 화면, 담기 전 / When [+] / Then 요청 1회, 버튼이 🗑으로, 라이브러리에 묶음 타일
- Given 시리즈째 담김 / When 시리즈 화면 🗑 → [실행 취소] / Then 다시 담기고 라이브러리 타일 자리 그대로
- Given 플레이어 재생 목록 패널(라이브러리 맥락) / Then 종전처럼 편 단위 목록

## 처리 기록

- 2026-10-22 14:46 발행. 그때까지 시리즈 화면은 편 단위 임시 구현(#1835·#1839)을 유지한다.
