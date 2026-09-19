# [FE] 쓰지 않는 iOS 권한 문구를 뺀다 — 마이크·Face ID

| 항목 | 값 |
|---|---|
| 대상 | `frontend/app.json` 의 `expo-audio` · `expo-secure-store` 플러그인 옵션 |
| 요청 파트 | 프론트엔드 |
| 발행 날짜 | 2026-09-15 |
| 발견 시점 | **앱스토어 심사 반려** — 권한 불일치 |
| 근거 문서 | `frontend/architecture.md` 2.1 (재빌드·`runtimeVersion` 판단) |
| 심각도 | **최상** — 스토어 출시가 막힌다 |
| 상태 | 완료 — 1.0.0 (7) 심사 제출(2026-09-19) |
| Jira | [KAN-64](https://runtime364.atlassian.net/browse/KAN-64) |

## 문제

`expo-audio` 설정 플러그인이 **아무도 요청하지 않은 `NSMicrophoneUsageDescription` 을
Info.plist 에 넣는다.** 기본 문구는 "Allow 이어 to access your microphone".

플러그인 구현(`node_modules/expo-audio/plugin/build/withAudio.js`)이 마이크 문구를
**기본값으로 주입**하고, `microphonePermission` 을 넘겨야만 뺀다.

```js
IOSConfig.Permissions.createPermissionsPlugin({
  NSMicrophoneUsageDescription: MICROPHONE_USAGE,   // ← 기본 주입
})(config, { NSMicrophoneUsageDescription: microphonePermission });
```

`applyPermissions` 는 값이 **정확히 `false` 일 때만 삭제**한다. 우리는 안 넘겼으니 기본값이 박혔다.

**이어는 녹음 기능이 없다.** 오디오는 재생만 한다(`setAudioModeAsync` 만 쓰고
`useAudioRecorder` 계열은 어디에도 없다). 심사는 **선언한 권한과 실제 기능이 어긋난 것**을 잡았다.

**같은 문제가 하나 더 있었다.** `expo-secure-store` 도 `NSFaceIDUsageDescription` 을 기본 주입한다.
우리는 `requireAuthentication` 을 쓰지 않아(`secure-storage.ts` 는 get/set/delete 만) 생체 인증이
한 번도 뜨지 않는다. **다음 심사에서 같은 이유로 걸릴 자리다.** 같이 뺀다.

**안드로이드는 해당 없다.** `recordAudioAndroid: false` 가 2026-08-11부터 들어 있어
`RECORD_AUDIO` 가 한 번도 포함된 적이 없다. 이번 반려는 iOS 전용이다.

## 반영 내용

```jsonc
["expo-audio", { "recordAudioAndroid": false, "microphonePermission": false }],
["expo-secure-store", { "faceIDPermission": false }]
```

적용 후 `npx expo config --type introspect` 결과:

| 항목 | 결과 |
|---|---|
| iOS `NS*UsageDescription` | **하나도 없음** |
| iOS `UIBackgroundModes` | `['audio']` — **유지**(백그라운드 재생에 필요하다) |
| Android 권한 | `MODIFY_AUDIO_SETTINGS` · `FOREGROUND_SERVICE` · `FOREGROUND_SERVICE_MEDIA_PLAYBACK` |

## `runtimeVersion` 은 올리지 않는다

네이티브 변경이지만 **`"1"` 을 유지한다.**

architecture.md 2.1의 "네이티브가 바뀌면 손으로 올린다"는 **새 JS 가 낡은 네이티브 위에 얹혀
깨지는 것**을 막으려는 규칙이다. 이번 변경은 **쓰지 않는 Info.plist 키를 지우는 것**이라 JS 가
기대하는 네이티브 표면이 달라지지 않는다. 올리면 이미 배포된 Android v8·iOS v4 가 OTA 수신
대상에서 떨어져 나간다 — 얻는 것 없이 잃기만 한다.

## 완료 조건

- Given 재빌드한 iOS 빌드를 받는다 / When Info.plist 를 본다 / Then `NSMicrophoneUsageDescription` · `NSFaceIDUsageDescription` 이 없다
- Given 그 빌드를 제출한다 / When 심사 결과를 받는다 / Then 권한 불일치로 반려되지 않는다
- Given 이미 배포된 Android v8 / When `production` 채널에 OTA 를 발행한다 / Then 그대로 수신한다(`runtimeVersion` 이 `"1"` 로 유지되므로)

## 처리 기록 (2026-09-19 티켓 정리)

- 코드(`faceIDPermission: false`·`microphonePermission: false`)는 **iOS 빌드 6**(runtimeVersion 2, 2026-09-17 EAS 빌드 → App Store Connect 업로드 완료)에 들어 있다. 이 빌드는 TestFlight 로 실기기에 설치돼 돌고 있다(2026-09-19 PM 기기).
- **남은 것은 사람 손 하나**: App Store Connect 에서 빌드 6 을 심사에 제출한다(KAN-66 과 같은 제출). 제출되면 이 티켓과 KAN-64 를 함께 닫는다.
- **마감 초과 사유**(Medium, 발행 2026-09-15 → 3일 마감 2026-09-18): 코드·빌드는 기한 안에 끝났고, 심사 제출이 계정 소유자의 수동 작업이라 밀렸다. 중요도는 내리지 않는다.

## 처리 기록 (2026-09-19 — 반영 완료)

- **반영 날짜: 2026-09-19.** iOS **1.0.0 (7)**(main `e5a78c5`, runtimeVersion 2)을 App Store Connect 에 올려 2026-09-19 03:27 심사에 제출했다(제출자 박수헌, 상태 "심사 대기 중"). 권한 옵션은 main 의 `app.json` 에서 `faceIDPermission: false`·`microphonePermission: false` 로 확인했다. 같은 커밋의 1.0.0 (9) 도 업로드돼 있다(예비).
- 완료 조건 "심사 결과로 반려되지 않는다"는 심사 결과가 나와야 판정된다. 권한 불일치로 다시 반려되면 새 티켓을 발행한다.
