# [BE] 관리자 공지 작성·목록에 `market` — GLOBAL 공지를 만들 수 있게

| 항목 | 값 |
|---|---|
| 대상 | `POST /admin/notices` · `GET /admin/notices` · `admin-api.md` 4.12·4.13(changes) |
| 요청 파트 | 백엔드 |
| 요청자 | 박준현(테크리드) |
| 담당 | 박준현 |
| Jira | [KAN-211](https://runtime364.atlassian.net/browse/KAN-211) · 에픽 [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) |
| 발행 날짜 | 2026-10-15 |
| 시작 날짜 | 2026-10-15 |
| 기한 | 2026-10-18 (Medium — 발행 +3일) |
| 선행 | 없음 |
| 관련 | [KAN-188](https://runtime364.atlassian.net/browse/KAN-188) 카탈로그 격리(공지 조회의 시장 필터) · 콘솔 시장 선택 UI는 AI 파트(파이프라인 웹) 몫 |
| 근거 문서 | `spec/api/global-api.md` 4.8 공지 · `backend/domain.md` 9.2 `notices.market` |
| 반영 날짜 | 2026-10-15 |
| 중요도 | Medium |
| 상태 | 완료 (2026-10-15) |

## 배경

공지는 시장별로 보인다 — `notices.market` 컬럼이 있고 `GET /notices`·`GET /notices/:id`가 사용자 시장으로 거른다(`global-api.md` 4.8, KAN-188). 그런데 관리자 공지 작성(`POST /admin/notices`, `CreateNoticeRequestDto`)에 `market` 입력이 없어 **지금은 GLOBAL 공지를 만들 방법이 없다** — 모든 공지가 기본값 `kr`로 생성된다(2026-10-15 문서 반영 검증에서 발견).

## 무엇을 한다

- `POST /admin/notices`에 `market`(선택, `kr` \| `global`, 없으면 `kr`) — 관리자 주제 생성(`POST /admin/topics`)과 같은 방식.
- `GET /admin/notices` 항목에 `market` — 콘솔이 공지의 시장을 보여 줄 수 있게. 필요하면 `?market=` 필터.
- 생성 후 시장은 바꾸지 않는다(`PATCH`는 `market`을 받지 않는다).
- `admin-api.md` 4.12·4.13 개정 요청을 `changes/pending`에.

## 범위 밖

콘솔(파이프라인 웹)의 시장 선택 UI — AI 파트 몫. 서버는 선택 입력이라 지금 콘솔은 그대로 동작한다.

## 완료 조건

- Given `market: "global"`로 공지 작성 / When GLOBAL 계정이 `GET /notices` / Then 그 공지가 보이고, KR 계정에는 보이지 않는다
- Given `market` 없이 공지 작성 / Then `kr`로 생성(종전과 동일)
- Given 모르는 `market` 값 / Then 400 `VALIDATION_FAILED`
- Given `GET /admin/notices` / Then 항목에 `market`이 있다

## 처리 기록
- 2026-10-15 발행(마크다운 + Jira KAN-211).
- 2026-10-15 구현 — PR `feat(be)/admin-notice-market`(dev 대상). `POST /admin/notices` `market` 선택 입력(없으면 kr, 모르는 값 400) · `GET /admin/notices` 항목 `market` + `?market=` 필터 · 수정은 시장을 받지 않음(모르는 필드 400). 단위 1829건 통과, e2e 2건 추가(`notice.e2e-spec.ts` — GLOBAL 공지 격리·관리자 필터, 모르는 값 400)은 CI에서 확인. 문서 `changes/pending/admin-notice-market.md`.
- 2026-10-15 완료 — PR #1566 dev 머지·CI e2e 통과(GLOBAL 공지 격리·관리자 필터·모르는 값 400), #1567로 운영 배포(18:30 KST, 5xx 0건). 완료 조건 4개 충족. `archive/`로 이동.
