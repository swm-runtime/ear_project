# [BE] 주간 청취 — 그 주 청취 시간 전체 상위 % 내려주기

| 항목 | 값 |
|---|---|
| 대상 | `GET /profile`(4.1) `weekly_listening` · `GET /profile/weekly-listening`(4.2) — 새 필드 `listening_top_percent` |
| 요청 파트 | 백엔드 |
| 요청자 | 이주호(PM) |
| 담당 | 미정(BE) |
| Jira | [KAN-168](https://runtime364.atlassian.net/browse/KAN-168) |
| 발행 날짜 | 2026-10-10 |
| 시작 날짜 | 2026-10-10 |
| 기한 | 2026-10-13 (Medium — 3일 안) |
| 선행 | 없음 |
| 중요도 | Medium — PM 이 중요도를 따로 정하지 않아 기본값. 마감이 안 맞으면 등급을 내리지 말고 사유를 적는다 |

## 요청

프로필 주간 청취 카드의 "하루 평균" 줄 오른쪽에 **"상위 N%"** 알약을 띄운다(PM 2026-10-10 23:36 · 23:38 "전체에서 이번 주에 들은 거 상위 %"). 순위 판정은 서버가 하고 앱은 받은 값을 그대로 그린다(판정은 서버 원칙). FE 는 필드를 읽는 코드를 먼저 넣었다 — 필드가 없거나 `null` 이면 알약을 그리지 않는다.

## 계약 (제안 — 담당이 확정해 `profile-api.md` 에 반영)

`weekly_listening`(4.1)과 4.2 응답 오브젝트에 추가:

```json
"listening_top_percent": 12
```

- **값**: 정수 1~100 중 노출 대상만(아래), 아니면 `null`.
- **측정값**: 그 주(월요일 04:00 ~ 다음 월요일 04:00, `daily_listened_sec` 와 같은 경계)의 청취 시간 합 = `daily_listened_sec` 7개의 합.
- **모집단**: **전체 가입자** — 그 주가 끝나는 시점까지 가입했고 탈퇴하지 않은 사용자. 그 주에 0초인 사용자도 포함한다(PM "전체에서").
- **계산**: `순위 = 1 + (나보다 그 주 청취 시간이 많은 사용자 수)`, `상위 % = ceil(순위 / 모집단 수 × 100)`. 동점은 같은 순위(좋은 쪽).
- **`null` 조건**: ① 그 주 청취 0초 ② 상위 % 가 **50 초과**(하위권 "상위 85%"는 사실상 하위라 기를 꺾는다 — 효헌 제안, PM 확인 필요).
- 진행 중인 이번 주는 요청 시점 값이다(주 중에 바뀐다). 지난 주(4.2)는 그 주 기준으로 계산한다.

## 착수 전에 PM과 맞출 것

- 50% 기준선 확정(또는 다른 값)
- 운영·테스트 계정을 모집단에서 뺄지
- 모집단이 작을 때(가입자 수가 적은 개발계 등) 최소 인원 기준을 둘지

## 완료 조건

- Given 그 주 청취 시간이 모집단 상위 12% 인 사용자, When `GET /profile` 을 부르면, Then `weekly_listening.listening_top_percent` 가 `12` 다
- Given 그 주 청취 0초인 사용자, When 4.1·4.2 를 부르면, Then `listening_top_percent` 가 `null` 이다
- Given 상위 50% 밖인 사용자, When 4.1·4.2 를 부르면, Then `listening_top_percent` 가 `null` 이다(기준선이 바뀌면 그 값으로)
- Given 지난 주 토큰으로 4.2 를 부르면, When 응답을 보면, Then 그 주 기준으로 계산한 값이다
- Given 계약 확정 후, When `docs/spec/api/profile-api.md` 4.1 `weekly_listening` 절을 읽으면, Then `listening_top_percent` 의 정의·`null` 조건이 적혀 있다

## 처리 기록

(없음)
