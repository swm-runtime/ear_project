# [FE] 재생 중 4분마다 끊김 — 서명 URL 갱신을 네이티브 요청 단계에서 바꿔치기(음원 교체 제거)

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/features/player/services/playback.service.ts`(`scheduleUrlRefresh` · `refreshAudioUrl`) · expo-audio 네이티브(iOS `AudioUtils.createAVPlayerItem` · Android `AudioModule.kt` 데이터소스 팩토리) — 패치(`patches/`) 또는 로컬 모듈(`modules/`) · `docs/frontend/architecture.md` |
| 요청 파트 | 프론트엔드 |
| 요청자 | 이주호(PM) |
| 담당 | 이주호 |
| Jira | [KAN-124](https://runtime364.atlassian.net/browse/KAN-124) |
| 발행 날짜 | 2026-10-05 |
| 시작 날짜 | 2026-10-05 |
| 기한 | 2026-10-08 (Medium — 3일 안) |
| 선행 | 없음(티켓). **스토어 빌드**(사람 손 — PM "빌드 ㄱ" 후 EAS 빌드·심사. 상태: 미착수) |
| 근거 문서 | `spec/api/player-api.md`(오디오 URL 발급·만료) · `spec/uiux/player-uiux.md` 4.9(URL 갱신 시 화면 변화 없음) · `frontend/architecture.md`(재생 서비스) · `infra/architecture.md`(CloudFront 서명 URL) |
| 중요도 | Medium — 재생 중 모든 사용자에게 4분 주기로 들리는 끊김이다. 네이티브 변경이라 OTA로 못 나가고 스토어 빌드에 실려야 하므로 마감을 빌드 일정에 맞춘다 |
| 상태 | 대기 |

## 무엇이 문제인가

재생 중 약 **4분마다**(4:00 · 8:00 · 12:00 …) 소리가 끊기거나 파일 앞부분(인트로 징글)이 순간 튄다. PM 실기기 청취로 4분 주기 반복을 확인했다(2026-10-05).

## 원인

- 서명 URL 수명이 300초다(`backend/src/modules/playback/playback.constant.ts` `AUDIO_URL_TTL_SEC`). 앱은 만료 60초 전(=4분)에 새 URL을 받는다(`player.constants.ts` 갱신 리드, `playback.service.ts` `scheduleUrlRefresh`).
- 새 URL을 받으면 `player.replace({ uri })` → `seekTo(위치)` → `play()`로 **음원을 통째로 갈아 끼운다**(`playback.service.ts` `refreshAudioUrl`).
  - 받아 둔 버퍼가 버려져 재버퍼링 공백이 생긴다.
  - iOS: 새 `AVPlayerItem`이 준비되면 **0초부터** 재생을 시작하고, JS의 탐색이 그 뒤에 도착한다(expo-audio `AudioPlayer.swift` replace).
  - Android: 미디어 소스 교체가 위치를 0으로 돌리고 곧바로 `play()` 한 뒤 탐색이 도착한다(expo-audio `AudioModule.kt` · `AudioPlayer.kt`).
  - 그래서 파일 맨 앞(2026-10-01부터 인트로 징글)이 순간 새어 나온다.
  - iOS는 교체된 아이템에 배속 알고리즘이 다시 지정되지 않아, 배속 청취 중이면 교체 후 소리 결이 바뀐다.

## 결정 — 3안: 네이티브 요청 단계에서 URL 바꿔치기

**4분 주기 갱신은 유지한다**(서명 URL 짧은 수명 · 재생 한도 판정 구조 그대로). 대신 **플레이어의 음원은 재생 내내 바꾸지 않는다.** 플레이어에는 고정 주소를 주고, 네이티브가 바이트 요청(Range)을 낼 때마다 **그 순간의 최신 서명 URL**로 바꿔 보낸다.

- **iOS**: `AVURLAsset`에 커스텀 스킴 주소(예: `ear-audio://<contentId>`)를 주고 `AVAssetResourceLoaderDelegate`가 각 로딩 요청을 최신 서명 URL의 HTTP Range 요청으로 채운다(콘텐츠 정보 요청 — 길이·`audio/mpeg`·바이트 범위 지원 — 포함).
- **Android**: media3 `ResolvingDataSource`(`DataSource` 팩토리를 감싸 `resolveDataSpec`에서 URI를 최신 서명 URL로 바꾼다)를 expo-audio의 프로그레시브 미디어 소스 팩토리에 끼운다.
- **JS**: 갱신 루프는 `replace`를 부르지 않고 **네이티브에 새 URL만 넘긴다**(콘텐츠 id ↔ 현재 URL 표). 재발행(`contentVersion` 변경 — 오디오 자체가 바뀜)일 때만 기존처럼 교체한다.
- 구현 방식(expo-audio 패치 vs 로컬 Expo 모듈)은 담당이 정한다. expo-audio 업그레이드 때 깨지지 않게 하는 쪽을 고르고, 근거를 처리 기록에 남긴다.

### 검토했으나 고르지 않은 안

| 안 | 내용 | 고르지 않은 이유 |
|---|---|---|
| 1. 쉼에서 플레이어 갈아타기 | 두 번째 플레이어를 다음 화자 교대(쉼, 실측 −70~−86 dB) 위치로 미리 버퍼링해 두고 그 순간 넘긴다. OTA 가능 | 잠금 화면 컨트롤·위치 저장이 플레이어 인스턴스에 묶여 넘기기 복잡, 자막 데이터 없는 콘텐츠는 쉼을 모른다 |
| 2. 버퍼 크게 + 실패 시에만 교체 | 4분마다 URL은 받아 두되 교체는 재생이 막혔을 때만. OTA 가능 | Android는 expo-audio로 버퍼 크기를 못 바꿔(약 50초) 만료 후 한 번은 막힌다 — 근본 해결 아님 |
| (백엔드) URL 수명 연장 | `AUDIO_URL_TTL_SEC`를 에피소드 길이+여유로 | PM 결정: 4분 주기 갱신은 유지한다 |

## 주의

- **네이티브 변경 — OTA 불가, 스토어 빌드 필요.** `runtimeVersion` 정책(메모: 주체마다 fingerprint 다름 — 현재 고정값)에 따라 새 빌드에서 값을 올린다. **EAS 빌드는 PM "빌드 ㄱ" 후에만** 돌린다.
- 잠금 화면 재생(`setActiveForLockScreen`)·백그라운드·배속(iOS 알고리즘 — 이번에 교체가 사라지면 최초 지정값이 유지된다)·탐색·버퍼링 표시가 그대로 동작해야 한다.
- 키체인 수정(KAN-123)으로 잠금 화면에서도 토큰 갱신이 되므로, 잠금 상태에서 30분 넘게 들어도 URL 공급이 끊기지 않는다 — 함께 검증한다.
- URL 공급이 실패하면(네트워크·401 등) 네이티브 요청은 마지막 URL로 시도하고, 403이면 재생 오류로 올려 기존 오류 처리(`common-error-handling.md`)를 따른다.

## 완료 조건

- Given 새 빌드의 iOS·Android 실기기 / When 일시정지 없이 13분 이상 재생한다 / Then 4:00 · 8:00 · 12:00 근처에서 끊김·버퍼링 표시·인트로 튐이 없다
- Given 같은 조건에서 배속 1.5× / When 4분 경계를 지난다 / Then 소리 결(배속 알고리즘)이 바뀌지 않는다
- Given 잠금 화면 재생 / When 35분 이상 듣는다 / Then 끊김 없이 이어지고 잠금 화면 컨트롤이 유지된다
- Given 재생 중 재발행(`contentVersion` 변경) / When URL을 갱신한다 / Then 기존처럼 음원을 교체하고 위치를 0으로 둔다(`player-api.md` 4.3)
- Given 갱신 직후 / When 네트워크 로그(또는 CloudFront 로그)를 본다 / Then 이후 Range 요청이 새 서명 URL로 나간다
- Given `frontend/architecture.md` / When 재생 서비스 절을 읽는다 / Then URL 갱신이 음원 교체 없이 네이티브 요청 단계에서 반영된다고 적혀 있다
