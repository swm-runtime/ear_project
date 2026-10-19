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
| 상태 | 완료(2026-10-19) — 우선 9화면 실기기 영어 확인 |

> 2026-10-14 발행한 묶음 티켓(BE KAN-185 · FE KAN-183 · AI KAN-184)을 처리 단위로 나눈 것. 결정 사항(같은 앱·기기 언어로 가입 시 1회 시장 판정·한국 트랙 불변·에러 번역은 클라이언트·가격은 스토어·영어 진행자 새 2인·K-컬처 주제 신설·GLOBAL 연령 16세)과 결정 대기(시장 전환 불허)는 `spec/api/global-api.md` 2.1·9장이 원본이다.

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
- 2026-10-15 코드 반영(PR `feat(fe)/global-i18n-foundation`).
  - **FE 결정 — 라이브러리 대신 타입 있는 카피 두 벌**: i18n-js·react-i18next 를 들이지 않고 `shared/i18n/localized.ts` 의 `localized({ ko, en })` + `LocalizedCopy<typeof ko>` 로 했다. `en` 이 `ko` 와 모양이 다르거나 키가 빠지면 **타입 오류**라 번역 누락이 빌드에서 걸리고, 각 `*.copy.ts` 의 내보내는 이름·모양이 그대로라 화면 코드가 바뀌지 않는다. 함수형 카피는 ICU 대신 언어별 함수(복수형·조사는 그 함수 안).
  - **표시 언어 = 기기 언어**(한국어면 ko, 그 밖은 en). 기기 로캘·시간대는 표준 `Intl` 로 읽는다 — expo-localization 은 네이티브라 빌드가 필요해 미뤘다(KAN-198 에서 바꿀 수 있다). 그래서 이 PR 은 OTA 로 나간다.
  - 카피 16개 전부 ko/en(우선 9화면만이 아니라 전부), 카피 밖 리터럴 22곳(내비게이션 탭·a11y 라벨·시간 포맷·`api-client` 폴백 등)도 ko/en. mock·개발 진단 행·서버 이름과 맞춰야 하는 조회 키(`TopicChip`·`career.images`)는 한국어로 둔다.
  - **에러 영어표** `shared/api/error-messages.ts` — `common-error-handling.md` 9장의 코드 전부(+`MARKET_MISMATCH`). 문서 9장을 읽어 누락을 잡는 테스트(`error-messages.test.ts`), 모르는 코드는 공통 영어 문구. 영어 표시면 `toApiError` 가 서버 한국어 `message` 대신 이 표를 쓴다.
  - **헤더**: 모든 요청에 `Accept-Language`(기기 로캘)·`X-Timezone`(기기 시간대).
  - **한국어 회귀**: 전환 **전** 코드로 만든 스냅숏(`src/app/copy-ko.snapshot.test.ts`, 16개 카피·함수형은 대표 인자 두 벌)이 전환 뒤에도 그대로 통과. 테스트는 `jest.setup.js` 로 기기와 무관하게 한국어로 돈다.
  - 문서: `common-error-handling.md` 4.6(영어 표시는 error_code 번역) · `frontend/convention.md` 3.5(카피 두 벌 규칙) · `frontend/architecture.md` 8.2(헤더·번역 위치).
  - 검증: tsc 0 · jest 505 통과(실패 2 — `ConfirmDialog`·`ProfileHeader` 는 dev 에서도 같은 실패, 이 PR 무관).
  - **남은 것(완료 조건 1)**: 영어 기기에서 우선 9화면(시작·약관·온보딩·라이브러리·플레이어·탐색·설정·페이월·프로필) 스크린샷으로 한국어 0건 확인. 영어 문구는 PM 검토 대상(영어 앱 이름 `Ear` 임시 · 법적 고지 문구 · "Ear Picks" 등).
- 2026-10-18 영어 화면 QA(react-native-web + mock, en-US, 폭 375) 반영(PR `fix(fe)/global-en-layout-qa`) — A4·A20 본문 스크롤 · `ConfirmDialog` 긴 라벨 세로 쌓기 · 설정 "Terms of Service" → 랜딩과 같은 "Terms of Use" · 설정 mock 시장이 세션 시장을 따른다(+`global` 시나리오). 영어 문구 PM 검토 목록 추가: "Manage topics"↔"Manage interests" · 플레이어 구간 "Main" · "Ear Picks" · GLOBAL 의 "Career info" 행 노출(문서에 규칙 없음). 실기기 확인이 남아 pending 유지.
- 2026-10-18 영어 문구 PM 검토 결과 반영(PM 확정 2026-10-18, PR `feat(fe)/release-1-3-0`) — "Manage topics" → **"Manage interests"** 로 통일(프로필 행·설정 행·낭독 목적지 "Open interest management") · "Ear Picks"·플레이어 구간 "Main" 그대로 · **GLOBAL 시장 계정에는 "Career info" 행을 두지 않는다**(프로필·설정 — 세션 `user.market`, `features/career` `isCareerEntryVisible`. 규칙은 `profile.md` 4.4 · `settings.md` 4.1 · 두 uiux 문서) · 영어 앱 이름 **Earcast**(KAN-198).
- 2026-10-19 **실기기 확인 중 발견 — 탐색 섹션 제목 한국어**(개발계 · 설정 › 언어 English, PM). 탐색의 "관심사에 맞는 추천"·"새로 나온 콘텐츠"·"인기 콘텐츠"가 한국어였다 — 서버 `EXPLORE_SECTION_TITLES` 한국어 고정을 앱이 그대로 그렸다. 수정(PR `fix(fe)/explore-section-titles-i18n`): 아는 세 종류만 앱 문구(`explore.copy.ts` `sectionTitles` — en "Recommended for you"·"New episodes"·"Popular", ko 는 서버 문자열과 같다), 주제 섹션·모르는 종류는 서버 `title` 그대로(`explore.section-title.ts`). 문서 `explore-uiux.md` 4.1·6장 개정, explore-api 4.1 서술은 `changes/pending/explore-section-title-owner.md`. 남은 화면 확인을 이어서 하므로 pending 유지.
- 2026-10-19 **완료 — archive**(반영 날짜 2026-10-19). 완료 조건 1 실기기(개발계 · 설정 › 언어 English, PM): 우선 9화면 앱 문구 한국어 0건 — 시작·약관·온보딩(GLOBAL 계정, 앞선 확인) · 라이브러리 · 플레이어 · 탐색(섹션 제목 수정 PR #1719 · OTA `01a152cb` 뒤 영어 확인) · 설정 · 페이월 · 프로필(플랜 줄·통계 이름·주간 차트). 서버가 주는 콘텐츠 제목·주제 이름은 조건 밖(시장별 행 — `global-api.md` 2.3). 조건 2(에러 영어표 누락 테스트) · 3(`Accept-Language`·`X-Timezone` 헤더) · 4(한국어 스냅숏 회귀)는 코드·테스트로 확인.
