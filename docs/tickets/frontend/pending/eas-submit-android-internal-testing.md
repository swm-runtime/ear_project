# [FE] 개발계 안드로이드 배포를 Play 내부 테스트로 옮긴다 — eas submit 자동화

| 항목 | 값 |
|---|---|
| 대상 | `frontend/eas.json`(`submit.preview-store`) · `.github/workflows/dev-app-build.yml` |
| 요청 파트 | 프론트엔드 → 인프라 |
| 발행 날짜 | 2026-09-20 |
| 발견 시점 | 2026-09-20 KAN-80 실기기 검증 — 안드로이드 구글 로그인이 `DEVELOPER_ERROR`로 계정 선택 화면조차 뜨지 않았다 |
| 근거 문서 | `docs/infra/runbook.md` · Jira KAN-85 |
| 중요도 | Low (기한 2026-09-27) |
| 심각도 | **중** — 기능이 깨진 게 아니라 **개발계에서 소셜 로그인을 검증할 방법이 없다.** 실기기 확인이 필요한 티켓이 이 구멍에 계속 걸린다 |
| 상태 | 진행 — 코드 반영 완료(2026-09-20). **서비스 계정 키 등록(사람 손) 대기** |

## 문제 — 직접 설치 APK 는 서명 키가 달라 소셜 로그인이 구조적으로 막힌다

개발계 앱을 Actions 아티팩트 APK 로 받아 설치하면 그 APK 는 **EAS 업로드 키**로 서명돼 있다.
그런데 구글·카카오 콘솔에 등록된 것은 **Play 앱 서명 키** 쪽이다.

2026-09-20 `ear-preview-apk`(run 35457296079)를 직접 뜯어 확인한 값:

```
SHA-1          3A:D2:96:CF:BA:3E:64:CF:B5:77:DD:C5:A7:4B:E3:A2:55:C6:BB:58   (EAS 업로드 키)
카카오 키 해시   OtKWz7o+ZM+1d93Fp0vjolXGu1g=
```

| 콘솔 | 등록된 값 | 직접 설치 APK 가 내미는 값 |
|---|---|---|
| 구글 Android 클라이언트(`dev.runtime.ear`) | `66:B6:B9:AA:…` (Play 앱 서명 키) | `3A:D2:96:CF:…` — **불일치** |
| 카카오 개발계 앱 키 해시 | `Zra5qsEou+…`(Play) · `j7ikbN2+…` | `OtKWz7o+ZM+…` — **없음** |

그래서 구글 로그인은 `DEVELOPER_ERROR`로 계정 선택 화면조차 뜨지 않는다. KAN-80 실기기 검증에서
구글은 iOS 만 확인해 이 구멍이 드러나지 않았다.

**Play 내부 테스트로 배포하면 Play 가 `66:B6:B9:…` 로 재서명하므로 이미 등록된 값과 맞는다** —
콘솔에 키를 더 등록하지 않아도 풀린다. `dev-app-build.yml` 은 이미 aab 형식을 지원하지만 업로드가
사람 손이라 매번 빠른 APK 로 흘렀다. `frontend/eas.json` 의 submit 에는 iOS(`ascAppId`)만 있고
안드로이드 설정 자체가 없었다.

## 요청 내용

1. Play 서비스 계정 키 생성 → Play Console 에서 개발계 앱(`dev.runtime.ear`) 릴리스 권한 부여 →
   repo secret(`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`)으로 넣는다. **파일로 커밋하지 않는다.**
2. `eas.json` 의 `submit.preview-store` 에 android 추가 — `track: internal`, `serviceAccountKeyPath`.
   운영(`submit.production`)은 범위 밖.
3. `dev-app-build.yml` 에 업로드 단계 추가 — `format=aab` 일 때만
   `eas submit -p android --profile preview-store --path <산출물>`.
   `--local` 빌드라 `--latest` 가 아니라 `--path` 여야 한다. `format=apk` 는 지금처럼 아티팩트만.
4. `workflow_dispatch` 의 format 기본값을 `apk` → `aab` 로 뒤집는다. APK 는 예외 경로로 남기고
   취지를 주석에 적는다.
5. `dev-app-build.yml` 상단에 APK 직접 설치의 함정을 주석으로 남긴다.

## 하지 않는 것

- 운영 앱(`com.runtime.ear`) 제출 자동화 — 이번엔 개발계만
- 콘솔에 EAS 업로드 키를 추가 등록하는 것 — 내부 테스트로 옮기면 불필요
- iOS 제출 — 이미 `ascAppId` 로 TestFlight 에 올라간다

## 완료 조건

- Given `format=aab` 로 dev-app-build 실행 / When 워크플로가 끝난다 / Then 사람이 파일을 만지지 않아도 Play 내부 테스트 트랙에 새 버전이 올라가 있다
- Given 내부 테스트로 받은 개발계 앱(안드로이드) / When 구글로 로그인한다 / Then `DEVELOPER_ERROR` 없이 성공한다
- Given 같은 앱 / When 카카오로 로그인한다 / Then 동의 화면을 지나 개발계 서버로 `social-login` 이 도달한다
- Given `format=apk` 로 실행 / When 끝난다 / Then 종전처럼 아티팩트만 올라가고 Play 에는 아무것도 올라가지 않는다
- Given `APP_VARIANT=production` 빌드 / When `eas.json` 을 읽는다 / Then 운영 제출 설정은 종전 그대로다

선결 조건: 없음

## 진행 기록 (2026-09-20) — 코드 반영 완료, 키 등록 대기

요청 2~5 를 반영했다. **요청 1(서비스 계정 키)은 계정 소유자만 할 수 있어 사람 손으로 남는다.**

### 반영한 것

**`frontend/eas.json`** — `submit.preview-store` 에 android 추가.

```json
"android": { "track": "internal", "serviceAccountKeyPath": "./play-service-account.json" }
```

`submit.production` 은 손대지 않았다(완료 조건 5).

**`.github/workflows/dev-app-build.yml`**
- format 기본값 `apk` → `aab`, 선택지 순서도 `[aab, apk]` 로 뒤집었다. 설명 문구에 각각의 결과를 적었다
  (`aab = Play 내부 테스트 자동 업로드(로그인 됨) · apk = 직접 설치, 소셜 로그인 불가`)
- 상단 주석에 서명 함정을 적었다 — 업로드 키 vs 앱 서명 키, 왜 APK 로는 소셜 로그인이 막히는지, 언제 APK 를 쓰는지
- `Play 내부 테스트 업로드` 단계 추가. `if: inputs.format == 'aab'` 라 apk 경로는 종전 그대로다(완료 조건 4)
- `--path` 를 쓴 이유를 주석에 남겼다 — `--latest` 는 **EAS 클라우드 빌드**의 산출물을 가리키는데
  여기는 `--local` 빌드라 서버에 올라간 것이 없다
- 키가 없으면 **명시적으로 실패시키고** 대안(아티팩트 수동 업로드)을 로그에 안내한다. 조용히 건너뛰면
  "성공했는데 Play 에는 없는" 상태가 된다

**`frontend/.gitignore`** — `play-service-account.json` 을 파일명으로 못 박았다.
요청 1 이 "파일로 커밋하지 않는다"인데 **`*.json` 은 무시 대상이 아니라서** 이름으로 막지 않으면
실수로 커밋된다. CI 는 secret 을 이 이름으로 풀어 쓰고 잡이 끝나면 러너와 함께 사라진다.

### 검증

- YAML 파싱(`yaml.safe_load`) 통과 · `eas.json` JSON 파싱 통과
- 업로드 단계의 셸 스크립트를 따로 뽑아 `bash -n` 통과(CRLF 저장소라 줄바꿈 이어쓰기 3곳 살아있음 확인)
- format 기본값이 `aab`, 선택지 `['aab','apk']` 로 바뀐 것 파싱 결과로 확인
- 업로드 단계에 `if: inputs.format == 'aab'` 가 걸린 것 확인

### 남은 것 — 사람 손

**Play Console 서비스 계정 키.** 계정 소유자(PM)만 가능하다.

1. Google Cloud Console → 서비스 계정 생성 → JSON 키 발급
2. Play Console(계정 `runtime364`, 개발자 ID `5166992852722907301`) → 사용자 및 권한 → 그 서비스 계정 초대 →
   **앱 `dev.runtime.ear`(앱 ID `4975553322032306565`) 에 릴리스 권한** 부여
3. GitHub 레포 secret `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` 에 JSON **전문**을 붙여넣기

등록 전까지는 `format=aab` 실행이 업로드 단계에서 **실패한다**(의도된 동작 — 로그에 위 절차를 안내한다).
그때까지는 아티팩트 `ear-preview-aab` 를 받아 콘솔에 직접 올린다.

### 미확인 — 키 등록 후 확인할 것

완료 조건 1~3 은 **실제 업로드와 실기기 로그인이라 지금 확인할 수 없다.** 키가 등록되면:

- `format=aab` 로 dev-app-build 실행 → Play 내부 테스트에 새 버전(versionCode 4 예상 — 현재 3 게시됨,
  EAS 개발계 Android 카운터도 3)이 사람 손 없이 올라가는지
- 내부 테스트로 받은 앱에서 구글 로그인이 `DEVELOPER_ERROR` 없이 되는지
- 같은 앱에서 카카오 로그인이 동의 화면을 지나 개발계 서버에 도달하는지
