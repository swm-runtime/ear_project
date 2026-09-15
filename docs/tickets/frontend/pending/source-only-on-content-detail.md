# [FE] 출처·저자를 콘텐츠 상세에서만 보이게 하고, 인기 카드를 줄인다

| 항목 | 값 |
|---|---|
| 대상 | 탐색 4종 · 라이브러리 2종 · 온보딩 담기 카드 · 플레이어 2종 · `explore.copy.ts` |
| 요청 파트 | 프론트엔드 |
| 발행 날짜 | 2026-09-15 |
| 발견 시점 | 사용자 요청 — 목록마다 "참고한 자료: A, B, C…"가 길게 붙어 화면이 지저분하다 |
| 근거 문서 | `changes/pending/source-shown-only-on-detail.md`(고지 요건 검토 포함) |
| 심각도 | **중** — 표시 변경이지만 고지 요건(FR-12 · PRD 228)에 닿는다 |
| 상태 | 대기 — 코드 선반영, **실기기 확인 남음** |

## 반영 내용

**출처·저자를 콘텐츠 상세에서만 노출한다.**

| 파일 | 변경 |
|---|---|
| `ExploreContentRow` · `ExploreFeaturedCard` · `ExploreTile` · `ExploreMoreSheet` | 출처·저자 줄 제거 |
| `LibraryItemCard` · `MoreActionsSheet`(library) | 제거 |
| `ContentPickCard`(onboarding) | 제거 |
| `PlayerScreen` · `PlayerMoreSheet` | 제거 |
| `ContentDetailSourceSection` | **유지** |

- 탐색 타일은 `출처 · 길이`였으므로 **길이만** 남는다
- **[원문 보기] 칩은 플레이어에 그대로** — 고지가 아니라 원문 연결 수단이다(FR-12 후단)
- `EXPLORE_COPY.row.a11yLabel`에서 `sourceName` 인자를 뺐다 — **화면에 없는 값을 낭독하면
  화면과 어긋난다**
- 라이브러리 **검색은 출처를 계속 포함한다**(FR-22) — 표시와 검색 대상은 별개다

### 죽은 코드를 함께 걷었다

줄을 지우면 스타일과 prop이 쓰이지 않은 채 남는다. `StyleSheet`의 미사용 키는 lint가
잡지 못하므로 직접 확인해 지웠다.

- 미사용 `styles.meta` 3곳(`ExploreFeaturedCard` · `ExploreMoreSheet` · `MoreActionsSheet`)
- 미사용 `styles.sourceText`(`PlayerScreen`)
- `PlayerMoreSheet`가 더 이상 쓰지 않는 `summary.authorName` · `summary.sourceName` prop과
  `PlayerScreen`의 전달부

## 인기 카드 크기

`ExploreFeaturedCard`의 폭을 화면의 **78% → 72%**(상한 340 → 312)로 줄였다. 카드가 화면을
덜 차지하면서 "다음 카드가 옆에 걸쳐 보여야 한다"는 원래 의도는 오히려 강해진다.

## 고지 요건 — 되돌릴 조건

FR-12는 표시 위치를 특정하지 않는다("적합한 형태로"). 변경 후에도 고지는 **오디오 멘트**와
**콘텐츠 상세**에 남는다. 다만 **파트너 계약에 "모든 노출면 표기" 조항이 있으면 되돌려야
한다** — 계약서를 확인하지 않고 내린 판단이다(사용자 결정 2026-09-15). 상세 근거는
`changes/pending/source-shown-only-on-detail.md`의 "고지 요건 검토" 절에 있다.

## 완료 조건

- Given 탐색·라이브러리·온보딩·플레이어 / When 콘텐츠 카드를 본다 / Then 출처·저자 줄이 없다
- Given 콘텐츠 상세 / When 출처 영역을 본다 / Then 종전과 같이 파트너·AI 생성 구성이 보인다
- Given 플레이어 / When `source_url`이 있는 콘텐츠를 본다 / Then [원문 보기] 칩은 그대로 있다
- Given 낭독기 / When 콘텐츠 카드에 초점을 둔다 / Then 출처를 읽지 않는다
- Given 라이브러리 검색 / When 출처명을 입력한다 / Then 그 콘텐츠가 검색된다
- Given 탐색 인기 섹션 / When 카드를 본다 / Then 종전보다 좁고 다음 카드가 더 걸쳐 보인다
