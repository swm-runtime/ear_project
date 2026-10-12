# 구독 — 구매 복원의 이메일 인증 관문 상태

| 항목 | 값 |
|---|---|
| 대상 문서 | `features/subscription.md` 4.6(구매 복원) · 화면 상태 표 · `spec/uiux/subscription-uiux.md`(복원 결과 상태·카피) |
| 요청 파트 | 백엔드(규칙) · 프론트엔드(화면 — `tickets/frontend/archive/subscription-restore-email-required.md`) |
| 발행 날짜 | 2026-10-11 |
| 시작 날짜 | 2026-10-11 |
| 기한 | 2026-10-16 (Low) |
| 선행 | 없음 |

## 배경

2026-10-11 감사 — 이메일 없는 계정이 복원으로 결제 이력을 가지면 탈퇴가 막혔다. 서버가 복원에도 결제 의도와 같은 이메일 관문을 둔다(`spec/api/subscription-api.md` 4.5에 반영됨, #1435). 규칙의 원본인 features·uiux 에는 아직 없다.

## 옮겨 적을 것

- `features/subscription.md` 4.6: "보낼 거래가 1건 이상이면 이메일 인증이 필요하다(4.3과 같은 관문). 없으면 이메일 등록·인증으로 보낸다. 복원할 것이 없으면 이메일 없이도 '복원할 구독이 없어요'."
- 화면 상태 표(복원 성공·결과 없음 옆)에 "복원 — 이메일 인증 필요" 행.
- `subscription-uiux.md`: 같은 상태의 카피·이동(FE 티켓에서 정한 값).

## 완료 조건

- Given 문서 반영 후, When `features/subscription.md` 4.6 을 읽으면, Then 복원의 이메일 인증 관문과 빈 복원 예외가 적혀 있다
- Given 문서 반영 후, When `subscription-uiux.md` 복원 상태를 읽으면, Then "이메일 인증 필요" 상태의 카피·이동이 적혀 있다

## 처리 기록

- 반영 날짜: 2026-10-11 — `features/subscription.md` 4.6 에 복원 이메일 관문·빈 복원 예외, 화면 상태 표에 "복원 — 이메일 인증 필요" 행. `spec/uiux/subscription-uiux.md` 4.3 결과 안내 표에 같은 상태의 카피("구독을 복원하려면 이메일 인증이 필요해요")·이동. FE 티켓(KAN-169)과 같은 PR
