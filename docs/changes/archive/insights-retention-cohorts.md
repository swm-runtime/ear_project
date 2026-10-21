# 서비스 지표 코호트 리텐션(D1·D7 · W1~W4) — 사람별 접속일 표 `user_active_dates` (BE)

| 항목 | 값 |
|---|---|
| 대상 문서 | `backend/domain.md` 3.3(신설 3.3-2 `user_active_dates`) · 2장 모듈 소유 표(`auth`) · 12.1 보존 표(행 추가) · 12.3 즉시 파기 목록 · `spec/api/admin-api.md` 4.22(`retention_cohorts`) |
| 요청 파트 | 백엔드 — 박준현 |
| 발행 날짜 | 2026-10-18 |
| 관련 | 브랜치 `feat(be)/insights-retention` · 마이그레이션 `1790900000000-AddUserActiveDates` · 파이프라인 웹 서비스 지표 탭 · 선행 `insights-daily-active-users.md`(같은 배치·같은 신호) |

## 배경

서비스 지표의 기존 리텐션은 D1·D7·D30 값 하나씩이다. "가입 N일 뒤 이후 아무 때나 앱을 썼나"(언바운디드)를 전체 가입자로 센다. 그래서 **언제 들어온 사람들이 남았는지**가 보이지 않는다. 광고로 유입을 늘리는 구간에는 가입 수만 오르고 새는 것을 놓친다. 2026-10-18 멘토 조언은 이렇다: "D1·D7, W1~4를 절대수치와 비율로 같이 보라".

가입일·가입 주로 묶은 바운디드 리텐션은 **사람마다** "그날 앱을 열었나"를 알아야 한다. 하지만 두 원천 모두 이 용도로 쓸 수 없다.

- `daily_active_users`(3.3-1)는 날짜별 인원 수뿐이다.
- `sessions`는 만료·폐기 30일 뒤 hard delete된다(12.1). W4(가입 28~34일 뒤)를 셀 무렵이면 앞쪽 구간이 사라진다.

그래서 날이 끝나면 사람·날짜 한 쌍을 남긴다.

## 수정 내용

### `domain.md` 3.3-2 `user_active_dates`(신설)

```
user_active_dates
  user_id      uuid   PK, FK → users.id ON DELETE CASCADE
  active_date  date   PK   KST 달력일(서비스 날짜 05:00 경계가 아니다 — 3.3-1과 같은 단위)
  created_at · updated_at
```

- **행의 뜻**: 그날 그 사용자의 `sessions.issued_at`이 하나라도 있었다. 값 열은 없다. `daily_active_users`와 같은 신호다.
- **쓰기**: `DailyActiveUserScheduler`(00:10 KST)가 어제·그제마다 `daily_active_users`를 다시 센 뒤 이 표에도 넣는다.
  - **넣기만 한다**(`ON CONFLICT DO NOTHING`). 몇 번 넣어도 같다.
  - 원천 세션이 지워진 뒤에도 이미 남긴 행은 그대로다.
- **백필**: 마이그레이션 실행 시점에 남아 있는 `sessions` 전부다.
  - 3.3-1과 달리 경계를 자르지 않는다. 일부가 지워진 날의 행도 "그날 접속했다"는 사실로는 맞다. 빠진 사람만 있을 뿐이다.
  - 믿을 수 있는 구간은 응답의 `reliable_since`로 가린다(아래).
- **탈퇴**: 사람을 가리키는 열이 있어 **즉시 파기**한다. `users` FK의 ON DELETE CASCADE다.
- **규약 예외**: PK가 자연키 `(user_id, active_date)`다(`convention.md` 1.5·4.2 예외, 3.3-1과 같다).

### `domain.md` 나머지

- **2장 모듈 소유 표**: `auth`에 `user_active_dates`를 추가한다. 서비스 지표(admin)는 읽기만 한다.
- **12.1 보존 표**: `user_active_dates` | **탈퇴 시 즉시 파기, 그 밖엔 무기한** | 코호트 리텐션의 재료다. 원천(`sessions`)이 30일 뒤 지워져 다시 만들 수 없다(2026-10-18).
- **12.3 즉시 파기 목록**: `user_active_dates`를 추가한다.

### `admin-api.md` 4.22 — Response에 `retention_cohorts`를 더한다

```json
{
  "retention_cohorts": {
    "daily": {
      "span": 1,
      "offsets": [1, 7],
      "reliable_since": "2026-09-19",
      "rows": [
        { "start": "2026-10-17", "users": 6, "cells": [null, null] },
        { "start": "2026-10-10", "users": 9, "cells": [{ "returned": 4, "rate": 0.444, "partial": false }, { "returned": 2, "rate": 0.222, "partial": false }] }
      ]
    },
    "weekly": {
      "span": 7,
      "offsets": [1, 2, 3, 4],
      "reliable_since": "2026-09-19",
      "rows": [
        { "start": "2026-09-07", "users": 8, "cells": [
          { "returned": 6, "rate": 0.75, "partial": true },
          { "returned": 7, "rate": 0.875, "partial": false },
          { "returned": 7, "rate": 0.875, "partial": false },
          { "returned": 2, "rate": 0.25, "partial": false }
        ] }
      ]
    }
  }
}
```

**묶음**

- 현재 계정을 가입한 KST 달력일로 묶는다.
- `daily`는 최근 14일(어제부터, 오늘 제외)이다.
- `weekly`는 최근 8주(이번 주 포함, ISO 주 월요일 시작)다. `start`는 그 주 월요일이다.
- 최근 묶음이 먼저 온다. 가입 0명인 묶음도 행을 둔다.
- **창(`days`)과 무관하다.**

**구간**

- **사람마다 자기 가입일 기준**이다.
- `offset`번째 구간은 가입일 + `offset × span`일부터 `span`일이다.
  - D1 = 가입 다음 날 하루, D7 = 가입 7일 뒤 하루(가입일 + 7).
  - W1 = 7~13일, W2 = 14~20일, W3 = 21~27일, W4 = 28~34일 뒤.

**돌아옴**

- 그 구간에 다음 중 하나라도 있으면 돌아온 것으로 센다.
  - `user_active_dates`
  - 아직 남은 `sessions`
  - `play_records`(무기한)
- 기존 `retention`과 같은 "앱을 썼다" 정의다(접속 또는 재생).

**칸**

- **`null`**: 묶음의 **마지막 가입자 기준으로 구간이 아직 안 끝났다**(구간의 마지막 날이 오늘 이후). 일부만 끝난 묶음을 숫자로 내면 최근 묶음이 낮아 보여 섞지 않는다.
- `rate`는 `returned / users`다. 가입 0명이면 `null`이다.
- **`partial`**: 구간 시작일이 표의 `reliable_since`보다 이르다. 그 앞은 세션이 지워져 **재생만** 잡혀 실제보다 낮다.
  - `reliable_since` = `user_active_dates`가 백필된 날(KST, `min(created_at)`) - 29일이다. 그때 세션이 온전히 남아 있던 범위다. 표가 비었으면 오늘 - 29일이다(질의가 남은 세션도 함께 읽는다).
  - 일별 접속자의 `active_users_since`를 빌리지 않는다. 두 마이그레이션(`1790800000000`·`1790900000000`)이 다른 날 돌면(개발계) 어긋나기 때문이다.

**생존 편향**

- 탈퇴자는 분모·분자 모두에서 빠진다. 기존 `retention`과 같다.

## 범위 밖

- 시장별 코호트는 하지 않았다. 필요하면 `users.market`으로 나눠 붙일 수 있다.
- 기존 언바운디드 `retention`(D1·D7·D30)은 그대로 둔다. 화면에서는 두 표가 함께 보인다.

## 완료 조건

- Given `domain.md` / When 3.3-2를 읽는다 / Then 위 표·쓰기 규칙(00:10 KST, 어제·그제, `DO NOTHING`)·백필(남은 세션 전부)·탈퇴 CASCADE가 코드와 같다. 코드는 `UserActiveDate` 엔티티 · `DailyActiveUserRepository.recordActiveDates` · `DailyActiveUserScheduler` · 마이그레이션 `1790900000000`이다.
- Given `domain.md` 2장·12.1·12.3 / When `auth` 소유 표·보존 표·즉시 파기 목록을 읽는다 / Then `user_active_dates`가 있다
- Given `admin-api.md` 4.22 / When Response와 설명을 읽는다 / Then `retention_cohorts`의 묶음(14일·8주, 창 무관)·구간(사람별 가입일 기준)·`null`·`partial` 규칙이 위와 같다

## 처리 기록

2026-10-18 발행. 로컬 검증 결과는 다음과 같다.

- 마이그레이션
  - run → 460행이다. `sessions`의 (사용자, KST 날짜) distinct 수와 같다.
  - revert(표 삭제 확인) → run 재적용.
- `GET /admin/insights/summary` 실측
  - 일별 14행·주별 8행이다.
  - 어제 묶음의 D1은 `null`이다.
  - 09-21 주는 W3부터 `null`이다(마지막 가입자 09-27 + 21일 = 10-18).
  - 09-07 주 W1은 `partial`이다.
- E2E
  - 사람별 접속일을 두 번 넣어도 같고, 원천 세션을 지운 뒤에도 남는다.
  - 코호트 집계는 저장 기록·세션·재생 세 원천을 모두 센다.
  - 경계: 가입 당일·D2 활동은 D1이 아니다. 일요일 KST 23:59 가입자는 그날 묶음이자 그 주 묶음이다. 가입 14일 뒤 재생은 W2다.
- 독립 검토(2026-10-18)를 반영했다: `partial` 기준을 이 표의 백필일로 바꿨고, 경계 E2E를 추가했으며, "D7 = 7일 뒤" 표기로 고쳤다.
- 2026-10-19 **반영**(PR `docs(be)/apply-pending-changes-1019`). 반영 날짜 2026-10-19. `domain.md` 2장 · 3.3-2 신설 · 12.1 · 12.3 즉시 파기, `admin-api.md` 4.22(`retention_cohorts`)에 반영했다. 코드를 따라 두 곳을 다듬었다: `reliable_since`는 `min(백필일 - 29일, 오늘 - 29일)`이고 두 표가 같은 값이다. 칸이 `null`인 조건은 "구간의 마지막 날이 오늘이거나 그 뒤"다.
