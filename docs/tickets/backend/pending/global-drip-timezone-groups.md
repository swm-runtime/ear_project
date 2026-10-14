# [BE] 글로벌 5 — 시간대 그룹 드립 배치·영어 푸시/메일 템플릿

| 항목 | 값 |
|---|---|
| 대상 | `drip_batch_runs`(`group` 축) · 드립 크론 스케줄러 · `drip-batch.orchestrator.ts` resume·`already_placed` · `notification.constant.ts` · 인증 메일 템플릿 · `features/drip-scheduling.md`(changes) |
| 요청 파트 | 백엔드 |
| 요청자 | 박준현(테크리드) |
| 담당 | 박준현 |
| Jira | [KAN-191](https://runtime364.atlassian.net/browse/KAN-191) · 에픽 [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) |
| 발행 날짜 | 2026-10-14 |
| 시작 날짜 | 2026-10-14 |
| 기한 | 2026-10-19 (Medium 환산은 발행+3일(10-17)이나 선행 티켓 뒤 착수라 10일 계획의 마일스톤 날짜로 적음) |
| 선행 | [KAN-187](https://runtime364.atlassian.net/browse/KAN-187) `global-market-users.md`(`users.timezone`·`language_code`) · [KAN-188](https://runtime364.atlassian.net/browse/KAN-188)(드립 후보 시장 필터) |
| 관련 | KAN-149(05:00 경계)와 같은 크론 영역 — 서비스 날짜 경계는 이 티켓에서 바꾸지 않는다 |
| 근거 문서 | **`spec/api/global-api.md` 2.3 푸시·메일 행 · 2.4 · 8장 `drip_batch_runs` 행 · 9장 미결 #3** — 구현은 이 문서를 따르고, 계약이 바뀌면 티켓이 아니라 이 문서를 고친다 · 2026-10-14 글로벌화 조사 |
| 중요도 | Medium |
| 상태 | 대기 |

> 2026-10-14 발행한 묶음 티켓(BE KAN-185 · FE KAN-183 · AI KAN-184)을 처리 단위로 나눈 것. 결정 사항(같은 앱·기기 언어로 가입 시 1회 시장 판정·한국 트랙 불변·에러 번역은 클라이언트·가격은 스토어·영어 진행자 새 2인·K-컬처 주제 신설·GLOBAL 연령 16세)과 결정 대기(시장 전환 불허)는 `spec/api/global-api.md` 2.1·9장이 원본이다.

## 무엇을 한다

- `users.timezone`을 발송 그룹으로 묶는 서버 설정(기본 `asia`·`europe`·`americas`, 오프셋 경계는 미결 #3 기본값). 그룹마다 "현지 05:00"(편성)·**"현지 07:00"(도착 알림)**에 해당하는 UTC 크론(2026-10-14 확정 — `global-api.md` 2.4).
- KR 07:00 KST 알림 분리(PR #1532)를 그룹 단위로 넓힌다: `notifyTodayArrivals(now, group)`이 그 그룹의 `drip_batch_runs` 행을 찾고 그 그룹 사용자 적립분만 읽는다. 늦게 끝난 배치의 즉시 발송 판정(`isAfterArrivalPushTime`)도 그룹 현지 07:00 기준. 푸시 `ttl`은 그룹의 다음 배치까지. 그룹 알림 시각이 KST 서비스 날짜(05:00 경계)를 넘으면 하루 1건 판정이 어긋나고 발송이 빠지는 구간이 생기므로, 그룹 경계(미결 #3)를 정할 때 함께 확인한다.
- `drip_batch_runs`에 `group`(DEFAULT `asia`), 유니크 `(run_date) → (run_date, group)`. `claim`·`reclaimUnfinished`·`already_placed` 판정은 그룹 안에서 종전과 같다.
- 서비스 날짜 경계는 전 시장 **05:00 KST 단일 유지** — 재생 한도·체험·주간 창은 손대지 않는다.
- 푸시 제목·본문과 인증 메일을 `users.language_code`(ko/en)로 템플릿 선택. en 템플릿 신설.
- `features/drip-scheduling.md` 개정 요청(changes/pending).

## 범위 밖

사용자별 서비스 날짜(2단계) · 그룹 경계 조정(미결 #3 결정 뒤)

## 완료 조건

- Given `americas` 그룹 GLOBAL 사용자 / When 그 그룹의 현지 05:00 UTC 시각 / Then 그 그룹만 편성되고 알림은 없다. 다른 그룹은 0건
- Given 같은 그룹 / When 그 그룹의 현지 07:00 UTC 시각 / Then 그 그룹 적립분만 영어 푸시로 사용자당 1건. 다른 그룹 사용자에게는 가지 않는다
- Given KR 사용자 / Then 05:00 KST 편성·07:00 KST 알림이 종전과 동일(회귀)
- Given 같은 `run_date`에 그룹 3개 실행 / Then `drip_batch_runs` 3행, 중복 편성 0건
- Given `language_code = en-US` 계정의 인증 메일 / Then 영어 템플릿

## 처리 기록
- 2026-10-14 발행(마크다운 + Jira). 묶음 티켓 분할.
- 2026-10-14 결정: 그룹도 **현지 05:00 편성 · 현지 07:00 알림**(KR 07:00 KST 알림 분리 PR #1532와 같은 이유). 무엇을 한다·완료 조건·`global-api.md` 2.4·6장 반영.
- 2026-10-14 시간대 그룹 구현(PR `feat(be)/drip-timezone-groups`) — 스위치 `DRIP_TIMEZONE_GROUPS_ENABLED` 기본 꺼짐(KR·운영 동작 불변). 기준 시간대 asia `Asia/Seoul`·europe `Europe/London`·americas `America/Chicago`, 오프셋 하한으로 빈틈없이 판정. 알림 범위는 그 그룹 실행 기록 생성~종료. 남은 것: 푸시 `ttl` 그룹 기준화(지금은 다음 05:00 KST까지), 그룹 경계 확정(미결 #3). 문서 개정 요청 `changes/pending/drip-timezone-groups.md`.
