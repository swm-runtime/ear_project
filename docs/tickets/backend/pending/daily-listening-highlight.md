# [BE] 주간 청취 — 요일별 한 줄(지난주 같은 요일 대비 · 최고의 날 · 들은 편 수) 내려주기

| 항목 | 값 |
|---|---|
| 대상 | `GET /profile`(4.1) `weekly_listening` · `GET /profile/weekly-listening`(4.2) — 새 필드 `daily_listening_highlight` |
| 요청 파트 | 백엔드 |
| 요청자 | 이주호(PM) |
| 담당 | 박준현(BE) |
| Jira | [KAN-171](https://runtime364.atlassian.net/browse/KAN-171) — KAN-170 과 relates 링크 |
| 발행 날짜 | 2026-10-11 |
| 시작 날짜 | 2026-10-11 |
| 기한 | 2026-10-14 (Medium — 3일 안) |
| 선행 | 없음 — `tickets/backend/archive/weekly-listening-highlight.md`(KAN-170)는 완료됨. 같은 응답에 필드를 하나 더 얹는다 |
| 중요도 | Medium — PM 이 중요도를 따로 정하지 않아 기본값. 마감이 안 맞으면 등급을 내리지 말고 사유를 적는다 |

## 배경

주간 카드에서 요일 막대를 누르면 요약 줄이 "수요일 · 그 값"으로 바뀌는데, 오른쪽 두 줄(주간 한 줄, KAN-170)은 **숨긴다**(하루 값엔 순위가 없다). 그 자리에 **그날의 나와의 비교**를 보여 준다(PM 2026-10-11 23:02 "이것도 ㄱㄱ" — 요일 리텐션). 무엇을 보일지는 서버가 정하고 앱은 받은 대로 그린다(판정은 서버 원칙).

**그날 상위 %는 넣지 않는다**(PM 23:01 합의) — 사용자 수가 적어 하루 순위가 크게 출렁이고(오늘 상위 8% → 다시 보면 40%), 순위는 주간 한 줄이 이미 보여 준다. 리텐션은 남이 아니라 지난주의 나와 비교할 때 생긴다.

## 계약 (제안 — 담당이 확정해 `profile-api.md` 에 반영)

`weekly_listening`(4.1)과 4.2 응답 오브젝트에 추가. **월~일 7칸 배열**(`daily_listened_sec` 와 같은 순서) — 각 칸은 아래 **우선순위대로 첫 번째로 해당하는 하나** 또는 `null`:

```json
"daily_listening_highlight": [
  { "kind": "more_than_last_week", "diff_sec": 720 },
  { "kind": "best_day" },
  { "kind": "listened_contents", "count": 2 },
  null, null, null, null
]
```

| 순위 | `kind` | 조건 | 값 |
|---|---|---|---|
| 1 | `more_than_last_week` | 그날 청취가 **직전 주 같은 요일**보다 **60초 이상** 많다 | `diff_sec` = 차이(초, 정수) |
| 2 | `best_day` | 그 주에서 가장 많이 들은 날(동률이면 모두). **그 주 들은 날이 2일 이상일 때만** — 하루만 들은 주의 "가장 많이 들은 날"은 의미가 없다 | 없음 |
| 3 | `listened_contents` | 그날 청취 > 0 | `count` = 그날 청취 > 0 인 콘텐츠 수 |
| — | `null` | 그날 0초(진행 중인 주의 아직 안 온 요일 포함) | — |

- 직전 주가 없으면(가입 주) 순위 1 은 건너뛴다. **줄어든 날은 내려 주지 않는다**("N분 덜" 없음) — 순위 2 로 간다.
- 진행 중인 이번 주는 요청 시점 값이다. `best_day` 는 오늘까지 중 최고라 주 중에 바뀔 수 있다(잠정).
- 원천: 직전 주 7일 합(`sumListenedSecByDates` 한 번 더), 그날 편 수는 이미 받는 `sumListenedSecByContentAndDates` 로 센다 — 추가 조회는 직전 주 하나다. 판정은 `pickListeningHighlight` 처럼 순수 함수로 두면 DB 없이 경계를 테스트할 수 있다.

### 화면 표시 (참고 — FE 몫, 카피는 `profile-uiux.md` 로 확정)

요일을 고르면 주간 한 줄 자리(두 줄, 오른쪽 정렬)에 그린다. `null` 이면 지금처럼 비워 둔다(자리는 유지 — 그래프가 움직이지 않는다).

| `kind` | 윗줄(작은 회색) | 아랫줄(진하게) |
|---|---|---|
| `more_than_last_week` | 지난주 수요일보다 / 전주 수요일보다 | ⬆ 12분 더 |
| `best_day` | 이번 주 / 그 주 | ★ 가장 많이 들은 날 |
| `listened_contents` | 그날 | ✓ 2편 들었어요 |

## 착수 전에 PM과 맞출 것

잠정값으로 먼저 구현해도 된다(바뀌면 상수·조건만 고친다):

- 순위 1 의 최소 차이 60초(KAN-170 과 같게)
- `best_day` 의 "들은 날 2일 이상" 조건과 동률 처리(모두 best)
- 진행 중인 주의 `best_day` 는 오늘까지 기준

## 완료 조건

- Given 직전 주 수요일 600초 · 이번 주 수요일 1320초 들은 사용자, When 4.1 을 부르면, Then 수요일 칸(2번째 인덱스)이 `{ "kind": "more_than_last_week", "diff_sec": 720 }` 이다
- Given 직전 주 같은 요일보다 적게 들었지만 그 주(들은 날 2일 이상)에서 가장 많이 들은 날, When 4.1·4.2 를 부르면, Then 그 칸이 `{ "kind": "best_day" }` 다
- Given 그 주 하루만 들었고 직전 주 같은 요일보다 적은 날, When 부르면, Then 그 칸이 `best_day` 가 아니라 `listened_contents` 다
- Given 위 둘 다 아니고 그날 콘텐츠 2편을 들은 날, When 부르면, Then 그 칸이 `{ "kind": "listened_contents", "count": 2 }` 다
- Given 가입 주(직전 주 없음), When 4.1 을 부르면, Then 어떤 칸도 `more_than_last_week` 가 아니다
- Given 그날 0초(진행 중인 주의 아직 안 온 요일 포함), When 부르면, Then 그 칸이 `null` 이다
- Given 계약 확정 후, When `docs/spec/api/profile-api.md` 4.1 `weekly_listening` 절을 읽으면, Then `daily_listening_highlight` 의 종류·우선순위·`null` 조건이 적혀 있다
