# [FE] 글로벌 1 — i18n 기반: 라이브러리 도입·`*.copy.ts` 리소스 전환·에러 코드 영어표(누락 테스트)·요청 헤더

| 항목 | 값 |
|---|---|
| 대상 | `shared/`(i18n·로케일) · `*.copy.ts` 16개(1,081줄) · 카피 밖 한국어 리터럴 137줄(`MainNavigator.tsx`·`api-client.ts`·`sleep-timer.ts`·`content-detail.format.ts`·`app-version.ts`·`accessibilityLabel` 8건) · `api-client.ts` 헤더 |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현(테크리드) |
| 담당 | 이주호 |
| Jira | [KAN-194](https://runtime364.atlassian.net/browse/KAN-194) · 에픽 [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) |
| 발행 날짜 | 2026-10-14 |
| 시작 날짜 | 2026-10-14 |
| 기한 | 2026-10-17 (Medium) |
| 선행 | 없음 — 서버 없이 시작 가능 |
| 관련 | FE 2~5번 전부의 선행. BE [KAN-187](https://runtime364.atlassian.net/browse/KAN-187)과 병행 |
| 근거 문서 | **`spec/api/global-api.md` 2.2 헤더 · 2.3 문자열 소유자(에러는 클라이언트가 `error_code`로 번역)** — 구현은 이 문서를 따르고, 계약이 바뀌면 티켓이 아니라 이 문서를 고친다 · 2026-10-14 글로벌화 조사 |
| 중요도 | Medium |
| 상태 | 대기 |

> 2026-10-14 발행한 묶음 티켓(BE KAN-185 · FE KAN-183 · AI KAN-184)을 처리 단위로 나눈 것. 결정 사항(같은 앱·기기 언어로 가입 시 1회 시장 판정·한국 트랙 불변·에러 번역은 클라이언트·가격은 스토어·영어 진행자 새 2인·K-컬처 주제 신설)과 결정 대기(시장 전환 불허·GLOBAL 16세)는 `spec/api/global-api.md` 2.1·9장이 원본이다.

## 무엇을 한다

- `expo-localization` + i18n 라이브러리(i18n-js 또는 react-i18next — FE 결정) 도입. 표시 언어 = 기기 언어(설정에서 바꾸는 건 2번 티켓).
- `*.copy.ts` 16개를 키-리소스(`ko`/`en`)로 전환. 함수형 카피(`${displayPrice}/월`)는 ICU 메시지. 카피 밖 리터럴 137줄 회수.
- **에러 코드 영어표**: `common-error-handling.md` 9장의 모든 `error_code`에 en 문자열 + 신설 `MARKET_MISMATCH`. **누락 시 실패하는 테스트**(없으면 해외 사용자에게 서버 한국어 폴백이 보인다).
- 모든 요청에 `Accept-Language`·`X-Timezone` 헤더.
- 영어 리소스 우선순위: 시작·약관·온보딩·라이브러리·플레이어·탐색·설정·페이월·프로필. 나머지는 4번 티켓.

## 범위 밖

RTL · 추가 언어 · 날짜 포맷(4번)

## 완료 조건

- Given 기기 언어 en / When 우선순위 9화면 / Then 한국어 리터럴 0건(스크린샷 체크리스트)
- Given 서버 `error_code` 전체 / When 테스트 / Then en 문자열 누락 0건, 누락을 넣으면 테스트가 실패한다
- Given 임의 요청 / Then `Accept-Language`·`X-Timezone` 헤더 포함
- Given 기기 언어 ko / Then 종전 문구와 1:1 동일(스냅샷 회귀)

## 처리 기록
- 2026-10-14 발행(마크다운 + Jira). 묶음 티켓 분할.
