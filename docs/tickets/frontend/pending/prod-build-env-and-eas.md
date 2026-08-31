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
