# [BE] 글로벌 — 국외 이전 동의 종류 추가(GLOBAL 가입 필수 동의)

| 항목 | 값 |
|---|---|
| 대상 | `ConsentType` · 가입 필수 동의 목록(시장별) · `pending_consents` · `domain.md` 3.2(changes 경유) |
| 요청 파트 | 백엔드 |
| 요청자 | 박준현(테크리드) |
| 담당 | 박준현 |
| Jira | [KAN-215](https://runtime364.atlassian.net/browse/KAN-215) · 에픽 [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) |
| 발행 날짜 | 2026-10-15 |
| 시작 날짜 | 2026-10-15 |
| 기한 | 2026-10-18 (Medium) |
| 선행 | FE와 동의 화면 순서 합의 — KAN-212와 같은 질문(상태: 완료 2026-10-16 — 로그인 → A21 → 동의 목록 재조회 → A4) |
| 관련 | [KAN-216](https://runtime364.atlassian.net/browse/KAN-216)(FE 동의 화면 — 이 티켓이 막는다) · [KAN-212](https://runtime364.atlassian.net/browse/KAN-212)(GLOBAL 약관 버전) |
| 근거 문서 | `spec/api/global-api.md` 2.1·4.1 · 랜딩 영어 처리방침 6장 |
| 중요도 | Medium |
| 상태 | 완료 (2026-10-16) |

## 왜
해외 사용자 정보는 서울 서버와 해외 외부 서비스(Expo·Sentry·Firebase·Meta 등, 미국)로 넘어간다. 싱가포르·인도네시아·태국은 국외 이전에 이용자 동의를 받는 것이 가장 쉬운 근거다(2026-10-15 조사). 베트남은 공개 국가에서 제외했다.

## 무엇을 한다
- `ConsentType`에 `cross_border_transfer` 추가. `domain.md` 3.2 개정 요청을 `changes/pending`에 남긴다.
- **GLOBAL 시장만** 가입 필수 동의에 포함한다. KR은 받지 않는다 — 한국어 처리방침의 국외 이전 고지로 충분하고, 기존 KR 사용자에게 재동의를 띄우지 않는다.
- 신규 가입자는 소셜 로그인 응답(`consent_required.required_consents`)에서 동의 목록을 받는데 이 시점엔 시장이 정해지지 않았다. ~~로그인 요청의 `locale.preferred_language`로 시장을 미리 판정해 목록을 정한다~~ → **콘텐츠 언어를 고른 뒤 `POST /auth/sign-up/consents`로 목록을 다시 받는다**(2026-10-16 FE 결정 — KAN-216). 로그인 응답의 목록은 기기 로캘 기준으로 둔다.
- 기존 GLOBAL 가입자는 `pending_consents`로 한 번 받는다.

## 완료 조건
- Given GLOBAL 신규 가입 / When 동의 목록 / Then `cross_border_transfer`가 필수로 있고, 동의 없이 가입하면 400 `CONSENT_REQUIRED`
- Given KR 신규·기존 / Then 목록 변화 없음, 재동의 팝업 없음
- Given 콘텐츠 언어 English(글로벌 가입 열림) / When `POST /auth/sign-up/consents` / Then `cross_border_transfer` 필수·`market: global`, 그 목록 그대로 sign-up하면 201
- Given 글로벌 가입 닫힘 + English / When 재조회 / Then KR 목록·`market: kr`
- Given 국외 이전 동의 기록이 없는 GLOBAL 기존 가입자 / When 세션 복원 / Then `pending_consents`에 `cross_border_transfer` 1건

## 처리 기록
- 2026-10-15 발행(마크다운 + Jira).
- 2026-10-16 선행 해소 — FE가 순서를 로그인 → A21 → **동의 목록 재조회** → A4로 확정하고 `POST /auth/sign-up/consents`를 요청(KAN-215·216 Jira 댓글, FE 제안 `changes/archive/auth-signup-consents-refetch.md`).
- 2026-10-16 구현 — PR `feat(be)/signup-consents-market`(dev 대상).
  - `ConsentType.CROSS_BORDER_TRANSFER`(버전 null), 필수 동의 `REQUIRED_CONSENT_TYPES_BY_MARKET`(KR 3종 · GLOBAL 4종). 가입 거절·재동의(`findPendingConsents`)·철회 불가(`recordConsents`)가 사용자 시장 기준이다.
  - `consent_type` varchar 20 → 32(마이그레이션 `1790300000000-WidenConsentType`, `consents`·`archive.archived_consents`). 새 값이 21자다.
  - `POST /auth/sign-up/consents` — `signup_token` 검증(401), 기록 없음, 응답 `required_consents`·`market`. 시장 판정은 가입과 같은 `UserService.resolveSignupMarket`(글로벌 가입 스위치 반영). 로그인 응답 목록도 같은 경로다.
  - 동의 배열 최대 4 → 5(동의 종류 수). 종전 4라면 GLOBAL 가입(필수 4 + 마케팅)이 400이었다.
  - 문서 `changes/archive/global-cross-border-consent-backend.md`(FE 제안 "정할 것" 4개에 대한 답 포함).
  - 테스트: 단위 1828 · e2e 124 통과(새 `signup-consents.e2e-spec.ts` 6건, 리뷰 반영으로 로그인 목록·재조회 토큰 검증 단위 테스트 추가). GLOBAL 필수 목록에서 국외 이전을 빼면 단위 4·e2e 3건이 실패함을 확인.
- 2026-10-16 완료 — 반영 날짜 2026-10-16. PR #1609 dev 머지·CI(lint·build·단위·e2e) 통과, 개발계 배포 확인(마이그레이션 `WidenConsentType1790300000000` 적용·`consent_type` 32자, `POST /auth/sign-up/consents` 위조 토큰 401). 완료 조건은 e2e `signup-consents.e2e-spec.ts`로 확인했다(GLOBAL 필수 국외 이전·누락 400·KR 목록 불변·재조회·스위치 닫힘·기존 GLOBAL 재동의). 운영은 글로벌 가입 스위치가 닫혀 있어 동작 변화가 없다. `archive/`로 이동, Jira 완료.
