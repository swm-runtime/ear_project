# [문서] 푸시는 Expo Push로 보내고, 드립 도착 알림에 탐험 편을 포함한다

| 항목 | 값 |
|---|---|
| 대상 문서 | `features/notification.md` 3·4.3·7·8 · `frontend/architecture.md` 2(기술 스택 표 "푸시" 행)·미결 사항 · `spec/api/onboarding-api.md` 4.9(`push_token` 예시·비고) · `legal/privacy-policy-draft.md` 6(처리 위탁)·6.1(국외 이전 신설) · `legal/review-2026-09-04.md` 4 |
| 요청 파트 | 문서 — 구현은 `tickets/backend/pending/push-drip-arrival-sender.md`(KAN-68) · `tickets/frontend/pending/push-sdk-integration.md`(KAN-69) |
| 발행 날짜 | 2026-09-17 |
| 반영 날짜 | 2026-09-17 (발행 당일 반영 — 사용자 요청: 티켓 착수 전 문서 선반영) |
| 발견 시점 | 2026-09-17 푸시 미구현 티켓 발행 중 사용자 결정 |
| 심각도 | 하 — 아직 구현 전. 티켓이 이 결정을 전제로 하므로 착수 전에 반영했다 |

## 결정 1 — 발송 수단: FCM 직접 → **Expo Push**

### 현재 규칙
`frontend/architecture.md` 2 — 푸시 = `@react-native-firebase/messaging`(FCM 기반, APNs 포함). `notification.md` 3 · `onboarding-api.md` 4.9 — 토큰은 "FCM/APNs 토큰". `legal/review-2026-09-04.md` — "푸시 = FCM/APNs 확정".

### 바꿀 내용
- **앱**: `expo-notifications`로 권한·토큰을 다루고, 토큰은 **Expo 푸시 토큰**(`ExponentPushToken[...]`)이다. Firebase 설정 파일·`@react-native-firebase/*`를 쓰지 않는다. iOS APNs 키와 Android FCM 자격 증명은 **EAS 자격 증명**에 올린다(저장소에 커밋하지 않는다).
- **서버**: Expo Push API(`https://exp.host/--/api/v2/push/send`)로 보낸다. 100건 단위 묶음 발송, **발송 뒤 receipt를 조회해** `DeviceNotRegistered`면 토큰을 무효화한다(FCM `UNREGISTERED`·APNs `410` 문구 대체). Expo access token(보안 발송)을 Secrets Manager에 둔다.
- `onboarding-api.md` 4.9 — `push_token` 예시를 `"ExponentPushToken[...]"`로, 비고에 "Expo 푸시 토큰"을 적는다. **계약 필드는 그대로다**(문자열 하나).
- `domain.md` 3.6 `device_tokens.token` — 변경 없음(varchar). 형식만 바뀐다.

### 사유
- 3인 팀이 Expo(EAS) 관리형으로 앱을 만든다. FCM 직접은 Firebase 프로젝트·네이티브 설정 파일·서비스 계정 비밀값이 더 필요하고, Expo Push는 플러그인 + EAS 자격 증명으로 끝난다.
- 발송량이 작다(하루 1회 드립 알림). Expo의 제한(초당 600건)에 닿지 않는다.
- FCM 토픽 일괄 발송은 쓰지 않는다 — 대상 판정은 서버가 사용자별로 한다(공통 원칙 "판정은 서버").
- 대가: 발송 경로에 Expo 서버가 한 단계 끼고(장애 지점 +1), 무효 토큰을 receipt 조회로 늦게 안다.

### 법무 영향 — 함께 반영
- 푸시 토큰이 **Expo(650 Industries, Inc., 미국)** 를 거친다. 개인정보처리방침 6장 처리 위탁 표의 "푸시 알림 발송" 수탁자를 **Expo + Apple(APNs)·Google(FCM)** 로 적고, **6.1 개인정보의 국외 이전**(이전받는 자·국가·일시와 방법·항목·목적·보유 기간·거부 방법)을 신설한다. `legal/review-2026-09-04.md` 4의 "푸시 = FCM/APNs 확정" 문장을 고친다.

## 결정 2 — 드립 도착 알림은 **탐험 편까지 합쳐 하루 1건**

### 현재 규칙
`notification.md` 4.3 — "드립 편성 완료 직후 발송", 문구 "오늘의 콘텐츠 N편이 도착했어요". 탐험 편(`library_items.source = discovery`, `drip-scheduling.md` 4.8)을 N에 넣는지, 발송이 탐험 편성보다 먼저인지 정해져 있지 않다. 배치는 정규 2편 → 탐험 1편 순서라 **정규 직후에 보내면 탐험 편이 알림 뒤에 도착한다.**

### 바꿀 내용
- **발송 시점**: 그 사용자의 **탐험 편성까지 끝난 뒤**(성공·실패 무관) 1건을 보낸다. 하루 최대 1건 규칙은 그대로다 — 탐험 편 전용 알림을 따로 보내지 않는다.
- **N = 그날 적립된 정규 + 탐험 편수.** 문구는 합친 편수 하나로 둔다: "오늘의 콘텐츠 3편이 도착했어요" + 대표 콘텐츠 제목. 대표는 정규 편 중 첫 번째, 정규가 0편이면 탐험 편.
- **발송 조건**: N ≥ 1. 탐험 편성이 실패하면 정규 편수만으로, 정규가 0편이고 탐험만 들어와도 보낸다.
- 딥링크 규칙은 그대로(1편 → 콘텐츠, 2편 이상 → 라이브러리). 탐험 편은 라이브러리 [이어 PICK] 뷰의 "이런 주제는 어떠신가요?" 구획에 보인다(`library.md` 4.6-1).
- 완료 조건: "드립 2편이 편성된다 → 알림 1건" 항목 옆에 "정규 2편 + 탐험 1편 → '3편이 도착했어요' 1건"을 추가한다.

### 사유
- 탐험 편도 "이어가 보내준 것"이다 — 라이브러리 도착 배너가 이미 탐험 편을 카운트에 포함한다(`library.md` 4.6, 개정 2026-08-27). 알림과 배너가 같은 사건을 다른 숫자로 세면 안 된다.
- 탐험 편은 취향 밖 콘텐츠를 **알고 들어오게** 하는 슬롯인데, 알림 뒤에 조용히 쌓이면 노출 기회가 줄어든다.

## 완료 조건

- Given `frontend/architecture.md` 2 · `notification.md` 3·7 · `onboarding-api.md` 4.9 / When 푸시 수단·토큰 형식을 읽는다 / Then Expo Push · Expo 푸시 토큰으로 적혀 있고 FCM 직접·`@react-native-firebase/messaging` 문구가 없다
- Given `notification.md` 4.3 / When 발송 시점과 편수를 읽는다 / Then "탐험 편성까지 끝난 뒤 1건, N = 정규 + 탐험"이 적혀 있다
- Given `notification.md` 8 / When 완료 조건을 본다 / Then 정규 2 + 탐험 1 → 알림 1건("3편") 조건이 있다
- Given `legal/privacy-policy-draft.md` 6 / When 푸시 수탁자 행을 본다 / Then Expo가 수탁자로 적혀 있고 6.1에 국외 이전 항목이 있다
