# "구독 관리" 화면 이름 → "요금제 관리" + 화면 골격 개편 반영

| 항목 | 값 |
|---|---|
| 대상 문서 | `features/subscription.md`(2장 진입점·4.6 복원 위치·5장 화면 구성) · `features/settings.md` 4.1 표(구독 행) · `features/profile.md` 4.2 표·본문 · `features/auth.md` 4.8(탈퇴 안내 — 해지 진입점) · `spec/api/subscription-api.md`(4.1 앞 설명·4.4 복원 진입점·흐름도) · `spec/api/settings-api.md`·`spec/api/profile-api.md`(흐름도의 목적지 이름) · `wireframe/auth.html`(탈퇴 안내 문구) |
| 요청 파트 | 프론트엔드 |
| 요청자 | 이주호(PM) |
| 발행 날짜 | 2026-10-06 |
| 관련 티켓 | `tickets/frontend/archive/plan-management-redesign-pill-buttons.md`([KAN-146](https://runtime364.atlassian.net/browse/KAN-146)) — 코드·`spec/uiux`·`design.md` 반영 완료 |

## 수정 내용

1. **화면 이름** — 위 문서의 "구독 관리"(이 앱의 화면을 가리키는 경우)를 **"요금제 관리"**로 바꾼다. 설정의 진입 항목 이름도 "구독" → "요금제 관리"다(진입점과 화면 제목을 같게).
   - 바꾸지 않는 것: **스토어의** 구독 관리 화면("스토어 구독 관리 화면으로 딥링크" 등) — 그건 Apple·Google 화면 이름이다.
   - `features/auth.md` 148 "해지 진입점은 설정 > 구독 관리에 이미 있다" → "설정 > 요금제 관리". 앱 문구(`auth.copy.ts` 탈퇴 안내 "해지는 설정 > 요금제 관리에서 할 수 있어요.")는 이미 바꿨다 — `wireframe/auth.html` 428 의 같은 문구도 맞춘다.
2. **복원 위치** — `features/subscription.md` 103 "설정 > 구독 관리 > [구매 복원], 페이월에도 복원 링크 노출" → "요금제 관리·페이월 맨 아래 **'이용약관 · 개인정보처리방침 · 구매 복원'** 줄의 [구매 복원](스토어 심사 요건)". `subscription-api.md` 288 도 같은 표현으로.
3. **화면 구성** — `features/subscription.md` 5장(요금제 목록 / 구독 관리 화면)에 "현재 구독" 섹션이 따로 있다고 적혀 있으면, **현재 구독 정보(다음 결제일·해지 예약·결제 문제·[구독 해지] 등)는 이용 중 요금제 카드(`action = current`) 안**에 둔다고 고친다(카드는 회색, 버튼은 평소 색). 서버가 `current` 카드를 주지 않는 구독자는 카드 목록 아래 별도 면. 상세는 `spec/uiux/subscription-uiux.md` 4.1.
4. **필수 표기 문구** — `features/subscription.md` 의 "스토어 정책상 필수 표기" 항목(152)은 요건 목록이라 그대로 두되, 확정 문구는 `subscription-uiux.md` 4.5(2026-10-06 PM 확정 — 세 줄, "App Store 결제"·"Google Play 결제" 표기, 글머리 내어쓰기)를 가리키게 한다.

## 사유

KAN-146(PM 미리보기 확정 2026-10-06)으로 화면 제목·설정 항목 이름이 "요금제 관리"로 바뀌고 "현재 구독" 섹션이 없어졌다. `spec/uiux/`·`design.md`·코드는 같은 PR 에서 고쳤지만 `features/`·`spec/api/`는 FE 단독 소유가 아니라 개발 중 직접 고치지 않고 여기 기록한다(루트 `CLAUDE.md` 요청 문서 규칙). 그대로 두면 문서를 보고 다시 "현재 구독" 섹션이나 "구독 관리" 이름을 만들게 된다.

## 완료 조건

- Given 위 대상 문서 / When "구독 관리"를 찾는다 / Then 이 앱의 화면을 가리키는 곳은 모두 "요금제 관리"이고, 남은 것은 스토어 화면을 가리키는 곳뿐이다
- Given `features/subscription.md` / When 복원 진입점·화면 구성을 읽는다 / Then 약관 줄의 [구매 복원]과 이용 중 카드 안의 구독 정보로 적혀 있다
- Given `wireframe/auth.html` / When 탈퇴 안내 문구를 본다 / Then "설정 > 요금제 관리"다

## 처리 기록

- **반영 날짜: 2026-10-09** — 브랜치 `docs/apply-changes-pending-1009`. 대상 문서 전부 반영(features subscription·settings·profile·auth, spec/api subscription·settings·profile, wireframe/auth.html). 스토어 화면을 가리키는 "스토어 구독 관리 화면"(subscription.md 93 · subscription-api.md 28)은 그대로.
