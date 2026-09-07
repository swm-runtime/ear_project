# [changes] 재동의 화면이 어느 문서에도 없다 — `pending_consents`를 받을 화면을 정해야 한다

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/uiux/auth-uiux.md`(화면 ID 신설) · `features/auth.md` 7 · `spec/api/auth-api.md` 4.1·5 |
| 발행 날짜 | 2026-09-07 |
| 발견 시점 | `tickets/frontend/pending/age-confirmation-send.md`의 완료 조건 3을 닫으려다 — **렌더할 화면이 문서에 없다** |
| 요청 성격 | **문서 신설**(코드 아님). 화면이 정의되기 전에는 FE가 만들 수 없다 |

## 문제

계약과 데이터는 이미 다 있다.

| 층 | 상태 |
|---|---|
| 서버 응답 | `POST /auth/social-login` 응답에 `pending_consents`가 있다(`auth-api.md` 4.1 — 153·188행) |
| 전송 경로 | `POST /users/me/consents`가 재동의를 받는다(`auth-api.md` 5 — 62·293행) |
| 판정 규칙 | 서버가 `consents` 최신 버전과 현행 버전을 비교한다(`auth.md` 7 — 328행) |
| 클라이언트 타입 | `auth.types.ts`의 `pendingConsents: RequiredConsent[]`, `auth.api.ts:129` 매핑까지 되어 있다 |
| **화면** | **없다** |

`auth-uiux.md`가 가진 화면은 **A1–A19**이고, 그중 재동의를 그리는 화면이 없다. A4(약관 동의)는
**신규 가입 경로 전용**이라 그대로 재사용할 수 없다 — 재동의는 이미 로그인된 사용자가 보는
화면이고, 항목이 전체가 아니라 `pending_consents`에 담긴 것만이며, 거절했을 때의 행선지도 다르다.

그래서 클라이언트는 지금 **응답을 받고 버린다.**

```ts
// useStartScreen.ts:75
// TODO(auth): pendingConsents가 있으면 재동의 화면으로 보낸다(auth-api.md 4.1 — /users/me/consents)
```

## 왜 지금 문제인가

`age_confirmation`(만 18세 이상 자기 선언)이 2026-09-06에 가입 필수 동의로 추가됐다.
`auth-api.md` 240행이 정한 대로 **이력이 없는 기존 사용자는 로그인 응답 `pending_consents`로
한 번 확인을 요구받는다.** 받을 화면이 없으니 그 확인이 영원히 일어나지 않는다.

지금은 테스트 계정만 해당해서 서비스 지장이 없다. 다만 **약관은 앞으로 반드시 개정된다.**
개정 시점에 이 구멍은 "기존 사용자 전원의 재동의가 기록되지 않는다"가 된다.

## 요청 내용 — 정해야 하는 것

1. **화면을 신설한다.** `auth-uiux.md`에 화면 ID를 부여하고(A20 계열 제안) 상태·카피·접근성을 적는다.
   A4를 재사용할지, 별도 화면으로 둘지부터가 결정 사항이다.
2. **거절 경로를 정한다.** 필수 동의를 거절하면 어떻게 되는가 — 로그아웃인지, 앱을 못 쓰는지,
   다음 실행에 다시 묻는지. `features/auth.md`가 소유할 규칙이다. **이것이 가장 중요한 미결이다.**
3. **표시 시점을 정한다.** 로그인 직후 즉시인지, 실행 관문(`splash.md`)의 한 단계인지.
   `splash.md`의 4단계 판정과의 순서를 명시해야 FE가 배치할 자리를 안다.
4. **`age_confirmation`의 표현을 정한다.** 열람할 문서가 없어 `version`이 `null`이다 —
   약관 개정 재동의(문서 링크 있음)와 한 화면에 섞일 때 어떻게 그리는가.

## 완료 조건

- Given `auth-uiux.md` / When 재동의 화면을 찾는다 / Then 화면 ID·상태·확정 카피가 있고, A4와의 관계(재사용/별도)가 명시돼 있다
- Given `features/auth.md` / When 필수 동의 거절 경로를 찾는다 / Then 거절 시 동작이 하나로 적혀 있다
- Given 그 문서들 / When FE가 읽는다 / Then `useStartScreen.ts:75`의 TODO를 추가 질문 없이 구현할 수 있다

## 참고 — 이 문서가 닫아 주는 것

`tickets/frontend/pending/age-confirmation-send.md`의 완료 조건 3이 이 화면에 막혀 있다.
화면이 정의되면 그 티켓도 함께 닫힌다.

---

## 처리 기록

| 항목 | 값 |
|---|---|
| 반영 날짜 | 2026-09-07 (발행 당일 — 사용자가 4개 결정을 즉시 확정) |
| 반영 문서 | `spec/uiux/auth-uiux.md` **4.3-1 A20 신설** · 화면 목록 · 8장 · 9장 / `features/auth.md` 7 / `features/splash.md` 4 |
| 반영 코드 | `auth/screens/ReconsentScreen.tsx`(신규) · `auth/hooks/useReconsentScreen.ts`(신규) · `auth/api/auth.api.ts`(`submitConsents`) · `auth.mock.ts` · `auth.copy.ts` · `store/session.store.ts` · `services/session.service.ts` · `hooks/useStartScreen.ts` · `app/navigation/RootNavigator.tsx` · `navigation/types.ts` · `auth/index.ts` |

### 결정된 4가지

| 미결 | 확정 |
|---|---|
| 1. 화면 | **A4 재사용 안 함. 새 화면 A20** — 항목이 동적이고 헤더 문구가 다르다 |
| 2. 거절 경로 | **로그아웃.** 단 확인 다이얼로그를 먼저 띄운다. 탈퇴가 아니라 계정·데이터는 유지 |
| 3. 표시 시점 | **실행 관문의 한 단계**(`splash.md` 4 — 3단계). 로그인 직후만 잡으면 이미 로그인된 세션이 샌다 |
| 4. `age_confirmation` 표현 | **[보기] 없이 체크박스만** — 마케팅 동의와 같은 형태(`version`이 항상 `null`) |

### 구현에서 결정한 것

- **재동의 판정을 온보딩 판정보다 앞에 뒀다.** 뒤에 두면 관심사·커리어를 다 받은 뒤에야 동의를
  묻게 된다. `splash.md` 4의 단계 번호도 그렇게 다시 매겼다(재동의 3 → 온보딩 4 → 딥링크 5).
- **`pending_consents`를 세션 상태에 실었다.** 화면 파라미터로 넘기면 로그인 직후 경로에서만
  살아 있다. 관문이 매 진입 판정하려면 세션이 들고 있어야 한다.
- **성공 시 세션을 새로 시작하지 않는다.** 계정이 이미 있으므로 `clearPendingConsents()`만
  호출하면 관문이 다음 목적지로 넘긴다. A4가 `startSession`을 부르는 것과 다른 지점이다.
- 로그아웃 확인은 오늘 만든 `shared/ui/ConfirmDialog`를 재사용했다.

### 함께 정리한 것

`useTermsConsentScreen.ts`에 **모순되는 주석 두 개가 겹쳐 있었다** — 앞 블록이 "연령 확인은
서버 동의가 아니라 화면 게이트다"라고 적혀 있었는데, PR #150에서 정식 동의로 승격된 뒤의
사실이 아니다. 뒤 블록이 이미 올바른 설명이라 앞 블록만 지웠다.

### 남은 것

- **와이어프레임에 A19·A20이 없다.** `auth.html`은 A1–A18까지다. `auth-uiux.md` 9장 미결에 등재했다.
- **실기기 확인 필요** — 운영 DB 기준 `age_confirmation` 이력이 없는 사용자가 **9명**(전체 13명)
  이다. 전부 팀 테스트 계정이라 이 화면으로 재동의를 마치면 0이 된다.
