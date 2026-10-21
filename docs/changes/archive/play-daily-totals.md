# 누적 재생 수·청취 시간·완청 수 — 탈퇴로 줄지 않는 집계 표 `play_daily_totals` (BE)

| 항목 | 값 |
|---|---|
| 대상 문서 | `backend/domain.md` 6.3(신설 6.3-1 `play_daily_totals`) · 2장 모듈 소유 표(`playback`) · 12.1 `play_records` 행 · 12.3 "그대로 유지" 목록 · `spec/api/admin-api.md` 4.22 `listening.all_time` |
| 요청 파트 | 백엔드 — 박준현 |
| 발행 날짜 | 2026-10-17 |
| 반영 날짜 | 2026-10-17 |
| 관련 | 브랜치 `fix(be)/cumulative-play-totals` · 마이그레이션 `1790500000000-AddPlayDailyTotals` |

## 배경

2026-10-16 운영 서비스 지표의 누적 청취 시간이 100시간에서 96시간으로 줄었다. 지표가 `play_records`를 바로 더하는데, 탈퇴는 사용자 행과 함께 재생 기록을 지운다(12.3 즉시 파기). 그래서 탈퇴가 생기면 "지금까지의 누적"이 줄었다. 사용자 결정(2026-10-17): **누적 청취 시간·재생 수는 탈퇴해도 줄지 않게 한다.** 탈퇴자 몫을 따로 모으지 않고 하나의 누적에 다 더한다.

콘텐츠 삭제는 원인이 아니다. `contents`는 회수해도 행을 지우지 않는다(12.1 soft — `status = withdrawn`). 재생 기록도 그대로 남는다.

## 수정 내용

- **`domain.md` 6.3-1 `play_daily_totals`(신설)**

  ```
  play_daily_totals
    play_date     date      PK   서비스 날짜(05:00 경계 — 재생 행의 play_date와 같다)
    play_count    int       DEFAULT 0   그날 새로 생긴 play_records 행 수
    listen_sec    bigint    DEFAULT 0   그날 재생 행의 listened_sec에 더한 값의 합
    complete_count int      DEFAULT 0   그날 남은 완청 신호(user_signals.action = complete) 수
    created_at · updated_at
  ```

  - 재생 기록을 쓸 때 **같은 트랜잭션에서 함께 더한다.** 재생 시작에 행이 새로 생기면 `play_count + 1`. 위치 저장이 `listened_sec`에 더하면 그 재생 행의 `play_date`에 `listen_sec + delta`. 완청 신호를 남기면 그 서비스 날짜에 `complete_count + 1`(완청 신호는 탈퇴에 더해 **180일 보존 배치**로도 지워져, 원천 합계는 서비스 180일째부터 매일 줄었을 것이다).
  - 더하기만 하고 빼지 않는다. 동시 갱신이 겹치므로 DB에서 더한다(`INSERT … ON CONFLICT DO UPDATE SET x = x + EXCLUDED.x`).
  - 사용자·콘텐츠를 가리키는 열이 없는 비식별 집계다. **탈퇴해도 지우지 않는다.**
  - 도입 시점에 남아 있던 `play_records`로 채웠다. 이미 탈퇴한 사람의 몫은 기록이 지워져 되살리지 못한다.
  - **규약 예외 두 가지를 적는다.** ① PK가 `id`가 아니라 자연키 `play_date`다(`convention.md` 1.5·4.2 예외) — 날짜당 한 행이고 upsert 대상이다. ② 1.5 "파생값을 테이블로 두지 않는다"의 예외다 — 탈퇴 뒤에는 원천에서 다시 계산할 수 없어 이 표가 곧 원천이다.
  - 추천 테스트 초기화(`recommend-test` reset)·부하 테스트 정리(`load-test/server/cleanup-users.js`)가 재생 기록을 지워도 누적은 줄지 않는다. 운영에서 부하 테스트를 돌리면 누적이 부풀므로, 돌린다면 그 몫을 빼는 절차를 runbook에 둔다.
  - 배포 순간(새 컨테이너 마이그레이션 백필 ~ 옛 컨테이너 종료) 사이에 옛 컨테이너가 받은 재생은 누적에서 빠질 수 있다(덜 세는 쪽). 배포 직후 `play_records` 합계와 한 번 대조한다.
- **2장 모듈 소유 표** — `playback`에 `play_daily_totals`를 추가한다.
- **12.1 `play_records` 행** — "비식별 누적 집계로 옮긴 뒤 정한다"에 "서비스 전체 누적은 `play_daily_totals`로 옮겼다(2026-10-17). 프로필의 사용자별 전 기간 합계는 아직 `play_records`를 읽는다"를 덧붙인다.
- **12.3** — 두 표(결제 이력 있음·없음)의 "그대로 유지"에 `play_daily_totals`(집계값)를 추가한다.
- **`admin-api.md` 4.22** — `listening.all_time.listen_sec`·`plays`·`completes`는 `play_daily_totals` 합계이며 **탈퇴·보존 삭제로 줄지 않는다.** `all_time.listeners`·`saves`와 `window.*`는 종전대로 원천 기준이다(현재 계정, 탈퇴하면 빠진다).

## 범위 밖

- 담기 수·청취자 수·일별 추이·콘텐츠 순위의 감소 문제는 이번에 고치지 않았다. 점검 결과는 사용자에게 보고했고 결정을 기다린다.
- 프로필 통계(사용자 본인의 누적)는 바꾸지 않는다.

## 완료 조건

- Given `domain.md` / When 6.3-1을 읽는다 / Then 위 표·쓰기 규칙·탈퇴 보존이 코드(`PlayDailyTotal` 엔티티·`PlaybackService.recordPlay`·`addListenedSec`)와 같다
- Given `domain.md` 12.3 / When "그대로 유지"를 읽는다 / Then `play_daily_totals`가 있다
- Given `admin-api.md` 4.22 / When `all_time`을 읽는다 / Then 재생 수·청취 시간이 줄지 않는 누적이라고 적혀 있다

## 처리 기록

- 2026-10-17 발행. 로컬 검증: 재생 → 같은 날 재재생(늘지 않음) → 위치 저장 120초 → 탈퇴 뒤 재생 기록 0, 누적은 그대로(재생 1·120초). 백필 결과가 원천과 일치(701회·360,119초·완청 175건).
- 2026-10-17 반영 — `backend/domain.md` 6.3-1 `play_daily_totals`(신설 — 표·쓰기 규칙·탈퇴 보존·규약 예외 둘·백필·운영 주의) · 2장 모듈 소유 표(`playback`) · 12.1 `play_records` 행 · 12.3 두 표의 "그대로 유지" · `spec/api/admin-api.md` 4.22(`listening.all_time` 누적 규칙). 반영 전 코드(`PlayDailyTotal` 엔티티·마이그레이션 `1790500000000`·`PlaybackService.recordPlay`·`addListenedSec`·`recordSignal`·`AdminInsightsRepository.listeningTotals`)와 대조함 — 일치(컬럼은 코드상 NOT NULL DEFAULT 0, 백필은 완청 신호까지 05:00 KST 경계로 채움). `domain.md` 부록의 도메인별 테이블 수 표("라이브러리·재생 6")는 이미 `drip_feedbacks` 등이 빠진 채라 이번 범위에서 손대지 않음.
