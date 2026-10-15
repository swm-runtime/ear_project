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
| 선행 | BE [KAN-215](https://runtime364.atlassian.net/browse/KAN-215) `global-cross-border-consent.md` · 랜딩 영어 페이지 운영 배포(상태: PR 전) |
| 관련 | [KAN-206](https://runtime364.atlassian.net/browse/KAN-206)(연령 동의 — 같은 화면) · [KAN-198](https://runtime364.atlassian.net/browse/KAN-198)(심사 제출 — 이 티켓이 막는다) · [KAN-197](https://runtime364.atlassian.net/browse/KAN-197)(`legal-urls.ts`) |
| 중요도 | Medium |
| 상태 | 대기 |

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
