# [FE] library.md · explore.md — 더보기 시트에 [원문 보기] 추가 (세 화면 통일)

| 항목 | 값 |
|---|---|
| 발행 날짜 | 2026-08-10 |
| 대상 문서 | `docs/features/library.md` 3장·8장, `docs/features/explore.md` 3장·4.3·8장, `docs/features/README.md` 결정 44번 |
| 요청 파트 | 프론트엔드 (와이어프레임 검토 결정 2026-08-10 — player V6) |
| 파급 | `library-uiux.md` 4.7 · `explore-uiux.md` 4.4의 시트 구성 — spec 최신화 단계에서 반영 |

## 결정 내용

플레이어 더보기에만 있던 [원문 보기]를 **라이브러리(L4)·탐색(E12) 더보기에도 추가해 세 화면을
통일**한다 (검토 보류 2026-08-09의 ② 안 채택 — 파트너 유입 접점 확대).

- `source_url`이 있는 콘텐츠만 노출한다.
- 탭하면 인앱 브라우저로 열고 원문 유입 클릭을 기록한다 — `player.md` 4.5와 같은 규칙,
  적재 테이블 `source_link_clicks`(`domain.md` 6.6).
- 시트 구성 문법(2026-08-07 확립: 대상 요약 + 좌측 정렬 액션 행 + [닫기], 위험색 규칙)은 그대로다.

## 완료 조건

- Given 이 요청이 반영된다 / When `library.md` 3장·`explore.md` 4.3을 읽는다 / Then 더보기
  시트의 [원문 보기] 규칙(`source_url` 조건·인앱 브라우저·클릭 기록)이 서술되어 있다
- Given 라이브러리·탐색 와이어프레임의 더보기 시트를 본다 / When L4·E12를 연다 / Then
  [원문 보기] 행이 플레이어 PL7과 같은 형태로 그려져 있다

---

## 처리 기록

| 항목 | 값 |
|---|---|
| 반영 날짜 | **2026-08-10** — 발행 즉시 직접 반영(와이어프레임 검토 중 사용자 지시) |

`library.md`·`explore.md`·`README.md` 결정 44번, `wireframe/library.html` L4 ·
`wireframe/explore.html` E12 · `wireframe/player.html` 주석 B·검증 V6 반영.
uiux spec 반영은 spec 최신화 단계로 이연.
