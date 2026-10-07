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

- 2026-10-07 — 4번(살아 있는 Play 구독 둘 방지 서버 안전망) 추가. dev 앱(`dev.runtime.ear`) Play Console에 정기 결제 2개(`dev.runtime.ear.subscription.pro.monthly` · `daily.monthly`, 기본 요금제 `monthly`) 생성 중(박준현). 결제 라이브러리가 든 Android 빌드의 내부 테스트 업로드는 KAN-155(rt 32 묶음 빌드)와 함께.
