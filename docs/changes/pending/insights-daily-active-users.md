# 서비스 지표 일별 접속자·요일별 평균 — 세션 파기에도 남는 집계 표 `daily_active_users` (BE)

| 항목 | 값 |
|---|---|
| 대상 문서 | `backend/domain.md` 3.3(신설 3.3-1 `daily_active_users`) · 2장 모듈 소유 표(`auth`) · 12.1 보존 표(`daily_active_users` 행 추가) · 12.3 "그대로 유지" 목록 · `spec/api/admin-api.md` 4.22(`daily[].active_users` · `weekday[]` · `active_users_since`) |
| 요청 파트 | 백엔드 — 박준현 |
| 발행 날짜 | 2026-10-18 |
| 관련 | 브랜치 `feat(be)/insights-daily-active` · 마이그레이션 `1790800000000-AddDailyActiveUsers` · 파이프라인 웹 서비스 지표 탭 |

## 배경

서비스 지표 탭의 일별 추이에는 청취자(재생한 사람)만 있어서, "앱을 연 사람이 줄었다"와 "열었지만 안 들었다"를 가를 수 없었다. 요일별로 붐비는 날도 볼 수 없었다.

"접속자"는 그날 `sessions.issued_at`이 있는 사람으로 센다. 기존 `active_1d/7d/30d`와 같은 신호다. 액세스 토큰이 30분짜리라 앱을 열면 거의 매번 리프레시 회전으로 세션 행이 생긴다. 그런데 **세션 행은 만료·폐기 30일 뒤 hard delete된다**(12.1 · `SessionPurgeScheduler`). 그래서 지난날은 나중에 다시 셀 수 없다. `play_daily_totals`(6.3-1)와 같은 이유로 날이 끝나면 바로 세어 표에 쌓는다.

## 수정 내용

- **`domain.md` 3.3-1 `daily_active_users`(신설)**

  ```
  daily_active_users
    active_date   date          PK   KST 달력일(서비스 날짜 05:00 경계가 아니다 — 서비스 지표의 다른 일별 값과 같은 단위)
    market        varchar(10)   PK   사용자의 users.market (kr · global)
    active_users  int           NOT NULL DEFAULT 0   그날 sessions.issued_at 이 있는 사용자 수(distinct)
    created_at · updated_at
  ```

  - **쓰기는 일일 배치 하나다**(`DailyActiveUserScheduler`, 00:10 KST). 어제와 그제를 시장마다 다시 세어 upsert한다. 그제까지 세는 것은 자정을 걸친 늦은 쓰기와 배포·장애로 놓친 하루를 메우기 위해서다.
  - 이미 행이 있으면 **큰 값을 남긴다**(`GREATEST`). 몇 번 다시 세도 결과가 같다(멱등). 그 사이 탈퇴한 사람의 세션이 CASCADE로 지워져도 기록은 줄지 않는다.
  - 접속자가 없는 날·시장도 **0 행을 둔다.** 행이 없는 날은 "기록 없음"으로 읽는다.
  - 클러스터(워커 2개)에서는 `ScheduleModule`이 스케줄러 프로세스에만 올라가 한 번만 돈다. 겹쳐 돌아도 같은 행에 같은 값을 쓸 뿐이라 잠금은 두지 않는다.
  - **백필 — 첫 신뢰 날짜는 마이그레이션 실행일(KST) - 29일이다.** 파기 조건은 "만료·폐기 시각이 지금 - 30일보다 이른 행"이다. 그래서 지금 - 30일 이후에 발급된 세션은 모두 남아 있다. 그 시각이 걸친 날(실행일 - 30일)은 이미 일부가 지워져 넣지 않는다. 실행일 - 29일부터 어제까지 29일을 채운다. 이미 탈퇴한 사람의 세션은 지워져 백필 값에 없다(덜 세는 쪽).
  - 사용자를 가리키는 열이 없는 비식별 집계다. **탈퇴해도 지우지 않고 보존 기한도 없다.**
  - **규약 예외 두 가지를 적는다**(6.3-1과 같다). ① PK가 `id`가 아니라 자연키 `(active_date, market)`다(`convention.md` 1.5·4.2 예외). 날짜·시장당 한 행이고 upsert 대상이다. ② 1.5 "파생값을 테이블로 두지 않는다"의 예외다. 원천(세션)이 30일 뒤 사라지므로 이 표가 곧 원천이다.
- **2장 모듈 소유 표** — `auth`에 `daily_active_users`를 추가한다(`sessions`, `daily_active_users`). 원천이 `sessions`이고, 표가 필요한 이유도 이 모듈의 세션 파기다. 서비스 지표(admin)는 `play_daily_totals`처럼 **읽기만** 한다. 새 모듈 의존은 없다.
- **12.1 보존 표** — 행을 추가한다: `daily_active_users` | **영구 보존** | 날짜·시장·인원 수만 있는 비식별 집계다. 원천(`sessions`)이 30일 뒤 지워져 다시 만들 수 없다(2026-10-18).
- **12.3** — 두 표(결제 이력 있음·없음)의 "그대로 유지"에 `daily_active_users`(집계값)를 추가한다.
- **`admin-api.md` 4.22** — Response 예시와 설명에 아래 세 필드를 더한다.

  ```json
  {
    "daily": [
      { "date": "2026-09-18", "signups": 0, "withdrawals": 0, "plays": 9, "listeners": 7, "listen_sec": 2100, "completes": 1, "active_users": null },
      { "date": "2026-10-08", "signups": 28, "withdrawals": 1, "plays": 88, "listeners": 52, "listen_sec": 25100, "completes": 9, "active_users": 63 }
    ],
    "weekday": [
      { "weekday": 1, "label": "월", "days": 4, "active_days": 4, "avg_active_users": 12.25, "avg_listeners": 8 },
      { "weekday": 2, "label": "화", "days": 4, "active_days": 4, "avg_active_users": 11.75, "avg_listeners": 7 },
      { "weekday": 3, "label": "수", "days": 4, "active_days": 4, "avg_active_users": 13, "avg_listeners": 8.75 },
      { "weekday": 4, "label": "목", "days": 4, "active_days": 4, "avg_active_users": 12.25, "avg_listeners": 8 },
      { "weekday": 5, "label": "금", "days": 4, "active_days": 4, "avg_active_users": 8.5, "avg_listeners": 5.5 },
      { "weekday": 6, "label": "토", "days": 5, "active_days": 5, "avg_active_users": 8.4, "avg_listeners": 5.4 },
      { "weekday": 7, "label": "일", "days": 4, "active_days": 4, "avg_active_users": 9.5, "avg_listeners": 6 }
    ],
    "active_users_since": "2026-09-19"
  }
  ```

  - `daily[].active_users` — 그날(KST 달력일) 접속자, 즉 `sessions.issued_at`이 있는 사용자 수다. `active_1d`와 같은 신호를 하루 단위로 센다.
    - 지난날은 `daily_active_users`(시장 합)를 읽는다.
    - **오늘은 세션에서 바로 센다.** 아직 저장되지 않았고, 그래프는 지금 값이어야 한다.
    - 표에 없는 날도 최근 29일(오늘 - 29일 ~ 어제, 세션이 온전히 남은 범위) 안이면 바로 센다.
    - 그 밖은 원천이 없어 **`null`**이다. 0명과 구분한다.
    - 시장은 나누지 않는다. 한 사용자는 한 시장이라 시장 합이 전체 distinct와 같다.
    - 지난날 값은 탈퇴로 줄지 않는다. 오늘·바로 센 날은 현재 계정 기준이다.
  - `weekday[]` — 월(1)~일(7) **7칸 고정**이다. 창 안에 없는 요일도 0일 · `null`로 싣는다.
    - 창 안의 **온전한 KST 달력일만** 센다. 첫날(`since`가 걸친 날)은 청취가 그 시각 뒤만 잡혀 있고 오늘은 끝나지 않아 둘 다 뺀다. `since`가 KST 자정이면 첫날도 센다. 14일 창이면 13일이다.
    - `days`는 그 요일의 날 수다. `avg_listeners`는 `days`로 나눈 평균 청취자다.
    - `active_days`는 그중 `active_users`가 `null`이 아닌 날 수다. `avg_active_users`는 `active_days`로 나눈다.
    - 0일이면 평균은 `null`이다.
  - `active_users_since` — 접속자를 믿을 수 있는 첫 날(KST `YYYY-MM-DD`)이다. `min(daily_active_users.active_date)`와 "오늘 - 29일" 중 이른 쪽이다. 화면 각주가 "M월 D일부터 집계"로 쓴다.

## 범위 밖

- 시장별 일별 접속자(`by_market`에 일별 축 추가)는 하지 않았다. 표에는 시장별로 있어 나중에 붙일 수 있다.
- 30분 안의 재실행은 세션 행이 새로 생기지 않아 잡히지 않는다. `active_1d`와 같은 한계이고 바꾸지 않는다.
- 크론을 사흘 넘게 놓치면(서버가 그만큼 꺼져 있으면) 그 날은 오늘 - 29일 안에 있는 동안만 바로 세어 보인다. 그 뒤에는 `null`이다. 기동 시 따라잡는 실행은 넣지 않았다.

## 완료 조건

- Given `domain.md` / When 3.3-1을 읽는다 / Then 위 표·쓰기 규칙(00:10 KST, 어제·그제, `GREATEST`)·백필 경계(실행일 - 29일)·탈퇴 보존이 코드(`DailyActiveUser` 엔티티·`DailyActiveUserRepository.recount`·`DailyActiveUserScheduler`·마이그레이션 `1790800000000`)와 같다
- Given `domain.md` 2장 / When `auth`의 소유 Entity를 읽는다 / Then `daily_active_users`가 있다
- Given `domain.md` 12.1·12.3 / When 보존 표와 "그대로 유지"를 읽는다 / Then `daily_active_users`가 영구 보존·탈퇴 시 유지로 적혀 있다
- Given `admin-api.md` 4.22 / When Response와 설명을 읽는다 / Then `daily[].active_users`(null 규칙 포함)·`weekday[]`(7칸, 온전한 날만, `days`·`active_days` 분모)·`active_users_since`가 위 JSON과 같다

## 처리 기록

- 2026-10-18 발행. 로컬 검증 결과:
  - 마이그레이션 run → 58행(2026-09-19 ~ 10-17 × 2시장). 같은 기간 `sessions` 직접 집계와 날짜·시장별로 일치했다. revert(표 삭제 확인) → run 재적용.
  - `GET /admin/insights/summary?days=30` 실측 — `active_users_since = 2026-09-19`, 09-18은 `null`, 오늘은 바로 센 값, `weekday` 7칸.
  - E2E: 같은 날 두 번 다시 세기 → 같은 값. 원천 세션을 지운 뒤 다시 세기 → 줄지 않음.
