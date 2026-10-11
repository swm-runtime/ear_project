# [BE] 주간 청취 — 상위 50% 밖 사용자에게도 보일 한 줄(나와의 비교) 내려주기

| 항목 | 값 |
|---|---|
| 대상 | `GET /profile`(4.1) `weekly_listening` · `GET /profile/weekly-listening`(4.2) — 새 필드 `listening_highlight` |
| 요청 파트 | 백엔드 |
| 요청자 | 이주호(PM) |
| 담당 | 박준현(BE) |
| Jira | [KAN-170](https://runtime364.atlassian.net/browse/KAN-170) — KAN-168 과 relates 링크 |
| 발행 날짜 | 2026-10-11 |
| 시작 날짜 | 2026-10-11 |
| 기한 | 2026-10-14 (Medium — 3일 안) |
| 선행 | 없음 — `tickets/backend/archive/weekly-listening-top-percent.md`(KAN-168)는 완료됨, 그 계산을 그대로 재사용한다 |
| 중요도 | Medium — PM 이 중요도를 따로 정하지 않아 기본값. 마감이 안 맞으면 등급을 내리지 말고 사유를 적는다 |

## 배경

KAN-168 로 주간 카드에 "다른 사용자 대비 상위 N%"를 띄웠다. 그런데 **상위 50% 밖이면 `null` 이라 아무것도 안 보인다** — 이탈 위험이 가장 큰 절반이 아무 말도 못 듣는다. 그 사람들에게는 남과의 비교 대신 **자기 자신과의 비교**를 보여 준다(PM 2026-10-11 18:53 "1번 먼저 ㄱㄱ" — 주간 청취 리텐션 개선 제안 1번). 무엇을 보일지는 서버가 정하고 앱은 받은 대로 그린다(판정은 서버 원칙).

## 계약 (제안 — 담당이 확정해 `profile-api.md` 에 반영)

`weekly_listening`(4.1)과 4.2 응답 오브젝트에 추가. 아래 **우선순위대로 첫 번째로 해당하는 하나**만 내려 준다:

```json
"listening_highlight": { "kind": "top_percent", "percent": 12 }
"listening_highlight": { "kind": "more_than_previous", "diff_sec": 720 }
"listening_highlight": { "kind": "listened_days", "days": 3 }
"listening_highlight": null
```

| 순위 | `kind` | 조건 | 값 |
|---|---|---|---|
| 1 | `top_percent` | `listening_top_percent` 가 `null` 이 아님(KAN-168 규칙 그대로) | `percent` = 그 값 |
| 2 | `more_than_previous` | 그 주 청취 합이 **비교 대상**보다 **60초 이상** 많다 | `diff_sec` = 차이(초, 정수) |
| 3 | `listened_days` | 그 주 들은 날(`daily_listened_sec` > 0)이 1일 이상 | `days` = 들은 날 수(1~7) |
| — | `null` | 그 주 청취 0초 | — |

- **비교 대상**(순위 2):
  - **지난 주(완료된 주)** → 그 직전 주의 청취 합 전체.
  - **진행 중인 이번 주** → 직전 주의 **같은 요일까지**(오늘 서비스 날짜의 요일 포함) 청취 합. 주 초반에 "지난주 전체"와 비교하면 거의 항상 지는 비교가 된다.
  - 직전 주가 없으면(가입 주) 순위 2 는 건너뛴다.
- **줄어든 쪽은 내려 주지 않는다** — "지난주보다 N분 덜"은 기를 꺾는다. 줄었으면 순위 3 으로 간다.
- `listening_top_percent` 는 **그대로 둔다**(이미 배포된 앱이 읽는다). FE 가 `listening_highlight` 로 옮긴 뒤 제거 여부를 따로 정한다.
- 진행 중인 이번 주는 요청 시점 값이다(주 중에 바뀐다). 지난 주(4.2)는 그 주 기준으로 계산한다.

### 화면 표시 (참고 — FE 몫, 카피는 `profile-uiux.md` 로 확정)

| `kind` | 윗줄(작은 회색) | 아랫줄(진하게) |
|---|---|---|
| `top_percent` | 다른 사용자 대비 | 상위 12% |
| `more_than_previous` | 전주보다 | 12분 더 |
| `listened_days` | 이번 주 / 그 주 | 3일 들었어요 |

## 착수 전에 PM과 맞출 것

- 우선순위(상위 % > 전주보다 더 > 들은 날 수) 확정
- 순위 2 의 최소 차이 60초(1분 미만이면 "0분 더"가 된다) 확정
- 진행 중인 주의 "같은 요일까지" 비교 확정

## 완료 조건

- Given 그 주 상위 12% 인 사용자, When 4.1 을 부르면, Then `listening_highlight` 가 `{ "kind": "top_percent", "percent": 12 }` 다
- Given 상위 50% 밖이고 그 주 합이 직전 주보다 720초 많은 사용자, When 4.2 로 그 주를 부르면, Then `{ "kind": "more_than_previous", "diff_sec": 720 }` 다
- Given 진행 중인 이번 주(수요일)이고 상위 50% 밖인 사용자, When 4.1 을 부르면, Then 비교 대상은 직전 주 월~수 합이다
- Given 상위 50% 밖이고 직전 주보다 적게 들었으며 그 주 2일 들은 사용자, When 4.1·4.2 를 부르면, Then `{ "kind": "listened_days", "days": 2 }` 다
- Given 가입 주(직전 주 없음)이고 상위 50% 밖인 사용자, When 4.1 을 부르면, Then 순위 2 를 건너뛰고 `listened_days` 다
- Given 그 주 청취 0초인 사용자, When 4.1·4.2 를 부르면, Then `listening_highlight` 가 `null` 이다
- Given 계약 확정 후, When `docs/spec/api/profile-api.md` 4.1 `weekly_listening` 절을 읽으면, Then `listening_highlight` 의 종류·우선순위·`null` 조건이 적혀 있다
