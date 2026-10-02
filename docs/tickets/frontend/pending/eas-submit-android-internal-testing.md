# [FE] 개발계 안드로이드 배포를 Play 내부 테스트로 옮긴다 — `eas submit` 자동화

| 항목 | 값 |
|---|---|
| 대상 | `frontend/eas.json`(`submit.preview-store.android`) · `.github/workflows/dev-app-build.yml` · repo secret |
| 요청 파트 | 프론트엔드 (담당 이주호) |
| 요청자 | 박준현(백엔드) |
| 발행 날짜 | 2026-09-20 |
| Jira | [KAN-85](https://runtime364.atlassian.net/browse/KAN-85) |
| 발견 시점 | 2026-09-20 — 직접 설치한 개발계 APK 에서 구글·카카오 로그인이 모두 막혀 원인을 추적하다 발견 |
| 근거 문서 | `tickets/frontend/pending/preview-app-social-keys.md`(KAN-80 — 서명 키·콘솔 등록값) · `tickets/frontend/archive/dev-app-separate-bundle.md`(KAN-76) |
| 중요도 | Low(이번 주 안) |
| 선결 조건 | 없음 |

## 문제 — 직접 설치 APK 는 서명 키가 달라 소셜 로그인이 구조적으로 막힌다

개발계 앱을 Actions 아티팩트 APK 로 받아 설치하면, 그 APK 는 **EAS 업로드 키**로 서명돼 있다. 그런데 구글·카카오 콘솔에 등록된 것은 **Play 앱 서명 키** 쪽이다.

2026-09-20 `ear-preview-apk`(run 35457296079)를 직접 뜯어 확인한 값이다.

```
직접 설치 APK 의 서명 인증서
  SHA-1          3A:D2:96:CF:BA:3E:64:CF:B5:77:DD:C5:A7:4B:E3:A2:55:C6:BB:58   (EAS 업로드 키)
  카카오 키 해시   OtKWz7o+ZM+1d93Fp0vjolXGu1g=
```

| 콘솔 | 등록된 값 | 직접 설치 APK 가 내미는 값 |
|---|---|---|
| 구글 클라우드 Android 클라이언트(`dev.runtime.ear`) | `66:B6:B9:AA:…`(Play 앱 서명 키) | `3A:D2:96:CF:…` — **불일치** |
| 카카오 개발계 앱 키 해시 | `Zra5qsEou+…`(Play) · `j7ikbN2+…` | `OtKWz7o+ZM+…` — **없음** |

그래서 구글 로그인은 `DEVELOPER_ERROR` 로 계정 선택 화면조차 뜨지 않는다. KAN-80 의 실기기 검증에서 구글은 **iOS 만** 확인했기 때문에 이 구멍이 드러나지 않았다.

**Play 내부 테스트로 배포하면 Play 가 `66:B6:B9:…` 로 재서명하므로 이미 등록된 값과 맞는다** — 콘솔에 키를 더 등록하지 않아도 풀린다. `dev-app-build.yml` 은 이미 `aab` 형식을 지원하지만(`preview-store` 프로필), 업로드가 사람 손이라 실제로는 매번 빠른 APK 로 흘렀다.

`frontend/eas.json` 의 `submit` 에는 iOS(`ascAppId`)만 있고 **안드로이드 설정 자체가 없다.**

```json
"submit": {
  "production":    { "ios": { "ascAppId": "6807708636" } },
  "preview-store": { "ios": { "ascAppId": "6813738593" } }
}
```

## 요청 내용

1. **Play 서비스 계정 키를 만든다** — Google Cloud 프로젝트에서 서비스 계정 생성 → JSON 키 발급 → Play Console 의 "사용자 및 권한"에서 그 계정에 개발계 앱(`dev.runtime.ear`) 릴리스 권한을 준다. JSON 은 repo secret(예: `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`)으로 넣는다 — 파일로 커밋하지 않는다.
2. **`eas.json` 의 `submit.preview-store` 에 `android` 를 추가**한다 — `track: internal`, `serviceAccountKeyPath`(러너에서 secret 을 파일로 써서 가리킨다). 운영(`submit.production`)은 이번 범위 밖이다.
3. **`dev-app-build.yml` 에 업로드 단계를 붙인다** — `format=aab` 로 돌렸을 때만 빌드 직후 `eas submit -p android --profile preview-store --path <빌드 산출물>` 을 실행한다. `--local` 빌드라 `--latest` 가 아니라 `--path` 여야 한다. `format=apk` 는 지금처럼 아티팩트만 올린다.
4. **기본값을 `aab` 로 바꾼다** — `workflow_dispatch` 의 `format` 기본값이 지금 `apk` 다. 평소 경로가 내부 테스트가 되도록 뒤집고, APK 는 "콘솔 등록과 무관하게 네이티브만 급히 확인할 때" 쓰는 예외로 남긴다. 그 취지를 주석에 적는다.
5. **APK 직접 설치의 함정을 주석으로 남긴다** — `dev-app-build.yml` 상단에 "직접 설치 APK 는 EAS 업로드 키로 서명돼 구글·카카오 콘솔 등록값(Play 앱 서명 키)과 다르므로 소셜 로그인이 막힌다"를 적는다. 값 자체는 KAN-80 티켓에 있다.

## 하지 않는 것

- **운영 앱(`com.runtime.ear`)의 제출 자동화** — 운영 배포는 사람이 판단할 지점이 더 있다. 이번엔 개발계만이다.
- **콘솔에 EAS 업로드 키를 추가 등록하는 것** — 내부 테스트로 옮기면 필요 없다. 두 경로를 다 살리면 어느 서명으로 깔렸는지 매번 따져야 한다.
- iOS 제출 — 이미 `ascAppId` 로 TestFlight 에 올라간다.

## 완료 조건

- Given `format=aab` 로 `dev-app-build` 를 실행한다 / When 워크플로가 끝난다 / Then 사람이 파일을 만지지 않아도 Play Console 내부 테스트 트랙에 새 버전이 올라가 있다
- Given 내부 테스트로 받은 개발계 앱(안드로이드) / When 구글로 로그인한다 / Then `DEVELOPER_ERROR` 없이 성공한다
- Given 같은 앱 / When 카카오로 로그인한다 / Then 동의 화면을 지나 개발계 서버로 `social-login` 이 도달한다
- Given `format=apk` 로 실행한다 / When 워크플로가 끝난다 / Then 종전처럼 아티팩트만 올라가고 Play 에는 아무것도 올라가지 않는다
- Given `APP_VARIANT=production` 빌드 / When `eas.json` 을 읽는다 / Then 운영 제출 설정은 종전 그대로다

## 처리 기록

- 2026-09-20 발행.

### 2026-10-02 — 구현·실제 업로드 확인

- 요청 1~5의 코드·설정은 최신 dev에 이미 반영돼 있다. `submit.preview-store.android`에 `track: internal` 및 서비스 계정 파일 경로가 있고, workflow의 기본값은 aab이며 aab만 `eas submit --path`로 제출한다. 키 파일은 EXIT trap으로 삭제한다. 운영 제출 설정은 변경하지 않았다.
- [2026-09-29 dev-app-build 실행](https://github.com/swm-runtime/ear_project/actions/runs/36538747449): AAB 빌드와 Play 내부 테스트 업로드 단계 모두 성공. 제출 로그에 `Submitted your app to Google Play Store!`가 있으며 [EAS 제출](https://expo.dev/accounts/runtime364/projects/ear/submissions/040d16ff-4d9a-4082-ab98-81bc6022ebf7)까지 확인했다.
- 남은 완료 조건은 Play에서 설치한 `dev.runtime.ear`의 구글·카카오 로그인 확인이다. 이 세션은 Android 실기기에 접근하지 못하므로 성공을 추정하지 않고 pending을 유지한다. 자동화 코드를 중복 수정하거나 새 빌드를 발행하지 않았다.
