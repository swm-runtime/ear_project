# [AI] 플레이어 바 구간 요약 — 구간별 한 줄 요약 생성 + 표시 디자인

| 항목 | 값 |
|---|---|
| 대상 | `pipeline/`(요약 생성·발행 패키지) · 미니 플레이어 요약 영역 디자인 · 서버 전달 형식(BE와 협의) |
| 요청 파트 | AI(파이프라인·UI/UX) |
| 요청자 | 이주호(PM) |
| 담당 | 박수헌 |
| Jira | [KAN-137](https://runtime364.atlassian.net/browse/KAN-137) |
| 발행 날짜 | 2026-10-05 |
| 시작 날짜 | 2026-10-05 |
| 기한 | 2026-10-09 (Low — 이번 주 안) |
| 선행 | 없음 |
| 근거 문서 | KAN-127(FE 표시 — `tickets/frontend/pending/player-bar-section-summary.md`) · `backend/domain.md` 5.3 `content_scripts` · `frontend/design.md` |
| 중요도 | Low — PM 발행(2026-10-05). 중요도 미지정이라 이번 주 마감으로 잡았다 — 바꾸려면 Jira·이 표를 함께 고친다 |
| 상태 | 대기 |

## 무엇을 한다

KAN-127(FE — 플레이어 바 위에 지금 듣는 부분 요약 표시)의 짝 티켓. **KAN-127 구현의 선행**이다(Jira `blocks` 링크).

1. **요약 생성(파이프라인)** — 대본을 주제 단위 구간(한 편 4~8개)으로 나누고 구간마다 한 줄 요약 + 시작 시각(배포본 기준)을 만든다
2. **전달 형식** — 발행 패키지에 실어 서버로 넘기는 형식을 BE와 맞춘다(`content_scripts` 확장 또는 새 필드 — `domain.md` 변경이 필요하면 `changes/`로 요청)
3. **표시 디자인(UI/UX)** — 미니 플레이어 위 요약 영역의 위치·길이·전환 모션·요약 없는 콘텐츠 처리(`frontend/design.md` 기준). 확정안을 KAN-127에 넘긴다
4. 기존 발행분 소급 여부를 정한다

## 완료 조건

- Given 새로 렌더한 에피소드 / When 발행 패키지를 본다 / Then 구간별 요약·시작 시각이 들어 있다
- Given 전달 형식 / When `domain.md`·`spec/api/`를 본다 / Then 요약 필드가 정의돼 있다(변경 요청이 반영됐거나 `changes/pending/`에 있다)
- Given 디자인 확정안 / When KAN-127을 본다 / Then 위치·길이·전환·빈 상태가 넘겨져 있다
