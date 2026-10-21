# [FE] 글로벌 — 동의 화면: 국외 이전 동의 항목 · 약관·처리방침 링크를 영어판으로

| 항목 | 값 |
|---|---|
| 대상 | 가입 동의 화면 · 설정의 약관·처리방침 링크 · `legal-urls.ts` |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현(테크리드) |
| 담당 | 이주호 |
| Jira | [KAN-216](https://runtime364.atlassian.net/browse/KAN-216) · 에픽 [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) |
| 발행 날짜 | 2026-10-15 |
| 시작 날짜 | 2026-10-15 |
| 기한 | 2026-10-18 (Medium) |
| 선행 | BE [KAN-215](https://runtime364.atlassian.net/browse/KAN-215) `global-cross-border-consent.md` · 랜딩 영어 약관·처리방침 운영 배포(상태: 완료 — 2026-10-15 `/en/terms/`·`/en/privacy/` 200, 국외 이전 앵커 `/en/privacy/#s6`·`/privacy/#s6` 2026-10-16 확인) |
| 관련 | [KAN-206](https://runtime364.atlassian.net/browse/KAN-206)(연령 동의 — 같은 화면) · [KAN-198](https://runtime364.atlassian.net/browse/KAN-198)(심사 제출 — 이 티켓이 막는다) · [KAN-197](https://runtime364.atlassian.net/browse/KAN-197)(`legal-urls.ts`) |
| 중요도 | Medium |
| 상태 | 완료 |
| 반영 날짜 | 2026-10-19 |

## 1. 국외 이전 동의 항목
- 서버 동의 목록(`required_consents` / `pending_consents`)에 `cross_border_transfer`가 오면 **필수 체크 항목**으로 그린다. 시장으로 하드코딩하지 않고 서버 목록대로 그린다(KR에는 오지 않는다).
- 문구 예: "I agree that my information is transferred to and processed in the Republic of Korea, and by service providers in other countries such as the United States, as described in the Privacy Policy." 확정 카피는 `spec/uiux`에 기록.
- 처리방침 6장(International transfers) 링크를 붙인다.

## 2. 약관·처리방침 링크를 영어판으로
- 응답 `user.market === 'global'`(가입 전에는 고른 콘텐츠 언어)이면 동의 화면·설정의 링크를 `https://earcast.co.kr/en/terms/`, `https://earcast.co.kr/en/privacy/`로 연다. KR은 지금 링크 그대로.
- 앱 안에 영어 약관·처리방침 링크가 있어야 Apple 3.1.2 심사를 통과한다 — 그래서 KAN-198을 막는다.

## 완료 조건
- Given GLOBAL 가입 / When 동의 화면 / Then 국외 이전 항목이 필수로 보이고 약관·처리방침 링크가 영어판으로 열린다
- Given KR 가입 / Then 종전과 같다(국외 이전 항목 없음, 한국어 링크)
- Given 설정의 약관·처리방침 / Then 시장에 맞는 언어로 열린다

## 처리 기록
- 2026-10-15 발행(마크다운 + Jira).
- 2026-10-16 FE 반영(브랜치 `feat(fe)/global-consent-cross-border` — PR로 dev). **BE가 아직이라 `pending/`에 둔다.**
  - **화면 순서(PM 결정 2026-10-16)**: 소셜 로그인 → A21 → **동의 목록 재조회** → A4. 로그인 응답의 `required_consents`는 A21 선택을 모르므로 A21 [다음]에서 `POST /auth/sign-up/consents`(BE 제안 계약 — `changes/archive/auth-signup-consents-refetch.md`)로 고른 언어의 목록을 다시 받아 A4에 넘긴다. 판정은 서버, 앱은 받은 목록을 그린다. [다음]은 진행 중 스피너·비활성.
  - **폴백**: 404 `NOT_FOUND`(구 서버)·그 밖의 재시도 무의미한 실패 → 로그인 응답 목록으로 A4(빠진 필수는 sign-up `CONSENT_REQUIRED`가 막는다). 네트워크·타임아웃·5xx·429 → A21에 머물며 토스트, [다음]으로 재시도. `AUTH_SIGNUP_TOKEN_EXPIRED` → sign-up과 같이 토스트 후 시작 화면. mock: `preferred_language` `en` → 국외 이전 포함, `ko` → 없음, 시나리오 `legacy-consents` → 404.
  - **국외 이전 동의**: `ConsentType`에 `cross_border_transfer`. 서버 목록(`required_consents`·`pending_consents`)에 있을 때만, `is_required` 그대로 그린다(A4·A20). 확정 카피(ko·en)는 `spec/uiux/auth-uiux.md` 4.3 "국외 이전 행". [보기]는 처리방침 국외 이전 절 — 랜딩 `Prose.tsx` h2 순번 id 기준 **영어 `/en/privacy#s6`("6. International transfers") · 한국어 `/privacy#s6`("6. 국외 이전")**(둘 다 여섯 번째 h2, `privacy-2026-11-01.ts`도 같다).
  - **약관·처리방침 링크를 시장 기준으로**(KAN-197의 표시 언어 기준 대체): `shared/lib/legal-urls.ts` `legalUrlsFor(market)` — GLOBAL → `/en/terms`·`/en/privacy`, KR → 종전. 상수 `TERMS_URL`·`PRIVACY_POLICY_URL`은 없앴다. 시장: A4 = 재조회 응답의 서버 판정 `market`(제안 선택 필드 — 글로벌 가입 스위치가 닫히면 English도 KR이라서), 없으면 A21 선택의 시장(`CONTENT_LANGUAGE_MARKET`), A20·설정·구독 고지 = 세션 `user.market`, A1(로그인 전) = 표시 언어가 가리키는 시장. 문서: `auth-uiux.md` 3장·4.1·4.2-1·4.3·4.3-1 · `settings-uiux.md` 정보 행 · `subscription-uiux.md` 링크 줄 · KAN-197 티켓 처리 기록에 기준 변경 주석.
  - **남은 것**: ① BE KAN-215 — `cross_border_transfer` 종류·GLOBAL 필수 목록·기존 GLOBAL 가입자 `pending_consents` + 재조회 엔드포인트(위 changes 문서의 결정 3건 포함). ② 랜딩 영어 페이지 운영 배포 확인 — `tickets/ops/pending/store-english-legal-links.md`는 2026-10-15 `/en/terms/`·`/en/privacy/` 200이라 적었다. 선행 표의 "PR 전"과 어긋나니 표를 갱신할 것. ③ 서버가 생긴 뒤 실서버(`EXPO_PUBLIC_AUTH_API=real`)로 GLOBAL·KR 가입·재동의 확인 — 위 완료 조건 3개.
- 2026-10-19 **국외 이전 행 이름을 짧게**(PM 확정): "Agree to international data transfer" / "개인정보 국외 이전 동의". 상세는 [보기] → 처리방침 국외 이전 절. 종전 한 문장 문구는 7줄로 접히고 iOS 큰 글자에서 잘렸다(#1702). **법무 검토 때 이 짧은 이름으로 충분한지 확인 필요.**
- 2026-10-19 **완료 — 반영 날짜 2026-10-19.** 실기기(iPhone, 개발계 OTA 01a15096 이후, PM 확인): ① GLOBAL 가입 동의 화면에 국외 이전 항목 필수·짧은 이름 잘림 없음·[보기] 영어판 ② KR 가입(한국어 선택)은 국외 이전 항목 없음·한국어 링크·버튼 정상 ③ 설정의 약관·처리방침이 GLOBAL 계정에서 영어판으로 열림 — 완료 조건 3개 충족. 같은 날 "끝까지 스크롤" 관문이 첫 측정의 짧은 높이로 잠겨 [전체 동의]만으로 열리던 버그를 고쳤다(`useScrollEndGate` — 다 들어감 판정을 잠그지 않음, 이 티켓 닫는 PR). **법무 검토 때 확인할 것**: 국외 이전 행의 짧은 이름 + [보기] 링크로 충분한지(되돌릴 때는 `auth-uiux.md` 4.3의 종전 문구).
