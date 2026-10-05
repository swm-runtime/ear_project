# [AI] 콘텐츠 태그 붙이기

| 항목 | 값 |
|---|---|
| 대상 | 태그 체계 · 파이프라인 태그 부여 · 기발행 소급 · (노출 시) FE·BE 티켓 |
| 요청 파트 | AI(파이프라인) |
| 요청자 | 이주호(PM) |
| 담당 | 박수헌 |
| Jira | [KAN-139](https://runtime364.atlassian.net/browse/KAN-139) |
| 발행 날짜 | 2026-10-05 |
| 시작 날짜 | 2026-10-05 |
| 기한 | 2026-10-09 (Low — 이번 주 안) |
| 선행 | 없음 |
| 근거 문서 | `ai/metadata-pipeline.md`(enrichment — keywords·target_audiences 등) · `features/explore.md` · `features/content-detail.md` |
| 중요도 | Low — PM 발행(2026-10-05). 중요도 미지정이라 이번 주 마감으로 잡았다 — 바꾸려면 Jira·이 표를 함께 고친다 |
| 상태 | 대기 |

## 무엇을 한다

1. **태그 체계 결정** — 기존 추천 메타(`enrichment.json`의 keywords·target_audiences 등)를 태그로 쓸지, 표시용 태그를 따로 둘지
2. **부여** — 신규 발행분은 파이프라인에서, 기존 발행분은 소급
3. **노출** — 앱에 보여준다면 위치(상세·탐색)를 FE와 맞추고 필요하면 FE·BE 티켓을 따로 낸다

## 완료 조건

- Given 결정 / When `ai/metadata-pipeline.md`(또는 새 절)를 본다 / Then 태그 체계와 부여 규칙이 적혀 있다
- Given 신규·기존 발행 콘텐츠 / When 메타를 조회한다 / Then 태그가 붙어 있다
- Given 앱 노출을 하기로 했다면 / When 요청 문서를 본다 / Then FE·BE 티켓이 발행돼 있다
