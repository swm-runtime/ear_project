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
| 상태 | 코드 반영 — 묶음 빌드 대기 |

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

## 처리 기록

### 2026-10-06 — 코드 반영, 묶음 빌드 대기 (PR #1145)

- **방식: expo-audio 패치(`frontend/patches/expo-audio+57.0.3.patch`)를 골랐다 — 로컬 모듈이 아니다.**
  - 리소스 로더(iOS)·`ResolvingDataSource`(Android)는 expo-audio 가 **안에서 만드는** `AVURLAsset`·데이터 소스 팩토리에 붙어야 한다. 어느 쪽을 골라도 expo-audio 안에 갈고리가 필요하다. 로컬 모듈로 빼면 갈고리에 더해 expo-audio → 로컬 모듈의 빌드 의존(podspec·gradle)까지 패치해야 해서 업그레이드 때 손볼 곳이 오히려 는다.
  - 플레이어는 그대로 expo-audio 다 — 잠금 화면(`setActiveForLockScreen`)·백그라운드·배속·상태 이벤트를 건드리지 않는다.
  - 업그레이드 부담을 줄이려고 **기존 파일의 변경은 갈고리 몇 줄**(iOS `AudioUtils.createAVPlayerItem` 1줄 · `AudioModule.swift` 함수 2개 · Android `AudioModule.kt` `createMediaItem` 1갈래 + 함수 2개)로 두고 로직은 **새 파일**(`ios/EarAudioStream.swift` · `android/.../EarAudioStream.kt`)에 넣었다. expo-audio 를 올리면 `patch-package`가 설치 단계에서 실패해 바로 드러난다.
- **Android 함정 — 미리 컴파일된 AAR**: SDK 57 의 expo-audio 는 `local-maven-repo`의 AAR 로 링크돼 **소스 패치가 빌드에 안 실린다**(로컬 gradle 에 `:expo-audio` 프로젝트가 아예 없었다). `frontend/package.json`에 `expo.autolinking.buildFromSource: ["expo-audio"]`를 넣어 소스 빌드를 강제했다. 이게 빠지면 겉보기엔 안 깨지고(JS 가 폴백) 끊김만 그대로 남는다.
- **동작**
  - 플레이어에는 `ear-audio://<콘텐츠 id>-<일련번호>` 고정 주소를 주고, 서명 URL 은 네이티브 표(`ExpoAudio.setStreamUrl`/`clearStreamUrl`)에만 넣는다(`services/audio-stream.ts`).
  - 4분 주기 갱신(`AUDIO_URL_REFRESH_LEAD_SEC` 그대로)은 **표만 바꾼다** — `replace`·`seekTo`·`play` 없음.
  - `replace`는 재발행(`contentVersion` 변경 — 위치 0, 새 고정 주소, 옛 주소 표에서 삭제)·옛 빌드 폴백·재생 오류 복구에서만. 교체 때 배속을 다시 건다(iOS 배속 알고리즘).
  - iOS 로더: 콘텐츠 정보(길이는 `Content-Range` 전체 길이, 형식은 응답 MIME → 없거나 octet-stream 이면 URL 확장자 → 기본 mp3 UTI, 바이트 범위 지원) + 데이터 요청을 Range 로 받아 흘려 준다(공용 URLSession, 취소 처리, Range 를 무시한 200 대응). 403 은 2초 간격 최대 10회 표의 최신 URL 로 재시도 뒤 오류, 일시적 네트워크 오류·5xx 는 받은 데까지부터 이어 받기(최대 30회).
  - Android: 바이트 요청을 열 때마다(최초·탐색·오류 재시도) `resolveDataSpec`이 최신 URL 로 바꾼다. 403 은 ExoPlayer 기본 재시도(매번 다시 resolve) 뒤 오류.
  - **재생 오류(403 등)** — 서비스가 상태 이벤트의 `error`를 받아 준비 전이면 PL8, 재생 중이면 일시정지 + "재생할 수 없어요" 배너 + [다시 시도](uiux 4.9). [다시 시도]·▶가 새 URL 로 음원을 다시 세운다. 자동 재개하지 않는다. 종전에는 JS 가 `error`를 보지 않아 오류 난 플레이어가 멈춘 채 남았다 — 이 부분은 옛 빌드에도 OTA 로 적용된다.
- **runtime 31 빌드(패치 없음) 폴백**: JS 가 `ExpoAudio.setStreamUrl` **함수 유무로 판별**한다. 없으면 서명 URL 을 직접 주고 갱신 때 종전대로 `replace` 한다 — 옛 빌드의 갱신 동작은 바뀌지 않는다(끊김도 그대로, 묶음 빌드부터 사라진다). `runtimeVersion`은 31 유지, 32 는 KAN-118·KAN-120·KAN-103 과 함께 싣는 묶음 빌드에서 올린다(`_runtimeVersionNote` 기록). EAS 빌드는 돌리지 않았다.
- **컴파일 확인(Windows 로컬, EAS 아님)**
  - Android: **컴파일됨.** 깨끗한 복사본에서 `npm ci`(패치 적용 ✔) → `npx expo prebuild --platform android --no-install --clean` → `./gradlew :expo-audio:compileDebugKotlin` **BUILD SUCCESSFUL**(경고는 expo-audio 원래 코드의 deprecated 1건뿐). 저장소 경로의 한글 때문에 Gradle 이 못 돌아 ASCII 경로 복사본에서 했다. 생성된 `android/`는 지웠다.
  - iOS: **컴파일 안 됨(Windows 라 불가).** Swift 5 모드·iOS 16.4 기준으로 썼고, SDK 마다 시그니처가 다른 URLSession 응답 위임(`completionHandler`)은 쓰지 않았다. 묶음 빌드가 첫 컴파일이다 — 실패하면 그 빌드에서 고친다.
- **검사**: `npx tsc --noEmit` · `npx eslint src` · `npx jest`(44 suites / 275 tests) 통과. 새 테스트 `playback.service.test.ts` 6건 — 네이티브가 있으면 주기 갱신에 `replace` 없음 + 새 URL 을 네이티브로 / 없으면(옛 빌드·모듈 없음) `replace` 폴백 / 재발행은 교체 + 위치 0 / 재생 오류 → 배너 → [다시 시도] 복구.
- **남은 완료 조건(묶음 빌드 필요)** — 그래서 `pending/`에 둔다:
  - 완료 조건 1·2·3: iOS·Android 실기기 13분 이상 연속 재생(4·8·12분 끊김·버퍼링·인트로 튐 없음), 1.5× 로 4분 경계 통과(소리 결 유지), 잠금 화면 35분(KAN-123 토큰 갱신과 함께).
  - 완료 조건 4: 재생 중 재발행 → 교체 + 위치 0.
  - 완료 조건 5: 갱신 뒤 Range 요청이 새 서명 URL 로 나가는지 — CloudFront 로그로 본다.
  - 완료 조건 6(문서)은 이 PR 에서 충족(`frontend/architecture.md` 5.1 "서명 URL 갱신 — 고정 스트림 주소").
  - 실기기에서 함께 볼 것: iOS 재생 시작 지연(리소스 로더는 콘텐츠 정보 왕복이 1회 더 있다), 탐색 반응, 비행기 모드 30초 뒤 복귀.
