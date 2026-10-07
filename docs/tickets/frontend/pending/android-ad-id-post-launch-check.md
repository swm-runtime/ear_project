# [FE] Android 광고 ID 설치 이벤트 공개 후 확인 (11/1 이후) — KAN-118 후속

| 항목 | 값 |
|---|---|
| 대상 | Play Console 운영 출시 기록 · 메타 이벤트 관리자 테스트 이벤트 — 코드 수정 없음 |
| 요청 파트 | 프론트엔드 |
| 요청자 | 이주호(PM) |
| 담당 | 이주호 |
| Jira | [KAN-156](https://runtime364.atlassian.net/browse/KAN-156) |
| 발행 날짜 | 2026-10-07 |
| 시작 날짜 | 2026-10-07 |
| 기한 | 없음 (Lowest — 11/1 공개 이후에만 확인할 수 있다) |
| 선행 | 티켓 선행 없음. 사람 손: 운영 rt 32 묶음 빌드 → Play 업로드 → 2026-11-01 이후 공개(상태: 미착수) |
| 근거 | `tickets/frontend/archive/android-meta-ad-id-install-event.md`(KAN-118) 완료 조건 3·4 |
| 중요도 | Lowest |

## 요청

KAN-118 은 코드·빌드 산출물 확인까지 끝나 닫았다(PM 2026-10-07 23:11). 공개 이후에만 볼 수 있는 두 조건을 여기서 닫는다.

## 완료 조건

- Given Play Console / When rt 32 운영 빌드의 프로덕션 출시 기록을 본다 / Then 공개일이 2026-11-01 이후다
- Given 11/1 이후 공개된 Android 빌드를 새로 설치하고 기기 광고 ID 를 이벤트 관리자 테스트 이벤트에 등록한다 / When 앱을 처음 연다 / Then 테스트 이벤트에 첫 실행 이벤트(`fb_mobile_activate_app` 또는 `fb_mobile_first_app_launch`)가 보인다

## 처리 기록
