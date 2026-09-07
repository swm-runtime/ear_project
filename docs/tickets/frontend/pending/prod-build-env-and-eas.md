# [FE] 운영 빌드 설정 — eas.json + 실서버 env 전환 (apk의 마지막 조각)

| 항목 | 값 |
|---|---|
| 대상 | `frontend/eas.json`(신규) · 빌드 시 env 주입. **런타임 코드 변경 없음** |
| 요청 파트 | 백엔드 (인프라 구축 완료 통지 겸) |
| 발행 날짜 | 2026-08-31 |
| 발견 시점 | 2026-08-31 서버 배포·소셜 로그인 종단 확인 후 — 서버는 실기기를 받을 준비가 됐는데 **앱이 실서버를 가리키는 빌드 프로필이 없다** |
| 근거 문서 | `tickets/backend/pending/api-server-deployment.md`(완료 조건의 "FE 스탠드얼론 빌드" 검증이 이것에 막힘) · `frontend/convention.md`(env 전환 패턴) |
| 심각도 | **높음** — 지금까지의 전 기능(로그인 4종 포함)의 실기기 종단 검증이 이 하나에 걸려 있다 |
| 상태 | pending — 재생 검증 **충족**, SES 발송 **정상 확인**(2026-09-07). 앱 경로 종단 확인 1회만 남음 |

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

## 진행 기록 (2026-09-07 — 발행 당시 지시대로 플래그 전수를 다시 세었더니 구멍이 있었다)

요청 1의 *"플래그 전수 목록은 `grep -rho "EXPO_PUBLIC_[A-Z_]*" frontend/src | sort -u`로 재확인"*
을 실제로 돌렸다. **코드가 쓰는 값과 `eas.json`이 주는 값이 어긋나 있었다.**

### ① 죽은 도메인이 스토어 빌드로 나가고 있었다 — 고쳤다

`settings.constants.ts`의 외부 링크 3종은 폴백이 **`ear.example.com`**(존재하지 않는 도메인)인데
`eas.json`에 값이 없었다. 즉 **v7까지의 모든 스토어 빌드에서** 설정의 다음 세 항목이 죽은 링크였다.

| 설정 항목 | v7까지 | 지금 |
|---|---|---|
| [이용약관] | `https://ear.example.com/terms` | `https://earcast.co.kr/terms` (200 확인) |
| [개인정보처리방침] | `https://ear.example.com/privacy` | `https://earcast.co.kr/privacy` (200 확인) |
| [업데이트] | `https://ear.example.com/store` | `https://play.google.com/store/apps/details?id=com.runtime.ear` |

**Play 심사 관점에서도 위험했다** — 스토어 등록정보의 개인정보처리방침 URL과 별개로, 앱 안에서
같은 항목이 죽은 링크를 열면 심사에서 지적될 수 있다.

고친 방식은 **두 겹**이다. `eas.json`의 `preview` env에 세 값을 넣고(=`production`이 `extends`로
물려받는다), **동시에 코드 폴백 자체를 실값으로 바꿨다.** env 하나를 빠뜨려도 죽은 링크가 나가지
않게 하려는 것으로, 공유 플래그를 기본 켬으로 둔 결정(`share.constants.ts`)과 같은 이유다.

### ② `EXPO_PUBLIC_WITHDRAWAL_API` 누락 — 사고는 아니었지만 명시했다

회원 탈퇴(PR #148)가 들어오면서 생긴 플래그가 `eas.json`에 없었다. 다만 판정이
`__DEV__ && ... !== 'real'`(`auth.constants.ts:70`)이라 **릴리즈 빌드는 이미 real로 떨어진다** —
실제 사고는 없었다. 발행 당시 지시대로 **명시가 안전하다**는 원칙에 따라 `"real"`을 넣었다.

### ③ 나머지 차이는 정상이다

`*_MOCK_SCENARIO` 계열과 `EXPO_PUBLIC_SHARE_ENABLED`는 `eas.json`에 **일부러 없다.**
전자는 dev 전용 시나리오 스위치이고, 후자는 기본값이 켜짐(`!== 'false'`)이라 끌 때만 명시한다.
`EXPO_PUBLIC_KAKAO_CHANNEL_URL`은 **폴백이 `https://pf.kakao.com/_ear_dev`로 남아 있다** —
운영 채널 URL의 실값을 모르는 상태라 임의로 채우지 않았다. **실값 확인이 필요하다**(아래).

### 남은 완료 조건 — 여전히 2개, 성격이 바뀌지 않았다

- Given 그 apk / When 이메일 인증 코드를 요청한다 / Then 실제 메일이 도착한다 — **미검증**
- Given 콘텐츠 1편 이상 업로드 / When 탐색에서 재생 / Then CloudFront 서명 URL로 재생된다 — **미검증**

둘 다 **실기기에서 한 번씩 해보면 끝난다.** 코드로 대신 확인할 수 없다(메일 발송은 실제 외부
발송이고, 재생은 인증된 세션이 필요하다). 확인되면 `archive/`로 옮긴다.

### 새로 생긴 확인 항목 1개 — **당일 해소됨(2026-09-07 저녁)**

- ~~**카카오 채널 URL 실값**~~ → **반영됨.** 카카오톡 채널을 개설해(채널명 `이어`, 검색용
  아이디 `earyourlife`) 실값을 넣었다. `eas.json`의 `EXPO_PUBLIC_KAKAO_CHANNEL_URL`과
  `settings.constants.ts` 폴백 양쪽 모두 `https://pf.kakao.com/_MdkJX/chat`이다.
  - **채널 홈이 아니라 `/chat`을 쓴다.** 홈(`/_MdkJX`)으로 보내면 사용자가 [채팅하기]를 한 번 더
    눌러야 한다. 같은 날 확정된 "인증된 이메일은 문의로만 변경"(`changes/archive/email-change-locked-when-verified.md`)
    때문에 이 링크가 이메일 변경의 **유일한 경로**가 됐으므로 단계를 늘리지 않는다.
  - 카카오가 안내하는 `http://` 주소는 `https://`로 301된다. 앱에서는 처음부터 `https`를 연다.
  - `curl`로 `200` 확인(홈·채팅 모두).

## 진행 기록 (2026-09-07 저녁 — 실서버 DB로 완료 조건 하나를 닫았다)

남은 두 조건을 "실기기에서 해봐야 한다"고 적어뒀는데, **둘 중 하나는 이미 실서버에 흔적이
남아 있었다.** 운영 DB(`43.203.57.240` · `docker compose exec postgres psql`)를 읽어서 판정했다.

### CloudFront 재생 — **충족**

- `audio_access_logs` **22행** — 서명 URL이 실제로 발급됐다(가장 최근 2026-09-07 08:25, 만료 5분)
- `playback_progresses` 10행, **최대 도달 901초 · 729초 · 631초 · 617초**
- `play_records.listened_sec` **644초 · 143초 · 22초** 등 실청취 누적

**서명 URL 발급 건수만으로는 판정할 수 없다** — CDN이 오디오를 주지 못하면 클라이언트가 위치를
못 늘리기 때문이다. 10분 넘게 이어진 진행값이 남았다는 것이 곧 **CloudFront가 오디오를 정상
전달했다**는 증거다. 발행 콘텐츠 7편 중 최소 3편에서 재생이 일어났다.

> Given 콘텐츠 1편 이상 업로드 / When 탐색에서 재생 / Then CloudFront 서명 URL로 재생된다 → **충족**

### 이메일 인증 — **미검증. 그리고 이유가 드러났다**

`email_verifications` 테이블이 **0행이다.** 한 번도 발송된 적이 없다 — "확인을 안 했다"가 아니라
**아무도 이 기능을 써 본 적이 없다.**

서버 설정 자체는 되어 있다(`.env.prod`: `MAIL_DELIVERY=ses`,
`MAIL_FROM_ADDRESS=이어 <no-reply@earcast.co.kr>`, `AWS_REGION=ap-northeast-2`).

**확인하지 못한 것 — SES 샌드박스 여부.** EC2 인스턴스 역할(`ear-prod-ec2`)에 SES **읽기** 권한이
없어서(`ses:GetSendQuota`·`ses:ListIdentities`·`ses:GetAccount` 전부 AccessDenied) 서버에서는
조회할 수 없었고, 로컬 AWS CLI는 SSO 토큰이 만료돼 있었다.

> **위험 판단(그리고 그 정정).** 처음에 "샌드박스면 조용히 실패한다"고 적었으나 **틀렸다.**
> 코드를 확인한 결과 실패는 감춰지지 않는다 — `ses-mail.client.ts`가 SES 거부를 그대로 던지고,
> `email-verification.service.ts:146-159`가 잡아서 `email_verifications` 행을 지우고
> `EMAIL_SEND_FAILED`로 변환한다(발송 횟수 미차감 — `auth-api.md` 4.8). 사용자는 A12 "발송 실패"
> 토스트를 본다. **다만 결론은 같다** — 샌드박스면 실사용자 전원이 코드를 못 받는다.
> 증상이 "메일이 안 와요"가 아니라 "발송 실패 떠요"일 뿐이다.

### SES 발송 점검 — **정상 확인(2026-09-07 18:40 KST)**

샌드박스 여부를 SES API로 조회할 수 없었으므로(권한 없음) **실제로 한 통 보내서 판정했다.**
운영 EC2에서 서버와 **완전히 같은 조건**으로 발송했다 — 인스턴스 롤 자격증명, 리전
`ap-northeast-2`, 발신 주소 `이어 <no-reply@earcast.co.kr>`(`.env.prod` 값 그대로).

| 항목 | 결과 |
|---|---|
| SES 응답 | `MessageId: 010c01a07b3c8e62-39f9e5a0-656f-4dcc-829e-a258843d655e-000000` |
| 수신 | **도착 확인**(정상 수신함) |

**판정: 샌드박스가 아니다.** 샌드박스였다면 미검증 수신자에게 `MessageRejected`가 떨어졌을
것이고 MessageId 자체가 나오지 않는다. 발신 도메인 검증·전달 경로 모두 정상이다.

> **프로덕션 액세스 신청은 필요 없다.** 이것이 이 티켓의 유일한 잠재 블로커였고, 해소됐다.

### 남은 것 — 앱 경로 종단 확인 1회

인프라는 검증됐고, 남은 미검증 구간은 **API 엔드포인트 + FE 배선**뿐이다. SES 클라이언트·롤·
발신 주소는 위에서 이미 같은 것을 썼으므로 **위험이 낮다.**

- 실기기에서 설정 → 이메일 등록 → [인증 코드 받기] → 수신함 확인
- 도착하면 이 티켓을 `archive/`로 옮긴다

**다음에 집는 사람이 조사할 것은 없다 — 앱에서 한 번 눌러 보면 끝난다.**
