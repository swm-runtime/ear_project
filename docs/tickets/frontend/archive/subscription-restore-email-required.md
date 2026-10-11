# [FE] 구매 복원이 409 `EMAIL_REQUIRED_FOR_PURCHASE` 면 이메일 등록·인증 화면으로 보낸다

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/features/subscription/services/purchase.service.ts`(`restore` · `toFailure`) · `hooks/purchase-feedback.ts`(`toRestoreFeedback`) · 복원을 부르는 화면(요금제 관리·페이월의 [구매 복원]) |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현(BE) |
| 담당 | 이주호(FE) |
| Jira | [KAN-169](https://runtime364.atlassian.net/browse/KAN-169) |
| 발행 날짜 | 2026-10-11 |
| 시작 날짜 | 2026-10-11 |
| 기한 | 2026-10-16 (Low — 이번 주 안) |
| 선행 | 없음 — 서버 관문은 #1435(dev 머지 2026-10-11)로 이미 들어가 있다 |
| 중요도 | Low — 이메일 없는 계정 + 복원이라는 드문 경로. 지금은 일반 실패 문구가 뜰 뿐 데이터가 깨지지는 않는다 |

## 배경

백엔드 전체 감사(2026-10-11)에서, 이메일 없는 카카오·네이버 계정이 [구매 복원]으로 구독을 연결하면 결제 이력이 생겨 탈퇴가 막히는 문제가 나왔다. 서버는 이제 **복원할 거래가 1건 이상인데 인증된 이메일이 없으면 409 `EMAIL_REQUIRED_FOR_PURCHASE`** 를 돌려준다(`spec/api/subscription-api.md` 4.5 — 결제 의도 4.3과 같은 코드·같은 의미). 빈 배열(복원할 것 없음)은 종전대로 200 이다.

지금 앱의 복원 흐름은 이 코드를 따로 처리하지 않아 `toFailure` 에서 `'unknown'` 이 되고 **"결제를 완료하지 못했어요. 잠시 후 다시 시도해주세요"** 가 뜬다 — 재시도해도 같고 이메일을 등록하라는 안내가 없다.

## 요청

- 복원 응답이 409 `EMAIL_REQUIRED_FOR_PURCHASE` 면 결제 흐름(`createIntent` 의 `emailRequired`)과 같이 다룬다 — 이메일 등록·인증 화면(`auth.md` 4.4)으로 보내고, 완료 후 돌아와 다시 복원할 수 있게 한다. 문구는 결제와 같은 `SUBSCRIPTION_COPY.result.emailRequired` 를 쓰거나 복원용으로 정한다(uiux 소유).
- 판정은 서버가 한다 — 앱이 `is_email_verified` 로 [구매 복원] 버튼을 미리 막지는 않는다(복원할 것이 없으면 이메일 없이도 200 이라, 미리 막으면 "복원할 구독 없음" 안내까지 막힌다).

## 문서에 옮겨 적을 것

`changes/archive/subscription-restore-email-required.md` — `features/subscription.md` 4.6 · `spec/uiux/subscription-uiux.md` 복원 상태에 "이메일 인증 필요" 추가.

## 완료 조건

- Given 인증된 이메일이 없는 계정, When 스토어에 유효한 구독이 있는 상태로 [구매 복원]을 누르면, Then 이메일 등록·인증 화면으로 안내되고 일반 실패 문구("결제를 완료하지 못했어요")는 뜨지 않는다
- Given 이메일 인증을 마친 뒤, When 다시 [구매 복원]을 누르면, Then 복원이 정상 진행된다(토스트 "구독이 복원되었어요")
- Given 인증된 이메일이 없는 계정, When 스토어에 유효한 구독이 없는 상태로 [구매 복원]을 누르면, Then 종전대로 "복원할 구독이 없어요"

## 처리 기록

- 반영 날짜: 2026-10-11 — `purchase.service` 복원이 409 `EMAIL_REQUIRED_FOR_PURCHASE` 를 `emailRequired` 결과로 돌려주고(일반 실패 `unknown` 으로 떨어지지 않음), `usePurchaseFlow.restore` 가 토스트 "구독을 복원하려면 이메일 인증이 필요해요" → 페이월 시트 잠시 내림(`onEmailGate`) → 이메일 등록·인증 화면을 연다. 인증 후 돌아오면 페이월이 다시 열리고(종전 결제 흐름의 reopen) [구매 복원]을 다시 누른다 — 복원은 이어서 할 요금제가 없어 자동 재시도하지 않는다. 버튼을 이메일 상태로 미리 막지 않는다(빈 복원은 200). 단위 테스트 추가(`purchase.service.test.ts`). 문서: `features/subscription.md` 4.6·상태 표, `subscription-uiux.md` 결과 안내 표
