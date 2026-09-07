# [FE] 연령 확인을 가입 요청에 실어 보낸다 — `age_confirmation` 전송

| 항목 | 값 |
|---|---|
| 대상 | `useTermsConsentScreen.ts`(`ageRow`) · sign-up 요청 조립 |
| 요청 파트 | 프론트엔드 |
| 발행 날짜 | 2026-09-06 |
| 발견 시점 | `tickets/backend/archive/age-confirmation-consent` 반영(PR #142 머지) — 서버 준비 완료, 전송만 남음 |
| 근거 문서 | `domain.md` 3.2 · `changes/pending/auth-consents-age-confirmation.md` |
| 심각도 | **중** — 전송 전까지는 서버에 연령 확인 이력이 계속 비어 있다. **서버가 필수 동의로 판정하므로, 미전송 상태로 서버가 배포되면 신규 가입이 `CONSENT_REQUIRED`(400)로 전부 막힌다 — 서버 배포 전에 반영돼야 한다** |
| 상태 | **완료** (반영 2026-09-06 · 실기기 확인 2026-09-07) |

## 배경

백엔드가 `consents.consent_type`에 `age_confirmation`을 추가하고 가입 필수 동의(3종)에
포함했다(PR #142). A4 화면은 이미 "만 18세 이상입니다 (필수)" 행을 그리고 게이트도 걸지만
(`a0496f8`), 체크 사실이 서버로 전송되지 않는다.

## 요청 내용

1. `POST /auth/sign-up`의 `consents` 배열에 다음 항목을 추가해 보낸다:
   ```json
   { "consent_type": "age_confirmation", "version": null, "is_agreed": true }
   ```
   - `version`은 항상 `null`이다(열람할 문서가 없는 자기 선언 — 마케팅과 동일).
2. (선택) `social-login` 응답의 `required_consents`에 이 값이 내려오므로, 정적 `ageRow`
   대신 서버 목록 매핑으로 바꿔도 된다 — 동작 무변경이면 후순위.
3. **기존 사용자 재동의 대응**: 연령 확인 이력이 없는 기존 사용자는 로그인 응답
   `pending_consents`에 `age_confirmation`이 온다. 재동의 화면이 이 항목을 렌더·전송할 수
   있는지 확인한다(`POST /users/me/consents`도 이 값을 받는다).

## 완료 조건

- Given 신규 가입 / When 전체 동의 후 [동의하고 시작하기] / Then 서버 `consents`에 `age_confirmation` 행이 남고 가입이 성공한다
- Given `age_confirmation` 미포함 요청 / When 서버가 처리 / Then `CONSENT_REQUIRED`(400) — 클라이언트가 이 상태를 만들지 않아야 한다
- Given 이력 없는 기존 사용자 로그인 / When `pending_consents`에 `age_confirmation`이 온다 / Then 재동의 화면이 항목을 표시하고 전송한다

## 처리 기록

| 항목 | 값 |
|---|---|
| 반영 날짜 | 2026-09-06 |
| 반영 내용 | `age_confirmation` 을 화면 전용 키에서 **서버 동의 유형으로 승격**하고 sign-up 요청에 실어 보낸다 |

- `ConsentType` 에 `age_confirmation` 추가, 화면 전용 `ConsentRowType` 폐기
- 서버 목록(`requiredConsents`)에 이미 있으면 그것을 쓰고, 아직 내려주지 않는 서버를 만나면
  클라이언트가 채운다 — 빠뜨리면 서버가 `CONSENT_REQUIRED` 로 가입을 막는다
- 제출은 **화면이 그린 행 그대로** 보낸다(`items`). 서버 목록만 매핑하면 연령 확인이 누락된다
- 전체 동의도 이 항목을 함께 켠다

완료 조건 1·2 충족. 3(기존 사용자 재동의 화면)은 그 화면이 아직 없어 **미충족** — 재동의
화면을 만들 때 이 항목을 함께 처리해야 한다.

## 진행 기록 (2026-09-06)

- **요청 1 반영됨** — 가입 요청이 `age_confirmation`(version null) 행을 포함해 전송한다.
  요청 2도 함께 반영: 정적 행이 아니라 서버 `required_consents` 목록을 매핑하고, 목록에
  없으면 폴백으로 채운다(`useTermsConsentScreen.ts`).
- **완료 조건 1·2 충족** — 이로써 **백엔드 배포 차단이 풀렸다**(미전송 가입이 발생하지 않는다).
- **완료 조건 3(기존 사용자 재동의) 미충족 — 보류** — `useStartScreen.ts`에
  `TODO(auth): pendingConsents가 있으면 재동의 화면으로 보낸다`로 남아 있다. 현재는
  로그인 응답의 `pending_consents`를 무시하고 세션을 시작하므로, 이력 없는 기존 사용자
  (테스트 계정뿐)의 연령 확인이 기록되지 않는다. 로그인 자체는 막히지 않아 서비스 동작
  지장은 없다. 재동의 화면 연결(약관 개정 재동의와 같은 경로)이 붙으면 이 티켓을 닫는다.

## 추가 기록 (2026-09-06 저녁 — 배포 순서 우려 해소)

백엔드가 CI 자동 배포(`deploy-api.yml`)로 **이미 실서버에 반영됐는데도 가입이 막히지
않았다** — 구 빌드(TestFlight 빌드 3, c31f190)의 동의 화면도 서버 `required_consents`
목록을 그대로 그려 전송하는 구조라, 서버가 내려준 `age_confirmation` 행을 체크·전송한다.
다만 구 빌드에는 `age_confirmation` 라벨 카피가 없어 **행 라벨이 빈 채로 보인다**(동작
무지장, 미관 문제) — dev 를 main 에 머지하면 OTA(production 채널)로 카피가 내려가 해소된다.

## 진행 기록 (2026-09-07 — 남은 완료 조건 3의 진짜 막힌 지점을 특정했다)

완료 조건 3을 닫으려고 재동의 화면을 찾았는데 **어느 문서에도 없다.**

- `auth-uiux.md`의 화면은 **A1–A19**뿐이고 재동의를 그리는 화면이 없다
- A4(약관 동의)는 **신규 가입 경로 전용**이라 그대로 못 쓴다 — 재동의는 이미 로그인된
  사용자가 보고, 항목이 `pending_consents`에 담긴 것만이며, 거절 시 행선지도 다르다
- 계약·타입·매핑(`auth.api.ts:129`)은 **이미 다 있다.** 없는 것은 화면과 거절 경로 규칙이다

**FE가 지금 만들면 문서에 없는 화면을 지어내는 것이 된다**(공통 원칙 — 문서와 충돌하는 구현을
만들지 않는다). 그래서 코드를 건드리지 않고 **문서 요청을 발행했다**:
`changes/pending/auth-reconsent-screen-missing.md`.

그 문서가 정해야 하는 것 — ① 화면 ID·카피(A4 재사용 여부) ② **필수 동의 거절 시 동작**(가장
중요한 미결) ③ 표시 시점(`splash.md` 관문과의 순서) ④ `version: null`인 연령 확인의 표현.

### 이 티켓의 남은 일

**없다 — 문서 대기다.** `auth-reconsent-screen-missing.md`가 반영되면 `useStartScreen.ts:75`의
TODO를 구현하고 이 티켓을 닫는다. 다음에 집는 사람이 조사할 것은 없다.

## 진행 기록 (2026-09-07 저녁 — 완료 조건 3의 화면이 생겼다)

막고 있던 것이 "재동의 화면이 문서에 없다"였는데, **사용자가 미결 4개를 확정해서 화면을 만들었다**
(`changes/archive/auth-reconsent-screen-missing.md`).

- **A20 재동의 화면 신설** — `auth-uiux.md` 4.3-1. A4를 재사용하지 않는다
- **거절 = 로그아웃**(확인 다이얼로그 선행). 탈퇴가 아니다
- **표시 시점 = 실행 관문**(`splash.md` 4 — 3단계, 온보딩 판정보다 앞)
- `age_confirmation`은 [보기] 없이 체크박스만

`useStartScreen.ts:75`의 `TODO(auth)`가 사라졌다. 로그인 응답의 `pending_consents`를 세션에 싣고,
`RootNavigator`가 비어 있지 않으면 A20을 먼저 태운다. 전송은 `POST /users/me/consents`(4.5)다.

### 완료 조건 판정

- Given 신규 가입 / Then `age_confirmation` 행이 남고 가입 성공 → ✅ (PR #150)
- Given 미포함 요청 / Then `CONSENT_REQUIRED` — 클라이언트가 이 상태를 만들지 않는다 → ✅
- Given 이력 없는 기존 사용자 로그인 / Then 재동의 화면이 항목을 표시하고 전송한다 → 🟡 **구현 완료, 실기기 확인만 남음**

**대상자가 실제로 있다** — 운영 DB 기준 `age_confirmation` 이력이 없는 사용자가 **9명**(전체 13명,
전부 팀 테스트 계정)이다. 그 계정으로 로그인하면 A20이 떠야 한다. 확인되면 `archive/`로 옮긴다.

## 처리 완료 (2026-09-07 저녁 — 실기기 확인, 완료 조건 3 충족)

Android v7에 OTA로 A20이 전달된 뒤 실기기에서 확인했다.

| 확인 | 결과 |
|---|---|
| 약관 동의 화면의 **빈 필수 항목**이 사라졌다 | ✅ (구 빌드의 `age_confirmation` 중복·라벨 누락 해소) |
| 이력 없는 계정 로그인 시 **A20 재동의 화면**이 뜬다 | ✅ |
| 동의 후 서버에 기록된다 | ✅ 운영 DB `consents`에 `age_confirmation` 행 추가 확인 |

운영 DB 대조 — `age_confirmation` 보유 사용자가 **4명 → 6명**으로 늘었고, 가장 최근 행이
`2026-09-07 13:14 UTC`(22:14 KST)다. **화면이 그린 것이 실제로 전송된다는 종단 증거다.**

### 완료 조건 판정

- Given 신규 가입 / Then `consents`에 `age_confirmation` 행이 남고 가입 성공 → ✅
- Given 미포함 요청 / Then `CONSENT_REQUIRED` — 클라이언트가 이 상태를 만들지 않는다 → ✅
- Given 이력 없는 기존 사용자 로그인 / Then 재동의 화면이 항목을 표시하고 전송한다 → ✅

**세 조건 모두 충족. `archive/`로 옮긴다.**

### 남는 것 — 이 티켓 밖

미보유 사용자가 아직 **8명**이다(전체 14명). 전부 팀 테스트 계정이고, **각자 한 번 로그인하면
A20이 떠서 저절로 0이 된다.** 코드가 할 일은 없다.

**iOS는 아직 확인되지 않았다** — vc=3(2026-09-06)이 `runtimeVersion: 1.0.0`이라 이번 OTA를 받지
못한다. 다만 이 티켓의 판정은 플랫폼 공통 로직(세션 상태 → 관문 분기 → 전송)이라 Android
확인으로 닫는다. iOS 고유 증상은 `onboarding-marquee-ios-tap-miss`가 따로 다룬다.
