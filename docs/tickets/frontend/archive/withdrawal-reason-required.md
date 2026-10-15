# [FE] 탈퇴 사유를 필수로 — 사유를 고르지 않고는 탈퇴할 수 없게

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/features/auth/hooks/useWithdrawalScreen.ts`(`canSubmit` · `toggleReason`) · `frontend/src/features/auth/auth.copy.ts`(`reason.label`) · `frontend/src/features/auth/screens/WithdrawalScreen.tsx` · `frontend/src/features/auth/components/WithdrawalReasonRow.tsx`(주석) |
| 요청 파트 | 프론트엔드 |
| 발행 날짜 | 2026-10-14 |
| Jira | [KAN-205](https://runtime364.atlassian.net/browse/KAN-205) |
| 시작 날짜 | 2026-10-14 |
| 기한 | 2026-10-17 |
| 선행 | 없음 |
| 발견 시점 | PM 요청(2026-10-14) — 탈퇴 사유에 "미선택"이 남는 경우를 없앤다 |
| 근거 문서 | `features/auth.md` 67·150행 · `spec/api/auth-api.md` 4.7(383행) · `spec/uiux/auth-uiux.md` A7(181·191행) |
| 심각도 | 중 |
| 중요도 | Medium(3일 안) — PM이 중요도를 정하지 않아 기본값으로 잡았다. 바꾸려면 Jira와 이 표를 함께 고친다 |
| 상태 | **완료**(2026-10-15) |

## 문제

탈퇴 화면(A7)에서 사유는 선택 입력이다. 사유를 고르지 않아도 최종 확인 체크만 하면 [탈퇴하기]가 켜진다(`canSubmit`). 고른 사유를 다시 탭하면 선택이 풀린다(`toggleReason`). 그래서 사유 없이(`reason_code: null`) 탈퇴하는 경우가 생긴다. 서버 탈퇴 알림과 주간 지표에는 이런 탈퇴가 "사유 미선택"으로 잡혀, 탈퇴 이유를 알 수 없는 건수가 쌓인다.

## 요청 내용

1. **사유를 하나 고르기 전에는 [탈퇴하기]를 켜지 않는다.** `canSubmit`에 `reasonCode !== null` 조건을 더한다. 구독 만료 동의, 최종 확인 체크와 같은 활성화 조건이다.
2. **고른 사유를 다시 탭해도 선택이 풀리지 않게 한다.** 다른 사유를 탭하면 그 사유로 바뀌는 단일 선택 목록(라디오)으로 바꾼다.
3. **"(선택)" 표기를 뺀다.** `reason.label` "탈퇴 이유를 알려주세요 (선택)"을 "탈퇴 이유를 알려주세요"로 바꾼다. 화면의 "사유는 선택 입력" 주석도 고친다.
4. **문서를 같은 PR에서 고친다.**
   - `spec/uiux/auth-uiux.md`: A7-a·A7-b의 "탈퇴 사유(선택)" → "탈퇴 사유(필수)". 버튼 활성화 규칙에 사유 조건을 더한다.
   - `spec/api/auth-api.md` 4.7: `reason_code`는 "클라이언트는 항상 보낸다(서버는 구버전 앱 호환을 위해 null도 받는다)"로 고친다.
   - `features/auth.md` 67·150행: 이 문서는 수정을 요청받아야 고칠 수 있으므로, PR에서 함께 고칠지 PM에게 확인한다.
5. 바꾸지 않는 것:
   - [기타]를 고르면 자유 입력 칸이 열린다. 입력은 지금처럼 선택이다.
   - MVP 바이너리에서 `price`를 빼는 규칙(KAN-66)은 그대로 둔다.
   - 서버(`reason_code` 선택 필드)는 그대로 둔다. 업데이트하지 않은 구버전 앱이 null을 보내기 때문이다. 그 앱들에서 들어오는 "사유 미선택" 알림은 계속 나올 수 있다.

## 완료 조건

- Given 탈퇴 화면에서 최종 확인 체크(활성 구독이면 만료 동의까지)를 마쳤고 사유는 고르지 않았다 / When 화면을 본다 / Then [탈퇴하기]는 비활성이다
- Given 사유 하나를 골랐고 확인 체크를 마쳤다 / When [탈퇴하기]를 누른다 / Then 요청 본문의 `reason_code`가 고른 값이고 null이 아니다
- Given 사유 하나를 골랐다 / When 그 사유를 다시 탭한다 / Then 선택이 유지된다
- Given 사유 A를 골랐다 / When 사유 B를 탭한다 / Then B만 선택된다
- Given 탈퇴 화면 / When 사유 그룹 제목을 본다 / Then "(선택)" 표기가 없다
- Given 이 PR / When `spec/uiux/auth-uiux.md` A7과 `spec/api/auth-api.md` 4.7을 연다 / Then 사유 필수 규칙이 적혀 있다

## 처리 기록

- 2026-10-14 발행(PM 요청).
- **2026-10-15 완료 — archive 로 옮긴다. 반영 날짜: 2026-10-15.** PR #1544(`fix(fe)/withdrawal-reason-required`).
  - 코드: `useWithdrawalScreen` 의 `canSubmit` 에 `reasonCode !== null` 을 더했고, `toggleReason` 은 다시 탭해도 풀리지 않는 단일 선택으로 바꿨다. `reason.label` 에서 "(선택)" 을 뺐고 화면·행 컴포넌트의 "선택 입력" 주석을 고쳤다. [기타] 자유 입력은 그대로 선택이다. 서버는 손대지 않았다.
  - 테스트: `useWithdrawalScreen.test.tsx` — 사유 미선택이면 비활성·요청 안 보냄, 사유+확인 체크면 활성, 활성 구독은 만료 동의까지 필요, 요청 본문 `reasonCode` 가 고른 값, 다시 탭해도 유지, A→B 전환(완료 조건 1~4).
  - 문서: `spec/uiux/auth-uiux.md` 4.5(A7-a·A7-b "탈퇴 사유(필수)" + 버튼 활성 조건) · `spec/api/auth-api.md` 4.7(`reason_code` 클라이언트는 항상 보냄) · `features/auth.md` 3장 탈퇴 표·4.3-3 — `features/auth.md` 는 PM 이 같은 PR 에서 고치도록 승인했다(요청 4의 확인 항목).
