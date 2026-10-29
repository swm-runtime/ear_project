# [BE] 단기 실험 ⑧ 첫 드립 응답에 첫 콘텐츠 id 추가(온보딩 후 플레이어용)

| 항목 | 값 |
|---|---|
| 대상 | `GET /onboarding/first-drip` 응답 |
| 요청 파트 | 백엔드 |
| 요청자 | 박준현(테크리드) |
| 담당 | 박준현 |
| Jira | [KAN-292](https://runtime364.atlassian.net/browse/KAN-292) |
| 발행 날짜 | 2026-10-29 |
| 시작 날짜 | 2026-10-29 |
| 기한 | 2026-10-29 (High — 발행 당일) |
| 선행 | 없음 — **후행: KAN-295(FE 온보딩 후 플레이어)가 이 티켓의 API 명세에 막혀 있다. 명세를 먼저 낸다** |
| 근거 문서 | `spec/api/onboarding-api.md` · `features/onboarding.md` |
| 중요도 | High |
| 상태 | 발행 |

> 단기 실험 8종(2026-10-29 확정) 중 하나다. A/B 그룹별 지표를 어드민 "실험 지표" 탭에서 보는 일은 실험 전체에 걸친 별도 정리 대상이다(아직 티켓 없음).

## 왜

온보딩이 끝나면 첫 콘텐츠를 플레이어로 띄운다(KAN-295). 첫 드립은 완료 뒤 백그라운드로 만들어져 앱이 열 콘텐츠 id를 모른다 — 지금 응답은 status·library_item_count·completed_at뿐이다.

## 무엇을 한다

- **1단계 API 명세**: `status = completed`일 때 열 콘텐츠 id 필드 → `spec/api/onboarding-api.md` 확정 후 FE에 알린다.
- 어떤 편을 줄지 명세에서 정한다(첫 드립 편 중 첫 번째 / 온보딩 3단계에서 담은 편 우선).
- 응답 DTO · 테스트. 문서 수정은 `changes/pending`에 기록.

## 범위 밖

- 앱 이동(KAN-295).

## 완료 조건

- Given 첫 드립 완료 / When `GET /onboarding/first-drip` / Then 열 콘텐츠 id가 실린다
- Given 첫 드립 미완료·후보 없음 / Then 필드가 null이다

## 처리 기록

- 2026-10-29 발행(마크다운 + Jira KAN-292).
