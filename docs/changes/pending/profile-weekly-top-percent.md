# 프로필 주간 청취 — 상위 % 알약 · 하루 평균 단위 작게

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/profile-api.md` 4.1·4.2(`weekly_listening.listening_top_percent`) · `features/profile.md` 4.6 · `spec/uiux/profile-uiux.md`(주간 카드 요약 줄·카피) |
| 요청 파트 | 프론트엔드(화면) · 백엔드(계약 — `tickets/backend/archive/weekly-listening-top-percent.md`) |
| 발행 날짜 | 2026-10-10 |
| 시작 날짜 | 2026-10-10 |
| 기한 | 2026-10-17 (Low — 다음 주 안) |
| 선행 | `tickets/backend/archive/weekly-listening-top-percent.md`(KAN-168) — 계약 확정 |
| 중요도 | Low — FE 는 필드가 없으면 그리지 않아 서버 반영 전에도 깨지지 않는다 |

## 배경

PM 2026-10-10 23:36 "리텐션 상위 몇 % — 하루 평균 오른쪽에 애플처럼, 근데 평균은 시간이 많으면 넘칠 것 같아" → 23:38 "전체에서 이번 주에 들은 거 상위 %".

## 바뀐 것 (FE 코드 반영 완료)

- **상위 %**: 큰 평균 숫자와 **같은 줄 오른쪽**에 회색 글자 **"다른 사용자 대비 상위 N%"**(16pt, 좁으면 두 줄 — PM 10-11 00:42 "타 사용자 대비 문구", "이번 주"는 지난 주로 넘기면 틀려 뺐다) + 채운 회색 원 위 화살표 — 스크린 타임 "지난주 대비 8%" 문법(PM 2026-10-11 00:28 스샷). 밑변을 숫자에 맞추고, 긴 평균값이면 숫자 쪽이 줄어든다. 서버 값이 `null`·없음이면 그리지 않고, 주 전환 중엔 숨긴다. 낭독은 요약 줄에 이어 "이번 주 청취 시간 전체 상위 N퍼센트". (10-10 첫 반영은 라벨 줄 오른쪽 흰 알약이었다.)
- **하루 평균 숫자는 크게·단위는 작게**: "1**시간** 12**분**" — 숫자 34pt, 단위 20pt 회색(애플 건강·스크린 타임). 한 줄 고정, 넘치면 글자를 줄인다(최소 60%). "1분 미만"은 그대로.

## 문서에 옮겨 적을 것

- profile-api.md: `listening_top_percent` 정의(BE 티켓 계약 확정본).
- profile.md 4.6: 주간 카드 요약 줄에 상위 % (서버 판정, `null` 이면 없음).
- profile-uiux.md: 요약 줄 배치·카피("상위 N%", 낭독 문구)·단위 작게.

## 완료 조건

- Given 문서 반영 후, When profile-api.md 4.1 `weekly_listening` 을 읽으면, Then `listening_top_percent` 와 `null` 조건이 적혀 있다
- Given 문서 반영 후, When profile-uiux.md 주간 카드 요약 줄을 읽으면, Then 상위 % 알약 위치·카피·낭독과 숫자/단위 크기가 적혀 있다
