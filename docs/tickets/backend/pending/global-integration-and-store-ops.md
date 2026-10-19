# [BE] 글로벌 7 — 개발계 통합 검증(영어 기기 E2E)·Sentry `market` 태그·스토어 콘솔 작업·문서 반영

| 항목 | 값 |
|---|---|
| 대상 | 개발계 실측 시나리오 · Sentry 태그 · App Store Connect·Play Console(국가·리스팅·상품·연령·Paid Apps) · EAS Android submit 프로필 · `changes/pending` 글로벌 묶음 |
| 요청 파트 | 백엔드 |
| 요청자 | 박준현(테크리드) |
| 담당 | 박준현 |
| Jira | [KAN-193](https://runtime364.atlassian.net/browse/KAN-193) · 에픽 [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) |
| 발행 날짜 | 2026-10-14 |
| 시작 날짜 | 2026-10-14 |
| 기한 | 2026-10-23 (Medium 환산은 발행+3일(10-17)이나 선행 티켓 뒤 착수라 10일 계획의 마일스톤 날짜로 적음) |
| 선행 | [KAN-187](https://runtime364.atlassian.net/browse/KAN-187)~[KAN-192](https://runtime364.atlassian.net/browse/KAN-192) 전부 · FE [KAN-198](https://runtime364.atlassian.net/browse/KAN-198) 글로벌 빌드(개발계 TestFlight) · AI [KAN-204](https://runtime364.atlassian.net/browse/KAN-204) GLOBAL 콘텐츠 발행(대기 — 2026-10-16 추가) · 사람 손: 법무 영어 약관·개인정보처리방침(영어판 랜딩 게시 완료 2026-10-15) · 운영 GLOBAL 주제 노출(대기) · 개발계 Secrets `GLOBAL_SIGNUP_ENABLED`·`DRIP_TIMEZONE_GROUPS_ENABLED`=true(대기) |
| 관련 | AI 발행(AI 5번)과 같은 날 개발계에서 교차 확인 |
| 근거 문서 | **`spec/api/global-api.md` 6장 흐름 · 7장** — 구현은 이 문서를 따르고, 계약이 바뀌면 티켓이 아니라 이 문서를 고친다 · 2026-10-14 글로벌화 조사 |
| 중요도 | Medium |
| 상태 | 진행 중 (2026-10-14 Sentry `market` 태그 #1539 dev 머지·개발계 배포) |

> 2026-10-14 발행한 묶음 티켓(BE KAN-185 · FE KAN-183 · AI KAN-184)을 처리 단위로 나눈 것. 결정 사항(같은 앱·기기 언어로 가입 시 1회 시장 판정·한국 트랙 불변·에러 번역은 클라이언트·가격은 스토어·영어 진행자 새 2인·K-컬처 주제 신설·GLOBAL 연령 16세)과 결정 대기(시장 전환 불허)는 `spec/api/global-api.md` 2.1·9장이 원본이다.

## 무엇을 한다

- 개발계 실측: 영어 기기 가입 → GLOBAL 판정 → 영어 주제·요금제 → 드립 그룹 배치 → 영어 푸시 → 결제(샌드박스, storefront 저장). KR 계정은 변화 없음(회귀).
- Sentry 환경 태그에 `market`(API 로그에도 필드 추가 — 시장별 오류율을 Insights로 셀 수 있게. 대시보드는 나누지 않는다).
- **사람 손(박준현)**: 국가 배포 확장(iOS·Android), 영어 리스팅 자료 FE에서 수령, 구독 상품 현지화 확인, Paid Apps·세금 양식 Active 확인, Android 운영 submit 프로필(EAS). 연령 등급·대상 연령 설정은 [KAN-207](https://runtime364.atlassian.net/browse/KAN-207) `global-store-age-settings.md`로 분리.
- **사람 손(박준현) — 시장 전환 운영 스위치**(2026-10-19 — KAN-227): 앱 1.3.0 출시 + FE [KAN-228](https://runtime364.atlassian.net/browse/KAN-228)(설정 › 콘텐츠 언어) 반영 뒤 운영 Secrets `ear/prod/api`에 `MARKET_CHANGE_ENABLED=true` → 운영 재배포 → 컨테이너 env 확인. GLOBAL로의 전환은 `GLOBAL_SIGNUP_ENABLED`가 열려야 함께 열린다(`global-api.md` 4.11).
- `changes/pending` 글로벌 묶음(`domain.md`·`auth-api.md`·`onboarding-api.md`·`subscription-api.md`·`admin-api.md`·`common-error-handling.md`·`drip-scheduling.md`·PRD FR)이 전부 있는지 점검 — 통합 때 반영.

## 범위 밖

운영 공개 자체(스토어 심사 결과에 따름)

## 완료 조건

- Given 개발계 영어 기기 / When 가입~결제까지 / Then 6장 흐름대로 동작, 처리 기록에 실측 날짜·결과
- Given 개발계 KR 계정 / Then 회귀 0건
- Given Sentry / Then 이벤트에 `market` 태그
- Given 스토어 콘솔 체크리스트 / Then 항목별 완료 날짜가 처리 기록에 있다
- Given 앱 1.3.0 출시 · KAN-228 반영 / When 운영 `MARKET_CHANGE_ENABLED=true` / Then 운영 `GET /users/me/market-change/preview`가 `market_unavailable` 외의 응답을 준다(KR 전환 가능)
- `changes/pending`에 글로벌 개정 요청 묶음이 있다

## 처리 기록
- 2026-10-14 발행(마크다운 + Jira). 묶음 티켓 분할.
- 2026-10-14 연령 등급 재설문을 KAN-207으로 분리.
- 2026-10-14 Sentry `market` 태그 — PR `feat(be)/sentry-market-tag`. 로그인 요청의 error 등급 이벤트에 `market` 태그(비로그인은 태그 없음), 요청 종료 로그·예외 로그에 `market` 필드(`convention.md` 8.3 표 갱신). 대시보드는 나누지 않는다.
- 2026-10-16 영어 기기 E2E 실측 시점 결정(박준현) — **GLOBAL 콘텐츠가 준비되면 한 번에** 한다. 지금은 개발계 GLOBAL 주제 8개가 전부 숨김이고 GLOBAL 콘텐츠가 0편이라, 스위치를 켜도 English 가입자는 온보딩(주제 0개)에서 멈춘다. 주제 노출은 운영 → 개발계 동기화를 따르므로 운영에서 바꿔야 한다. 실측 범위: 가입(A21 English) → 국외 이전 동의·나라별 연령(KAN-215·220) → 온보딩 → 피드·재생 → 영어 요금제 문구(#1629) → 시간대 그룹 드립·영어 푸시(KAN-191). 선행: AI KAN-204(GLOBAL 발행) · 운영 GLOBAL 주제 노출 · 개발계 Secrets `GLOBAL_SIGNUP_ENABLED=true`·`DRIP_TIMEZONE_GROUPS_ENABLED=true`(사람 손 — 대기).
