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

이 티켓은 **KAN-120(FE 구독 결제 화면) 2단계의 선행**이다(Jira `blocks` 링크).

## 완료 조건

- Given Play Console / When 구독 상품 목록을 본다 / Then 상품 2개가 활성 상태다
- Given 서버 DB / When 상품 표를 조회한다 / Then 두 상품 ID가 티어에 매핑돼 있다
- Given 라이선스 테스터 계정 / When 구매·갱신·취소·환불·복원을 차례로 한다 / Then 각 단계에서 서버 구독 상태와 `users.tier`가 기대값으로 바뀌고, 결과가 처리 기록에 적혀 있다
