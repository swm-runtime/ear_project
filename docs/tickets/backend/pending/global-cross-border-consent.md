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
| 선행 | FE와 동의 화면 순서(언어 선택 → 동의) 합의 — KAN-212와 같은 질문(상태: 미정) |
| 관련 | [KAN-216](https://runtime364.atlassian.net/browse/KAN-216)(FE 동의 화면 — 이 티켓이 막는다) · [KAN-212](https://runtime364.atlassian.net/browse/KAN-212)(GLOBAL 약관 버전) |
| 근거 문서 | `spec/api/global-api.md` 2.1·4.1 · 랜딩 영어 처리방침 6장 |
| 중요도 | Medium |
| 상태 | 대기 |

## 왜
해외 사용자 정보는 서울 서버와 해외 외부 서비스(Expo·Sentry·Firebase·Meta 등, 미국)로 넘어간다. 싱가포르·인도네시아·태국은 국외 이전에 이용자 동의를 받는 것이 가장 쉬운 근거다(2026-10-15 조사). 베트남은 공개 국가에서 제외했다.

## 무엇을 한다
- `ConsentType`에 `cross_border_transfer` 추가. `domain.md` 3.2 개정 요청을 `changes/pending`에 남긴다.
- **GLOBAL 시장만** 가입 필수 동의에 포함한다. KR은 받지 않는다 — 한국어 처리방침의 국외 이전 고지로 충분하고, 기존 KR 사용자에게 재동의를 띄우지 않는다.
- 신규 가입자는 소셜 로그인 응답(`consent_required.required_consents`)에서 동의 목록을 받는데 이 시점엔 시장이 정해지지 않았다. 로그인 요청의 `locale.preferred_language`로 시장을 미리 판정해 목록을 정한다(KAN-212의 열린 질문과 같은 해법 — 함께 결정).
- 기존 GLOBAL 가입자는 `pending_consents`로 한 번 받는다.

## 완료 조건
- Given GLOBAL 신규 가입 / When 동의 목록 / Then `cross_border_transfer`가 필수로 있고, 동의 없이 가입하면 400 `CONSENT_REQUIRED`
- Given KR 신규·기존 / Then 목록 변화 없음, 재동의 팝업 없음

## 처리 기록
- 2026-10-15 발행(마크다운 + Jira).
