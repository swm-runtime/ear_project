# [FE] iOS 무손실(FLAC) 재생 위치·길이 어긋남 — 정확한 시각 옵션(AVURLAssetPreferPreciseDurationAndTimingKey)

| 항목 | 값 |
|---|---|
| 대상 | `frontend/patches/expo-audio+57.0.3.patch`(iOS `AudioUtils.swift` 의 `AVURLAsset` 생성 옵션) · `frontend/src/features/player/services/playback.service.ts`(음질을 네이티브에 넘기는 경로) · `app.json` runtimeVersion |
| 요청 파트 | 백엔드 |
| 요청자 | 박준현 |
| 담당 | 이주호 |
| Jira | [KAN-256](https://runtime364.atlassian.net/browse/KAN-256) |
| 발행 날짜 | 2026-10-23 |
| 시작 날짜 | 2026-10-23 |
| 기한 | 2026-10-24 (Medium 환산 +3일은 10-26이나 **1.3.0 스토어 빌드에 함께 싣는다**(박준현 2026-10-23 — 1.3.0 아직 심사 전) — 빌드·심사 제출 마일스톤(KAN-198, 10-24)에 맞춘다. 지금 Pro 구독자는 없다) |
| 선행 | 없음 · 관련 [KAN-198](https://runtime364.atlassian.net/browse/KAN-198)(1.3.0 빌드·심사 — 이 변경을 같은 빌드에 싣는다) |
| 관련 | BE(박준현) — 고친 빌드보다 낮은 iOS 앱에는 서버가 무손실 대신 AAC를 준다(아래 "BE 쪽"). FE가 고친 빌드의 앱 버전을 알려 주면 그 값을 서버 설정에 넣는다 |
| 근거 문서 | `features/player.md` 4.9(음질) · `features/settings.md` 4.6 · Apple 개발자 포럼 [thread/665417](https://developer.apple.com/forums/thread/665417) |
| 중요도 | Medium |
| 상태 | 발행 |

## 왜

2026-10-23 팀원(iOS, 앱 1.2.1, Pro·무손실)이 "수학의 답을 증명하는 일과…"(959초)를 듣다가 **중간에 끝나고 대본이 안 맞는다**고 보고했다. 같은 iOS에서 **압축으로 바꾸면 정상**, 다시 무손실로 바꾸고 이어 들으면 **같은 시각인데 내용 위치가 다르다.** Android 무손실(박준현)은 정상이다.

서버 데이터는 맞다 — 압축 m4a·무손실 FLAC 둘 다 959초, 대본 끝 953초, 재발행 없음(1판).

원인은 iOS AVPlayer 의 **스트리밍 FLAC 시각 계산**이다. AVPlayer 는 FLAC 을 내려받으며 재생할 때 시각↔바이트를 평균 비트레이트로 어림한다. 대화 음성은 무음이 많아 FLAC 비트레이트가 크게 출렁이고, 어림이 빗나가 **재생 위치(대본 강조)와 길이(끝 판정)가 틀린다.** 같은 증상과 해결이 Apple 포럼에 있다: `AVURLAssetPreferPreciseDurationAndTimingKey = true` 로 자산을 열면 고쳐지고, 대가로 로딩이 느려진다(특히 나쁜 망).

## 무엇을 한다

1. **iOS 네이티브** — `AVURLAsset(url:options:)` 의 `options` 에 `AVURLAssetPreferPreciseDurationAndTimingKey: true` 를 넣는다. **FLAC(무손실)일 때만** 켠다 — 압축(m4a)은 이미 정확하고 로딩 지연만 생긴다. 고정 스트림 주소(`ear-audio://`)에는 확장자가 없으니 음질/코덱을 네이티브에 넘길 방법을 정한다(예: `source` 에 플래그 추가 · 스트림 키에 코덱 표시). 재생 URL 응답의 `audio.quality` 가 `lossless` 이면 FLAC 이다.
2. **runtimeVersion 올림** — 네이티브 변경이라 OTA 로 옛 빌드에 못 간다. `app.json` 노트에 이력.
3. **측정** — 무손실 콘텐츠(위 959초 편 등)를 iOS 실기기 **셀룰러**에서 탭→소리 시간을 압축과 비교해 처리 기록에 적는다(목표 "탭 후 2초" — `player.md`). 많이 느리면 BE·AI 와 같이 본다(FLAC SEEKTABLE 을 촘촘히 넣어 재인코딩하면 줄어드는지 — 파이프라인 몫).
4. **Android** — 바꾸지 않는다(ExoPlayer FLAC 은 정상).
5. **1.3.0 빌드에 싣는다.** 못 실으면 BE 에 알려 준다 — 서버 기준 버전이 그 빌드 버전으로 바뀐다(아래).

## BE 쪽 (참고 — 이 티켓 범위 밖)

이미 깔린 iOS 앱(1.2.1 등)은 1번을 받지 못한다. 서버가 재생 URL 발급(`player-api.md` 4.1) 때 `device_tokens`(user_id·device_id → platform·app_version)로 **iOS 이고 1.3.0 미만이면 무손실 요청을 AAC로 낮춘다**(기준 버전은 설정값 — 1.3.0 빌드에 실리지 못하면 그 빌드 버전으로 바꾼다). 1.3.0 공개 뒤 최소 지원 버전이 1.3.0으로 오르면(KAN-198) 1.2.x 는 강제 업데이트라 이 낮춤은 그 사이 기간만 쓰인다. Android 는 그대로 무손실.

## 범위 밖

- 무손실 형식 교체(ALAC·FLAC-in-MP4) — FLAC-in-MP4 는 iOS 지원 근거가 없고, ALAC 는 Android 지원이 칩셋마다 달라 두 벌이 된다. 1번이 안 되면 그때 다시 본다
- 서버 음질 판정 변경(BE)

## 완료 조건

- Given iOS 고친 빌드, Pro·무손실 / When 959초 편을 처음부터 끝까지 재생 / Then 959초 근처에서 끝나고, 대본 강조가 들리는 문장과 맞는다
- Given 같은 편 무손실 재생 중 / When 음질을 압축으로 바꿨다가 다시 무손실로 바꾸고 같은 시각에서 이어 든다 / Then 같은 문장이 들린다
- Given iOS 고친 빌드 / When 무손실 편 구간 제목 탭(시크) / Then 그 구간 시작 문장이 들린다
- Given iOS 압축 음질 / Then 로딩 시간이 종전과 같다(옵션이 켜지지 않는다)
- Given Android / Then 변화 없음
- Given 처리 기록 / Then iOS 셀룰러 무손실·압축 탭→소리 시간이 적혀 있고, 1.3.0 빌드(runtimeVersion)에 실렸다

## 처리 기록

- 2026-10-23 발행(박준현 — 마크다운 + Jira KAN-256, 담당 이주호). 진단: 팀원 iOS 1.2.1 무손실 재현·압축 정상·Android 무손실 정상, 서버 데이터(개발계 사본) 정상.
- 2026-10-23 **1.3.0 빌드에 함께 싣기로**(박준현 — 1.3.0 아직 심사 전). 기한을 빌드·심사 마일스톤 10-24로, BE 기준 버전 1.3.0.
- 2026-10-24 **코드 반영**(이 PR) — `patches/expo-audio+57.0.3.patch` iOS `AudioUtils.createAVPlayerItem` 이 `EarAudioStream.prefersPreciseTiming` 으로 판정해 `AVURLAssetPreferPreciseDurationAndTimingKey: true` 를 넣는다. 음질을 네이티브에 넘기는 방법(1번)은 **JS 를 바꾸지 않는 쪽**으로 골랐다 — 고정 스트림 주소(`ear-audio://`)는 JS 가 플레이어를 만들기 전에 표에 넣는 서명 URL 의 확장자(`.flac`)로 본다. 그래서 **runtimeVersion 은 36 그대로**다(2번과 다름 — 올리면 rt 36 기기에 OTA 가 끊기는데, JS 가 같아 올릴 이유가 없다. app.json 노트에 이력). Android 무변경. **남은 것**: iOS 1.3.0 새 빌드·심사 제출(KAN-198), 실기기 완료 조건 확인, 셀룰러 탭→소리 측정(3번) — 그때까지 pending 에 둔다.
- 2026-10-24 03:52 **실기기 확인 통과 · archive 로 옮김(반영 날짜 2026-10-24)** — PM: 개발계 iOS 1.3.0 (48)(EAS `fda8331d`, 같은 패치)에서 무손실 재생 위치·길이 어긋남 해결 확인. 운영 1.3.0 (20)(EAS `9a5f1077`)에 같은 패치가 실려 ASC 업로드됨 — 심사 제출 빌드 (20) 지정은 KAN-198. **셀룰러 탭→소리 시간 측정(무엇을 한다 3번)은 기록하지 못했다** — PM 이 해결로 판정해 닫는다. 로딩이 느리다는 보고가 오면 그때 측정하고 BE·AI 와 SEEKTABLE 재인코딩을 본다.
