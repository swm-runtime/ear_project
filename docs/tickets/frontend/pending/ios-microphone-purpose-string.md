# [FE] iOS 심사 반려 — 마이크 권한 문구(`NSMicrophoneUsageDescription`) 제거 후 네이티브 재빌드

| 항목 | 값 |
|---|---|
| 대상 | `frontend/app.json`(`expo-audio` 플러그인 옵션) · EAS 네이티브 빌드 |
| 요청 파트 | 프론트엔드 |
| 발행 날짜 | 2026-09-15 |
| 발견 시점 | App Store 심사 제출 — Apple 자동 검사(App Review Guideline Issue)가 "purpose string이 placeholder"라며 심사를 진행하지 않음 |
| 근거 문서 | Apple 반려 메시지(아래 인용) · `node_modules/expo-audio/plugin/build/withAudio.js` |
| 심각도 | **상** — 스토어 심사가 이 건으로 멈춰 있다. 고치고 다시 제출해야 심사가 재개된다 |
| 우선순위 | High(오늘 안) |

## 문제

Apple 반려 메시지:

> An automated analysis of the submission indicates the following purpose strings … include placeholder text or are otherwise insufficient:
> • NSMicrophoneUsageDescription: "Allow app to access your microphone"

앱은 **마이크를 쓰지 않는다**(`src/`에 `useAudioRecorder` · `requestRecordingPermissions` 등 녹음 API 사용 0건). 그런데 재생용으로 넣은 `expo-audio` 플러그인이 iOS `Info.plist`에 마이크 권한 문구를 **기본값으로 주입**한다. 현재 `app.json` 설정은

```json
["expo-audio", { "recordAudioAndroid": false }]
```

인데 `recordAudioAndroid`는 **Android `RECORD_AUDIO` 권한만** 끈다. iOS 문구는 `microphonePermission` 옵션이 없으면 플러그인 기본값 `"Allow $(PRODUCT_NAME) to access your microphone"`이 들어간다(`withAudio.js` 8~12행). Apple은 이 문구를 "무엇에 쓰는지 설명하지 않는 자리표시자"로 판정한다.

## 요청 내용

Apple이 제시한 두 선택지 중 **"리소스를 쓰지 않으면 권한과 문구를 바이너리에서 제거"** 가 맞다. 녹음 기능이 없으므로 문구를 그럴듯하게 다시 쓰는 대신 권한 자체를 뺀다.

1. `frontend/app.json`의 `expo-audio` 플러그인 옵션을 다음으로 바꾼다. `microphonePermission: false`면 플러그인이 `NSMicrophoneUsageDescription`을 plist에 넣지 않는다.
   ```json
   ["expo-audio", { "microphonePermission": false, "recordAudioAndroid": false }]
   ```
2. **네이티브 재빌드가 필요하다.** `Info.plist`는 OTA(EAS Update)로 바뀌지 않는다. `eas build --platform ios` 로 새 빌드를 만들어 TestFlight에 올리고, 그 빌드로 심사를 다시 제출한다. Android도 같은 빌드 번호 정합을 위해 함께 빌드하는 것이 안전하다.
3. 재제출 전 확인: 빌드 산출물의 `Info.plist`에 `NSMicrophoneUsageDescription` 키가 없는지(`eas build:inspect` 또는 아카이브 열어 확인), 앱 실행·재생·백그라운드 재생이 종전과 같은지.

## 주의

- `microphonePermission: false` 상태에서 iOS가 녹음 API를 호출하면 **앱이 즉시 크래시**한다. 지금은 녹음 코드가 없어 안전하지만, 이후 녹음 기능(음성 메모 등)을 넣을 때는 `false`를 지우고 용도를 구체적으로 쓴 문구(예: "음성 메모를 녹음하려면 마이크가 필요합니다")를 넣어야 심사를 통과한다.
- 다른 플러그인이 같은 키를 넣지 않는지 빌드 후 plist로 최종 확인한다(현재 플러그인 목록에서는 `expo-audio`만 해당).

## 완료 조건

- Given `app.json`의 `expo-audio` 옵션 / When 읽는다 / Then `microphonePermission: false`가 있다
- Given 새 iOS 네이티브 빌드 / When `Info.plist`를 본다 / Then `NSMicrophoneUsageDescription` 키가 없다
- Given 그 빌드로 재제출 / When Apple 자동 검사가 돈다 / Then purpose string 반려가 나지 않고 심사가 진행된다
- Given 그 빌드 / When 콘텐츠 재생·백그라운드 재생·미니플레이어를 쓴다 / Then 종전과 같이 동작한다
