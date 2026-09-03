# [FE] 운영 빌드 설정 — eas.json + 실서버 env 전환 (apk의 마지막 조각)

| 항목 | 값 |
|---|---|
| 대상 | `frontend/eas.json`(신규) · 빌드 시 env 주입. **런타임 코드 변경 없음** |
| 요청 파트 | 백엔드 (인프라 구축 완료 통지 겸) |
| 발행 날짜 | 2026-08-31 |
| 발견 시점 | 2026-08-31 서버 배포·소셜 로그인 종단 확인 후 — 서버는 실기기를 받을 준비가 됐는데 **앱이 실서버를 가리키는 빌드 프로필이 없다** |
| 근거 문서 | `tickets/backend/pending/api-server-deployment.md`(완료 조건의 "FE 스탠드얼론 빌드" 검증이 이것에 막힘) · `frontend/convention.md`(env 전환 패턴) |
| 심각도 | **높음** — 지금까지의 전 기능(로그인 4종 포함)의 실기기 종단 검증이 이 하나에 걸려 있다 |
| 상태 | pending |

## 배경 — 서버 쪽은 끝났다

- **`https://api.earcast.co.kr/api/v1` 가동 중** (EC2 + Caddy TLS). 헬스 200.
- **구글 로그인 종단 확인 완료** (2026-08-31, 관리자 웹 콘솔 경유 — 같은 `/auth/social-login` 계약).
  이 과정에서 서버의 ID 토큰 검증 버그를 찾았고 수정·배포됨(`fix(be): verify provider id
  tokens with dedicated jwt service`) — **그동안 실기기에서 구글·애플 로그인이 안 됐다면 서버
  원인이었다. 지금은 고쳐져 있다.**
- 오디오 CDN·이메일 인증 발송(SES)도 준비됨.

앱이 실서버를 부르지 못하는 이유는 코드가 아니라 빌드 설정이다:
1. `eas.json`이 없다 (`expo run:android`만 가능 — 배포 apk를 못 뽑는다)
2. mock 전환 플래그 11개(`EXPO_PUBLIC_*_API`)가 기본 mock이고, 운영 빌드에서 `real`로 줄 방법이 없다
3. `EXPO_PUBLIC_API_BASE_URL`이 미지정이면 `http://<개발PC>:3000`을 본다

## 요청 내용

1. **`frontend/eas.json` 작성** — 제안 (프로필 이름·구성은 FE 재량):

```jsonc
{
  "cli": { "appVersionSource": "remote" },
  "build": {
    "preview": {                     // 내부 배포용 apk
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "env": {
        "EXPO_PUBLIC_API_BASE_URL": "https://api.earcast.co.kr/api/v1",
        "EXPO_PUBLIC_AUTH_API": "real",
        "EXPO_PUBLIC_EMAIL_VERIFICATION_API": "real",
        "EXPO_PUBLIC_ONBOARDING_API": "real",
        "EXPO_PUBLIC_CAREER_API": "real",
        "EXPO_PUBLIC_LIBRARY_API": "real",
        "EXPO_PUBLIC_EXPLORE_API": "real",
        "EXPO_PUBLIC_CONTENT_DETAIL_API": "real",
        "EXPO_PUBLIC_PLAYER_API": "real",
        "EXPO_PUBLIC_PROFILE_API": "real",
        "EXPO_PUBLIC_SETTINGS_API": "real",
        "EXPO_PUBLIC_INTEREST_API": "real",
        "EXPO_PUBLIC_NOTIFICATION_API": "real"
      }
    },
    "production": { "extends": "preview", "distribution": "store",
      "android": { "buildType": "app-bundle" } }
  }
}
```

   - mock 플래그가 `__DEV__ && !== 'real'` 형태라 릴리즈 빌드는 어차피 real로 떨어질 수 있으나,
     **명시가 안전하다** — 하나라도 `__DEV__` 가드가 빠진 플래그가 있으면 운영 apk가 mock을 탄다.
   - 플래그 전수 목록은 `grep -rho "EXPO_PUBLIC_[A-Z_]*_API" frontend/src | sort -u`로 재확인.

2. **EAS 프로젝트 연결** — `eas init`(expo 계정 필요, `app.json`에 `extra.eas.projectId` 추가됨) 후
   `eas build -p android --profile preview`.

3. **구글 로그인 Android 클라이언트 SHA-1 확인** — `eas credentials -p android`로 EAS가 만든 키스토어의
   SHA-1을 확인하고, GCP의 **Android 클라이언트 1**에 등록된 SHA-1과 일치시킨다. 불일치면 구글
   로그인에서 `DEVELOPER_ERROR`가 난다. (웹 클라이언트 ID는 서버·`app.json extra.socialAuth`에 이미 있음)

4. **범위 밖** — 공유 딥링크(`share-app-links-and-deep-link-routing.md` 별건), iOS 빌드(애플 계정 절차 별건).

## 완료 조건

- Given `eas build -p android --profile preview`로 뽑은 apk를 실기기에 설치 / When 앱을 실행한다 /
  Then 스플래시 → 로그인 화면이 뜨고 API 호출이 `https://api.earcast.co.kr`로 나간다 (mock 아님)
- Given 그 apk / When 구글 계정으로 로그인한다 / Then 가입·약관 동의를 거쳐 온보딩에 진입한다
- Given 그 apk / When 이메일 인증 코드를 요청한다 / Then 실제 메일이 도착한다 (서버 DKIM 검증 완료 후)
- Given 콘텐츠가 1편 이상 업로드된 상태 / When 탐색에서 재생한다 / Then CloudFront 서명 URL로 오디오가 재생된다

## 참고 — 서버 쪽 접점 값

| 값 | 내용 |
|---|---|
| API | `https://api.earcast.co.kr/api/v1` |
| CORS | 앱(네이티브)은 무관. 웹뷰 쓰면 BE에 오리진 추가 요청 |
| 구글 웹 클라이언트 ID | `app.json extra.socialAuth.googleWebClientId` 그대로 (서버 `GOOGLE_WEB_CLIENT_ID`와 일치 확인됨) |
| 카카오 | 서버 `KAKAO_APP_ID`가 아직 플레이스홀더 — **카카오 앱 ID(숫자)를 BE에 전달해 달라** (Kakao Developers → 앱 설정 → 요약 정보) |

---

## 진행 기록 (2026-09-03 — 요청 1·2·3 완료, 스토어 빌드 소셜 로그인 복구)

**요청 1·2 완료** — `frontend/eas.json` 작성(`development`/`preview`/`production`), EAS 프로젝트 연결(`app.json`의 `extra.eas.projectId`). `production`은 `preview`를 `extends`해 env 13종을 그대로 물려받는다.

**요청 3 완료 — 다만 원인이 티켓이 예상한 것보다 한 겹 더 있었다.**

발행 당시 이 항목은 "EAS 키스토어의 SHA-1과 GCP Android 클라이언트의 SHA-1을 일치시켜라"였는데, **Play 스토어 배포에서는 그 둘을 맞춰도 실패한다.** Play가 AAB를 자기 앱 서명 키로 **재서명**하므로 사용자가 받는 앱의 지문은 EAS 업로드 키의 지문이 아니다.

증상과 판정 경로:

| 사실 | 의미 |
|---|---|
| preview APK는 되고 스토어 빌드만 실패 | 재서명이 유일한 차이 |
| 네이버만 정상 | 네이버는 서명 지문을 **안 본다**(구글=SHA-1, 카카오=키 해시) |
| 서버 로그에 요청이 아예 안 찍힘 | `LoggingInterceptor`가 전 요청을 남기므로 **앱 구간에서 실패**가 확정 |
| 제공자 화면 진입은 됨 | 지문 검사가 **진입 시점이 아니라 토큰 발급 시점**에 일어난다 |

마지막 줄이 이 건의 함정이다. 카카오는 동의 후 `/oauth/token`에 `android_key_hash`를 실어 보낼 때, 구글은 계정 선택 후에 검사한다. **"화면은 뜨는데 돌아오면 실패"가 지문 불일치의 전형적 증상**이며, 진입이 된다는 이유로 서명을 후보에서 빼면 안 된다.

**등록해야 하는 지문이 하나가 아니다.** Play Console → 앱 서명 페이지에 다음이 모두 있었다.

| 키 | SHA-1 | 카카오 키 해시(base64) |
|---|---|---|
| **이전 앱 서명 키** ★ | `67:6F:6E:E3:ED:1C:AB:14:1C:ED:53:70:CE:B8:69:8D:22:56:F2:51` | `Z29u4+0cqxQc7VNwzrhpjSJW8lE=` |
| 앱 서명 키 — 기존 키 | `42:7E:46:DE:08:DD:F8:DA:19:67:D6:FE:CB:A7:FA:E6:DC:C1:06:1A` | `Qn5G3gjd+NoZZ9b+y6f65tzBBho=` |
| 앱 서명 키 — 양자 내성 암호화 키 | `22:61:35:1F:67:4C:D3:33:B4:AF:70:45:6F:AC:70:06:88:FF:CA:36` | `ImE1H2dM0zO0r3BFb6xwBoj/yjY=` |
| 업로드 키(EAS) | `05:9D:9E:5C:2D:FE:43:72:5C:C7:DF:FD:33:7A:6D:5E:13:00:20:71` | (기존 등록분) |

★가 실제로 설치된 스토어 빌드를 서명한 키였다. **앱 서명 키가 2026-09-02에 업그레이드됐고, 새 키의 "설치한 사용자 수"가 0.0%였다** — 배포 중인 빌드는 여전히 이전 키로 서명돼 있었다. 새 키 두 개만 등록했을 때 계속 실패한 이유가 이것이다.

- 구글: Android OAuth 클라이언트는 **클라이언트당 SHA-1이 하나**라, 지문 개수만큼 클라이언트를 만든다(같은 패키지명 `com.runtime.ear` 중복 등록 가능). `app.json`은 무변경 — 안드로이드는 `webClientId`만 쓰고 Android 클라이언트는 같은 프로젝트에 존재하기만 하면 된다
- 카카오: 앱 설정 → **네이티브 앱 키 설정** → Android → 키 해시(여러 줄 가능). SHA-1 **문자열**이 아니라 그 hex가 나타내는 **원본 20바이트**를 base64로 인코딩해야 한다 — `echo <hex> | tr -d ':' | xxd -r -p | openssl base64`, 결과는 항상 28자에 `=`로 끝난다
- **기존 등록분을 지우지 않는다.** 업로드 키 지문을 지우면 preview APK 테스트가 깨지고, 이전/새 앱 서명 키는 배포 전환기에 기기마다 다른 쪽을 볼 수 있다
- **앱 재빌드 불필요** — 판정은 구글·카카오 서버가 하므로 콘솔 등록만으로 설치본이 그대로 통과한다. 구글은 반영에 수 분~수 시간, 카카오는 즉시

**iOS는 무관하다** — 지문 검사는 안드로이드 전용이고 iOS는 번들 ID + URL 스킴으로 식별한다. App Store 배포에서도 이 문제는 재발하지 않는다.

**결과** — 구글·카카오·네이버 3종 모두 스토어 빌드에서 로그인 성공 확인(2026-09-03).

### 남은 완료 조건 2개 — pending 유지 사유

- ~~Given preview apk / When 실행 / Then API가 실서버로 나간다~~ → **확인됨**
- ~~Given 그 apk / When 구글 로그인 / Then 온보딩 진입~~ → **확인됨(스토어 빌드로)**
- Given 그 apk / When 이메일 인증 코드를 요청한다 / Then 실제 메일이 도착한다 — **미검증**
- Given 콘텐츠 1편 이상 업로드 / When 탐색에서 재생 / Then CloudFront 서명 URL로 재생된다 — **미검증**

위 두 건은 소셜 로그인과 독립이며, 확인되면 이 티켓을 `archive/`로 옮긴다. **다음에 집는 사람이 조사할 것은 없다 — 두 동작을 실기기에서 한 번씩 해보면 된다.**

### 참고 — 서버 env는 무혐의로 확인됐다

추적 과정에서 배포 서버(`/opt/ear/backend/.env.prod`)의 값을 대조했다. `GOOGLE_WEB_CLIENT_ID`는 `app.json`과 일치, `KAKAO_APP_ID=1533429`로 플레이스홀더가 아니었다. 티켓 하단 "참고" 표의 *"서버 `KAKAO_APP_ID`가 아직 플레이스홀더"* 는 **해소됐다.**
