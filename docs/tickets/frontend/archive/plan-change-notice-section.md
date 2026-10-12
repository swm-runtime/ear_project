# [FE] 요금제 관리 — 예약된 변경 안내를 제목 아래 "알림 섹션"으로 옮긴다

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/features/subscription/screens/SubscriptionScreen.tsx` · `components/CurrentSubscriptionDetail.tsx`(이용 중 카드 안 문구) · `subscription.copy.ts` · `docs/spec/uiux/subscription-uiux.md`(SB1 상태 표) |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현 · 이주호(팀 결정 2026-10-08) |
| 담당 | 이주호 |
| Jira | [KAN-160](https://runtime364.atlassian.net/browse/KAN-160) |
| 발행 날짜 | 2026-10-08 |
| 시작 날짜 | 2026-10-08 |
| 기한 | 2026-10-11 (Medium — 3일 안) |
| 선행 | 없음 — 서버가 필요한 값을 이미 내려준다(아래). 함께 보면 좋은 것: KAN-158(Android 요금제 변경) 완료 · PR #1284(해지 예약 중에도 Light 선택 가능, 개발계 배포됨) |

## 배경

지금은 예약된 변경 안내가 **이용 중(Pro) 카드 안**에 들어간다 — 다운그레이드 예약이면 "N월 N일부터 Daily 요금제가 적용돼요", 해지 예약이면 "N월 N일까지 이용 가능해요". 카드 목록 안에 묻혀 "다음 결제부터 무엇이 바뀌는지"가 한눈에 안 보였다(2026-10-08 KAN-158 재실측에서 박준현 지적). 팀 결정: **요금제 관리 제목 바로 아래에 알림 섹션을 두고, 예약된 변경이 있을 때만 그 문구를 거기 띄운다.**

## 할 것

1. **알림 섹션** — 요금제 관리 화면 제목(헤더) 바로 아래, 카드 목록 위. **예약된 변경이 있을 때만** 그린다(없으면 자리도 차지하지 않는다).
2. **띄우는 경우와 문구** — 판정은 서버 값으로만 한다(티어명·기기 시각 판정 금지, 루트 CLAUDE.md):

| 상태(서버 `GET /users/me/subscription`) | 알림 문구(초안 — 확정 카피는 uiux 에서) |
|---|---|
| `pending_plan` 있음(다운그레이드 예약) | **"N월 N일부터 {pending_plan.plan_name} 요금제가 적용돼요"** (`pending_plan.effective_at`) |
| `plan.status = cancel_scheduled`(해지 예약) | **"N월 N일까지 {plan.plan_name}을 이용할 수 있어요. 이후 Light 요금제로 바뀌어요"** (`plan.expires_at`. "Light" 는 무료 요금제의 서버 `name` 을 쓴다 — 하드코딩 금지) |

3. **이용 중 카드 안의 같은 문구는 뺀다** — 한 화면에 같은 안내가 두 번 나오지 않게. 카드에는 "다음 결제일 N월 N일" 같은 현재 상태만 남긴다.
4. `grace`(결제 문제) 경고 면과 다른 스토어 안내는 **이번 범위가 아니다** — 지금 자리 그대로(필요하면 별도 결정).
5. `spec/uiux/subscription-uiux.md` SB1 상태 표(`subscribed`·`cancel_scheduled` 행)와 128행 "다운그레이드 예약 완료"를 새 위치로 고친다.

## 완료 조건

- Given Pro → Daily 예약(`pending_plan` 있음) / When 요금제 관리를 연다 / Then 제목 아래 알림 섹션에 "N월 N일부터 Daily 요금제가 적용돼요"가 보이고, Pro 카드 안에는 같은 문구가 없다
- Given 스토어에서 해지(해지 예약) / When 요금제 관리를 연다 / Then 알림 섹션에 "N월 N일까지 … 이후 Light 요금제로 바뀌어요"가 보인다
- Given 예약된 변경이 없다(구독 중·무료) / When 요금제 관리를 연다 / Then 알림 섹션이 없고 카드 목록이 제목 바로 아래에서 시작한다
- Given 예약 중 [구독 다시 시작] 또는 예약 취소 / When 화면이 구독 상태를 다시 읽는다 / Then 알림 섹션이 사라진다
- Given `subscription-uiux.md` / When 읽는다 / Then 알림 섹션의 위치·조건·카피가 적혀 있다

## 처리 기록

(담당자가 채운다)

## 처리 기록 (FE)

- 2026-10-08 반영(PR `feat(fe)/plan-change-notice-section`). 제목 아래 알림 섹션 — `scheduledChangeNotice`(서버 `pending_plan` · `cancel_scheduled`+`expires_at`, 무료 요금제 이름은 목록의 서버 `name`). 이용 중 카드 안의 같은 문구 제거. 알림이 있으면 제목 밑 일반 안내("요금제를 낮추면…")는 숨긴다. 해지 예약 문구는 조사 오류를 피하려 "{플랜명} 요금제를"로 썼다(티켓 예시의 "{plan_name}을"은 Pro·Daily 에 맞지 않는다). `subscription-uiux.md` SB1 갱신.
- **반영 날짜: 2026-10-08** — archive 로 옮김, Jira 완료.
