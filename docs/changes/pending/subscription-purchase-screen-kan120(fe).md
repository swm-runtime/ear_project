# 구독 결제 화면(KAN-120) 반영에 따른 문서 정정 — 노출 가드 · 만료 안내 · 영수증 재시도 큐 · 의존 표

| 항목 | 값 |
|---|---|
| 대상 문서 | `features/paywall.md` 4.5 · `features/subscription.md` 5장 · `frontend/architecture.md` 2.1·4.4·5.4 · 루트 `CLAUDE.md` 파일별 인덱스(`spec/uiux/`) |
| 요청 파트 | 프론트엔드 |
| 요청자 | 이주호(프론트엔드) |
| 발행 날짜 | 2026-10-06 |
| 관련 티켓 | `tickets/frontend/pending/subscription-purchase-screen.md`([KAN-120](https://runtime364.atlassian.net/browse/KAN-120)) — 1단계 코드 반영, 묶음 빌드 대기 |

## 수정 내용

**A. `features/paywall.md` 4.5 — 노출 가드가 세 겹이다**

- 지울 것: "코드는 `IS_SUBSCRIPTION_UI_ENABLED`(`shared/lib/feature-flags.ts`, 기본 꺼짐, `EXPO_PUBLIC_SUBSCRIPTION_UI=on`으로 켬) 하나로 갈린다."
- 넣을 것: "코드는 `IS_SUBSCRIPTION_UI_ENABLED`(`shared/lib/feature-flags.ts`) 하나로 갈리고, 그 값은 **세 겹이 전부 열려야 켜진다** — ① 빌드 플래그 `EXPO_PUBLIC_SUBSCRIPTION_UI=on`(기본 꺼짐) ② 결제 네이티브 모듈(`ExpoIap`)이 바이너리에 있다(런타임 검사 — 플래그가 켜진 번들이 OTA 로 모듈 없는 옛 바이너리에 닿아도 꺼진다) ③ iOS, 또는 Android + `EXPO_PUBLIC_SUBSCRIPTION_ANDROID=on`(Play 상품 등록 KAN-130 전까지 꺼 둔다). 구성·카피는 `spec/uiux/subscription-uiux.md` PW1."
- "되돌리는 조건" 문장을 "KAN-40 + FE 결제 라이브러리(expo-iap, KAN-120) + 스토어 IAP 상품 등록이 끝난 **묶음 빌드(runtimeVersion 32)** 에서 플래그를 켠다 — `eas.json` 프로필 env 와 `eas-update.yml` OTA env 에 같은 값"으로 바꾼다.
- 5장 "결제 성공" 행에 "자동 재생은 재생 게이트가 다시 요청한다 — 서버가 다시 판정한다"를 덧붙인다.

**B. `features/subscription.md` 5장 — "만료됨" 행**

- "만료됨 — 미구독 상태와 동일 + '구독이 종료되었어요' 안내"는 지금 계약으로 그릴 수 없다. `GET /users/me/subscription` 의 `plan.status` 는 `free`·`subscribed`·`cancel_scheduled`·`grace` 4분기라 만료와 한 번도 구독하지 않은 상태가 같다.
- 결정 요청(둘 중 하나): ① 행을 "미구독 상태와 동일"로 줄인다(안내 없음) ② 서버가 `plan` 에 직전 구독 만료 정보를 싣는다(`profile-api.md` 4.1 · `subscription-api.md` 4.2 계약 추가 — 백엔드 소유). FE 는 결정 전까지 ①로 그린다.

**C. `frontend/architecture.md`**

- 5.4 OfflineQueue 표의 "영수증 검증 — 성공할 때까지 무기한 재시도"에 구현 방식을 덧붙인다: "**SQLite 큐에 영수증을 적재하지 않는다 — 스토어가 끝나지 않은 거래를 보관하는 것이 곧 큐다.** iOS 는 서버 200 전까지 `finish` 하지 않고, Android 는 앱이 확인(acknowledge)하지 않으므로 거래가 스토어에 남는다. 세션 중에는 결제 서비스가 간격을 늘려(5초→15초→30초→1분→5분 반복) 다시 제출하고, 앱 재실행·포그라운드 복귀 때 미완료 거래를 다시 제출한다(`features/subscription/services/purchase.service.ts`). 영수증 원문을 기기 저장소에 쓰지 않는다(convention.md 9장)."
- 4.4 의존 표에 행 추가: "subscription | (없음) | 결제·구독 관리·페이월 요금제 비교. 이메일 인증 화면 열기·다른 feature 캐시 무효화·로그인 전이는 `app/bootstrap` 이 주입한다(`registerEmailVerificationOpener` · `registerSubscriptionChangedListener` · `resumeSubscriptionSync`/`stopSubscriptionSync`)". player 행의 "차단 시 페이월 시트 표시"는 "한도 안내 시트에 `PaywallPlansSection` 을 얹는다 — 결제 확정 뒤 재생은 게이트가 다시 요청한다(store 의 resume 콜백)"로 구체화한다.
- 2.1 `runtimeVersion` 이력 표에 "`32` | (묶음 빌드 날짜) | `expo-iap` 추가(KAN-120) + KAN-118·KAN-124·KAN-103" 행을 묶음 빌드 때 넣는다.

**D. 루트 `CLAUDE.md` — 파일별 인덱스**

- `spec/uiux/` 항목에 "구독·페이월 `subscription-uiux.md`(SB1–SB3 · PW1, 2026-10-06 — KAN-120)"를 추가한다(현재 "화면 9종 전부 작성됨"만 있다).

## 사유

KAN-120 1단계(iOS StoreKit 2) 코드가 들어가면서 노출 조건이 플래그 하나에서 세 겹(플래그·결제 모듈·플랫폼)으로 바뀌었고, 영수증 재시도는 SQLite 큐가 아니라 스토어의 미완료 거래로 구현했다. 문서가 옛 서술로 남으면 다음 사람이 가드를 플래그 하나로 되돌리거나 영수증을 기기에 저장하는 큐를 새로 만든다. `features/`·루트 `CLAUDE.md` 는 FE 단독 소유가 아니고 `frontend/architecture.md` 도 개발 중 직접 고치지 않는 규칙이라 여기 기록한다(루트 `CLAUDE.md` 요청 문서 규칙). FE 소유인 `spec/uiux/subscription-uiux.md` 는 이 PR 에서 새로 썼다.

## 완료 조건

- Given `features/paywall.md` 4.5 / When 노출 조건을 읽는다 / Then 빌드 플래그·결제 네이티브 모듈·플랫폼 세 겹이 적혀 있고 "하나로 갈린다"만 남아 있지 않다
- Given `features/subscription.md` 5장 / When "만료됨" 행을 읽는다 / Then B 의 결정(① 또는 ②)대로 적혀 있고, ②면 `subscription-api.md` 에 필드가 있다
- Given `frontend/architecture.md` 5.4 / When 영수증 재시도를 읽는다 / Then 스토어의 미완료 거래가 큐이고 영수증을 기기에 저장하지 않는다고 적혀 있다
- Given `frontend/architecture.md` 4.4 / When 의존 표를 읽는다 / Then subscription 행이 있고 player 행이 PaywallPlansSection 의존을 말한다
- Given 루트 `CLAUDE.md` / When `spec/uiux/` 인덱스를 읽는다 / Then `subscription-uiux.md` 가 있다
