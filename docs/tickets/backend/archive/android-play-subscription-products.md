# [BE] 안드로이드 구독 상품 등록 — Play Console 상품 생성·서버 등록·결제 종단 테스트

| 항목 | 값 |
|---|---|
| 대상 | Play Console 구독 상품 · 서버 상품 ID 등록 · Play 영수증 검증·RTDN 종단 테스트 |
| 요청 파트 | 백엔드 |
| 요청자 | 이주호(PM) |
| 담당 | 박준현 |
| Jira | [KAN-130](https://runtime364.atlassian.net/browse/KAN-130) |
| 발행 날짜 | 2026-10-05 |
| 시작 날짜 | 2026-10-05 |
| 기한 | 2026-10-09 (Low — 이번 주 안) |
| 선행 | 없음(티켓). 결제 라이브러리가 든 Android 빌드 업로드(KAN-120 2단계 — Play Console 상품 메뉴가 그 뒤에 열린다. 상태: 미완) |
| 근거 문서 | `features/subscription.md` · `spec/api/subscription-api.md` · `tickets/frontend/pending/subscription-purchase-screen.md`(KAN-120) |
| 중요도 | Low — PM 발행(2026-10-05). 중요도 미지정이라 이번 주 마감으로 잡았다 — 바꾸려면 Jira·이 표를 함께 고친다 |
| 상태 | 대기 |

## 무엇을 한다

1. Play Console에 구독 상품 2개를 만든다(iOS 상품과 같은 티어 구성)
2. 상품 ID를 서버 DB에 등록한다
3. dev에 반영된 Play 영수증 검증·RTDN 수신으로 **종단 테스트** — 라이선스 테스터 계정으로 구매 → 티어 반영 → 갱신 → 취소 → 환불 → 복원
4. **한 계정에 살아 있는 Play 구독 둘을 막는 서버 안전망**(추가 2026-10-07 — 백엔드 검증 하 7번). Apple은 구독 그룹이 "하나만"을 보장하지만 **Google은 Pro·Daily가 독립 정기 결제라 둘 다 살 수 있다.** 정상 경로는 앱이 요금제 변경 때 이전 구매 토큰을 넘겨 교체(Google이 `linkedPurchaseToken`을 붙여 주고 서버가 같은 행에 이어 붙인다 — 이미 구현)지만, 앱이 교체 없이 새로 사 버리면 서버가 두 번째 구독을 그대로 받는다. 규칙(문서 먼저 — `subscription-api.md` 4.4·7장): 같은 스토어에 **다른 `original_transaction_id`의 살아 있는 행**이 이미 있고 새 구매에 `linkedPurchaseToken`이 없으면 영수증 제출을 `SUBSCRIPTION_STORE_MISMATCH`와 같은 계열의 409로 거부하고 Slack 결제 알림에 올린다(사용자는 Play에서 환불). 결제 의도 생성(4.3) 단계에서도 같은 조건이면 "변경은 교체로" 안내 코드를 돌려준다. iOS에는 해당 없음(Apple이 막는다)

이 티켓은 **KAN-120(FE 구독 결제 화면) 2단계의 선행**이다(Jira `blocks` 링크).

## 완료 조건

- Given Play Console / When 구독 상품 목록을 본다 / Then 상품 2개가 활성 상태다
- Given 서버 DB / When 상품 표를 조회한다 / Then 두 상품 ID가 티어에 매핑돼 있다
- Given 라이선스 테스터 계정 / When 구매·갱신·취소·환불·복원을 차례로 한다 / Then 각 단계에서 서버 구독 상태와 `users.tier`가 기대값으로 바뀌고, 결과가 처리 기록에 적혀 있다
- Given 살아 있는 Play 구독(Pro)이 있는 계정 / When 교체 없이 Daily 구매 토큰을 제출한다(`linkedPurchaseToken` 없음) / Then 409로 거부되고 Slack 결제 알림에 한 줄이 오며, 기존 Pro 행은 그대로다
- Given 같은 계정 / When 교체로 산 Daily 토큰(`linkedPurchaseToken` = Pro 토큰)을 제출한다 / Then 같은 구독 행이 Daily로 바뀐다(행이 늘지 않는다)

## 처리 기록

- **2026-10-08 — 결제 종단 실측 완료 · 반영 날짜 2026-10-08 — 완료** (개발계 dev 앱 `dev.runtime.ear` · 라이선스 테스터 · 앱 vc 34)
  | 완료 조건 | 결과 |
  |---|---|
  | 상품 2개 활성 · 서버 매핑 | Play Console `dev.runtime.ear.sub.daily.monthly`·`pro.monthly` 활성, `plans` 매핑 — 아래 실측이 전부 이 상품으로 돌았다 |
  | 구매 | 13:55·14:06·14:22 Daily/Pro 구매 → 행 생성·`users.tier` 반영·확인(acknowledge) |
  | 갱신 | 테스트 구독 5분 주기 RTDN 2 → 만료일 연장(14:32·14:37·14:42…) |
  | 취소 | 14:08·14:38 스토어 해지(RTDN 3) → `cancelled`·만료일까지 유지, 14:39 재구독(RTDN 7) → `active` 복귀 |
  | 환불 | 10-08 오전 실결제 건 환불 뒤 Play API revoke → `refunded`·티어 무료(KAN-158 댓글 기록) |
  | 복원 | 14:57 재설치·같은 계정 로그인 → [구매 복원] → `restored: 1`, 기존 행에 그대로 연결(행 늘지 않음) |
  | 교체 없는 두 번째 구독 409 | 서버 거부·미확인은 `play-billing.spec`(4.4 묶음)과 개발계 로그로 확인. **Slack 결제 알림은 개발계에 웹훅이 없어 운영에서만 보인다** — 운영 첫 실결제 때 확인 |
  | 교체(`linkedPurchaseToken`) → 같은 행 | Daily→Pro 업그레이드·Pro→Daily 예약 모두 같은 행(KAN-158 최종 재실측 14:03~14:08) |
- 실측 중 고친 서버 결함(전부 dev 머지): #1277 교체된 옛 토큰의 만료 알림이 새 구독을 끝내던 것 · #1281·#1282 예약 다운그레이드가 해지 예약으로 저장되던 것 · #1284 해지 예약 중에도 Light 선택(팀 결정) · #1287 요금제를 여러 번 바꾼 뒤 옛 토큰 만료 알림이 거짓 "두 번째 구독" 경보를 내던 것.
- **운영 반영 전제**: 위 서버 수정은 다음 dev → main 배포에 함께 나가야 결제 오픈이 안전하다.

- **2026-10-08 00:11 — 개발계 Play 연결 완료(dev 앱 `dev.runtime.ear`).** ① 운영 Secrets의 서비스 계정 키·push 계정을 개발계 `ear/dev/api`로 복사하고 `GOOGLE_PLAY_PACKAGE_NAME=dev.runtime.ear` · `GOOGLE_PLAY_PUBSUB_AUDIENCE=https://api-dev.earcast.co.kr/api/v1/webhooks/play-store` 추가 → 재배포(workflow_dispatch) → 서버 env 확인 ② Pub/Sub 주제 `ear-play-rtdn-dev` + 푸시 구독 `ear-play-rtdn-dev-push`(엔드포인트 = audience = 위 주소, OIDC `ear-rtdn-push@…`, 지수 백오프, 확인 기한 60초, 만료 없음) + 주제 권한 `google-play-developer-notifications@system.gserviceaccount.com` 게시자 ③ Play Console dev 앱 실시간 개발자 알림에 주제 연결 → 테스트 알림 → Caddy 로그에 Google IP의 POST, 서버 `play store notification handled` 확인. 이로써 종단 테스트(3번)에 필요한 서버 쪽은 끝. 남은 선행: rt 32 Android 빌드(KAN-155) + 앱 `EXPO_PUBLIC_SUBSCRIPTION_ANDROID=on`(KAN-120 2단계). 운영 앱 상품 2개(`com.runtime.ear.sub.*`)는 운영 내부 테스트 트랙 업로드 뒤.
- 2026-10-07 — **4번 구현 완료**(문서 `subscription-api.md` 4.4·4.7·5장·7장 → 코드, 기록 `changes/archive/play-single-live-subscription.md`). 제출은 `SUBSCRIPTION_ALREADY_SUBSCRIBED` 409 + 미확인(3일 뒤 Google 자동 환불) + Slack, 알림은 반영·확인 없이 완료 처리. 복원은 거부하지 않는다. 남은 것은 종전 1~3번(사람 손 + 종단 테스트). dev 앱 Play 정기 결제 2개(`dev.runtime.ear.sub.pro.monthly` · `daily.monthly`) 생성·활성화 완료, 개발계 `plans.store_product_id_android` 반영 완료.
- 2026-10-07 — 4번(살아 있는 Play 구독 둘 방지 서버 안전망) 추가. dev 앱(`dev.runtime.ear`) Play Console에 정기 결제 2개(`dev.runtime.ear.subscription.pro.monthly` · `daily.monthly`, 기본 요금제 `monthly`) 생성 중(박준현). 결제 라이브러리가 든 Android 빌드의 내부 테스트 업로드는 KAN-155(rt 32 묶음 빌드)와 함께.
