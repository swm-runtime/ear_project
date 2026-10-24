# 무손실 음질의 기기 조건 — iOS 1.3.0 미만에는 무손실을 주지 않는다(KAN-256)

| 항목 | 값 |
|---|---|
| 대상 문서 | `features/player.md` 4.9 · `spec/api/player-api.md` 4.1(요청 `device_id` 행 · 처리 순서 · `fallback_reason`) · `backend/domain.md` 6.5(`device_id`는 판정 입력이 아니다 문장) |
| 요청 파트 | 백엔드 — 박준현 |
| 발행 날짜 | 2026-10-23 |
| 시작 날짜 | 2026-10-23 |
| 기한 | 다음 통합 |
| 선행 | 없음 · 관련 FE [KAN-256](https://runtime364.atlassian.net/browse/KAN-256)(iOS 정확한 시각 옵션 — 1.3.0 빌드) |
| 중요도 | Low — 코드는 `fix(be)/ios-lossless-cap`에 반영됨. 문서가 코드를 따라간다 |

## 배경

2026-10-23 iOS 1.2.1 · Pro · 무손실에서 재생 위치·길이가 어긋났다(대본 강조 어긋남·중간에 끝남). 압축은 정상, Android 무손실도 정상. 원인은 iOS AVPlayer 가 스트리밍 FLAC 시각을 평균 비트레이트로 어림하는 것 — 앱이 1.3.0 빌드부터 정확한 시각 옵션으로 연다(KAN-256). 이미 깔린 옛 iOS 앱은 고칠 수 없어 **서버가 그 기기에는 무손실을 주지 않는다.**

## 고칠 내용

1. `features/player.md` 4.9 — 목록 끝에 추가:
   > - **무손실은 기기 조건도 본다**(2026-10-23, KAN-256). iOS 앱 1.3.0 미만(재생 시각 옵션이 없는 빌드)에는 무손실을 주지 않고 압축으로 낸다 — 콘텐츠가 무손실을 갖지 않은 것과 같게 판정하므로 `fallback_reason`은 `not_available`이고 구독 안내를 띄우지 않는다. 기기 정보는 `device_tokens`(플랫폼·앱 버전)에서 오며, 기기 행이 없거나 버전 형식이 깨졌으면 주지 않는다. Android 는 조건 없음.
2. `spec/api/player-api.md` 4.1 — `device_id` 행: "기록용" → "기록용 + **무손실 기기 조건 판정**(`device_tokens`의 플랫폼·앱 버전 — `player.md` 4.9)". 응답 `available_qualities`는 그 기기가 받을 수 있는 음질만이다(옛 iOS 앱은 무손실이 빠진다).
3. `backend/domain.md` 6.5 — "이 값으로 허용 여부가 갈리지 않는다"는 그대로 맞다(재생 허용은 갈리지 않는다). 뒤에 "**음질은 갈린다** — 무손실 기기 조건(`player.md` 4.9, 2026-10-23)" 한 줄.

## 완료 조건

- Given 위 세 문서 / Then 무손실 기기 조건(iOS 1.3.0 미만 제외 · `not_available` · 기기 행 없음 = 제외)이 적혀 있고 코드 `canPlayLossless`·`IOS_LOSSLESS_MIN_APP_VERSION`과 같다

## 처리 기록

- 2026-10-23 발행(박준현).
- 2026-10-24 **반영**(박준현, `docs(be)/apply-lossless-changes`) — 고칠 내용 전부를 대상 문서에 그대로 넣었다. 반영 날짜 2026-10-24.
