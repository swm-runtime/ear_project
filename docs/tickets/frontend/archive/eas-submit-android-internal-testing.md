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
| 상태 | **완료 2026-09-21** — 자동 업로드 실증, 구글·카카오 로그인 확인 |

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

## 처리 기록 (반영 날짜: 2026-09-21)

`format=aab` 실행 한 번으로 **사람이 파일을 만지지 않고** Play 내부 테스트에 올라가는 것을 실증했다.
구글·카카오 로그인도 실기기에서 확인했다 — 이 티켓의 목적이 달성됐다.

### 실증 기록

| 실행 | 결과 |
|---|---|
| [35521553638](https://github.com/swm-runtime/ear_project/actions/runs/35521553638) `aab` | 빌드 성공, **업로드 실패** — 아래 "막혔던 것" 4번 |
| [35522399891](https://github.com/swm-runtime/ear_project/actions/runs/35522399891) `aab` | **전 단계 성공.** `✔ Submitted your app to Google Play Store!` |

Play Console 내부 테스트 트랙 — **1.1.0 · 내부 테스터에게 제공됨 · 게시일 2026-09-21 01:35**.
`eas submit` 로그가 `package_name: dev.runtime.ear` · `track: internal` · `Key Source: local` ·
`Account Email: runtime364@project-aa960d8e-87b9-4349-87c.iam.gserviceaccount.com` 로 찍혀
설정이 의도대로 물린 것도 확인된다.

### 막혔던 것 4개 — 전부 이번에 뚫었다

요청 1(서비스 계정 키)은 "키를 만들어 secret 에 넣는다" 한 줄이었지만, 실제로는 **네 겹이 막혀 있었다.**
같은 일을 다시 할 사람을 위해 순서대로 남긴다.

1. **GCP 콘솔이 계정을 못 잡았다** — 브라우저 기본 Google 계정이 `runtime364@gmail.com` 이 아니어서
   프로젝트가 안 보였다. URL 에 `authuser=1` 을 붙여야 붙는다.
2. **Play Console 에 `API 액세스` 메뉴가 없다** — 소유자 계정으로 봐도 없고 `/api-access` 는 앱 목록으로
   리다이렉트된다. 이 콘솔 버전에는 그 페이지가 없다. **GCP 에서 서비스 계정을 만들고 Play Console
   `사용자 및 권한` 에서 그 이메일을 초대하는 경로**로 우회했다.
3. **조직 정책이 키 생성을 막았다** — `iam.disableServiceAccountKeyCreation` 이 상위 조직
   `runtime364-org`(222848059221)에서 상속돼 있었다(새 조직에 자동 적용되는 보안 기본값).
   `정책 관리` 버튼은 비활성이었는데, `runtime364` 에 **조직 관리자**는 있어도 `orgpolicy.*` 가
   없어서였다. 조직 IAM 에서 **조직 정책 관리자** 역할을 더한 뒤,
   **`earcast` 프로젝트만** `상위 정책 재정의` → 규칙 `사용 안 함` 으로 두었다.
   **조직 전체와 두 번째 조직(886870350051)은 차단 그대로다.**
4. **`androidpublisher.googleapis.com` 이 꺼져 있었다** — 첫 실행이 여기서 죽었다.
   `PERMISSION_DENIED: ... has not been used in project 475643832949 before or it is disabled`.
   권한 문제로 읽히지만 **API 활성화 문제**다. 켜고 재실행하니 통과했다.
   덧붙임: 에러가 말한 `475643832949` 는 다른 프로젝트가 아니라 **`earcast` 프로젝트의 번호**다.

### 만들어진 것 (다음 사람이 찾을 값)

| 항목 | 값 |
|---|---|
| GCP 프로젝트 | `earcast` — ID `project-aa960d8e-87b9-4349-87c`, 번호 `475643832949` |
| 서비스 계정 | `runtime364@project-aa960d8e-87b9-4349-87c.iam.gserviceaccount.com` |
| Play 권한 | 앱 `dev.runtime.ear` **하나만** · 테스트 트랙 출시 + 테스트 트랙 관리(+ 읽기 전용 2종). **프로덕션 출시 권한은 주지 않았다** |
| repo secret | `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` |

키 파일은 저장소에 두지 않는다. CI 가 secret 을 `frontend/play-service-account.json` 으로 풀어 쓰고
잡이 끝나면 러너와 함께 사라진다. 그 파일명은 `frontend/.gitignore` 에 박아 두었다 —
`*.json` 은 무시 대상이 아니라서 이름으로 막지 않으면 실수로 커밋된다.
(Google 콘솔도 "공개 저장소에서 감지된 서비스 계정 키는 자동 사용 중지된다"고 경고한다.)

### 완료 조건 확인

| 완료 조건 | 결과 |
|---|---|
| `format=aab` → 사람 손 없이 내부 테스트에 새 버전 | **충족** — run 35522399891, Play 에 1.1.0 게시 |
| 구글 로그인 `DEVELOPER_ERROR` 없음 | **충족** — 실기기 확인(2026-09-21) |
| 카카오 로그인이 개발계 서버에 도달 | **충족** — 실기기 확인(2026-09-21) |
| `format=apk` 는 Play 에 아무것도 안 올라감 | **충족** — run 35523505393 에서 업로드 단계 `skipped` |
| 운영 제출 설정 종전 그대로 | **충족** — `submit.production` 무변경 |

### 남은 것 / 주의

- **versionCode 는 `autoIncrement` 가 EAS 원격 카운터로 올린다.** 게시된 것은 스토어 버전 1.1.0 이고,
  versionCode 는 그와 별개로 증가한다. 둘을 같은 것으로 보면 다음에 헷갈린다.
- 운영 앱(`com.runtime.ear`) 제출 자동화는 **이 티켓 범위가 아니다.** 하려면 서비스 계정에 그 앱 권한을
  따로 주고 `submit.production` 에 android 를 더해야 한다 — 그때는 프로덕션 출시 권한이 필요하므로
  권한 범위를 다시 판단할 것.
