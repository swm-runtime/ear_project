# [FE] 글로벌 4 — `Intl` 날짜·복수형·`WeeklyChart` KST 가정 제거·법적 링크 locale·고정 폭 레이아웃 QA

| 항목 | 값 |
|---|---|
| 대상 | `profile.copy.ts`("N월 N일") · `content-detail.format.ts` · `player.format.ts` · `subscription.copy.ts:8` · `WeeklyChart.tsx`(기기 시각 −5h) · `legal-urls.ts` · 고정 폭 ~24곳(`StartScreen`·`TermsConsentScreen`·`CareerInfoScreen`·`WeeklyChart` 주 라벨) |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현(테크리드) |
| 담당 | 이주호 |
| Jira | [KAN-197](https://runtime364.atlassian.net/browse/KAN-197) · 에픽 [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) |
| 발행 날짜 | 2026-10-14 |
| 시작 날짜 | 2026-10-14 |
| 기한 | 2026-10-20 (Medium 환산은 발행+3일(10-17)이나 선행 티켓 뒤 착수라 10일 계획의 마일스톤 날짜로 적음) |
| 선행 | [KAN-194](https://runtime364.atlassian.net/browse/KAN-194) |
| 관련 | 서버 서비스 날짜 라벨은 BE와 합의(2.4 — 기기 시각으로 재계산하지 않는다) |
| 근거 문서 | **`spec/api/global-api.md` 2.4 시간대(응답 시각 규약)** — 구현은 이 문서를 따르고, 계약이 바뀌면 티켓이 아니라 이 문서를 고친다 · 2026-10-14 글로벌화 조사 |
| 중요도 | Medium |
| 상태 | 대기 |

> 2026-10-14 발행한 묶음 티켓(BE KAN-185 · FE KAN-183 · AI KAN-184)을 처리 단위로 나눈 것. 결정 사항(같은 앱·기기 언어로 가입 시 1회 시장 판정·한국 트랙 불변·에러 번역은 클라이언트·가격은 스토어·영어 진행자 새 2인·K-컬처 주제 신설·GLOBAL 연령 16세)과 결정 대기(시장 전환 불허)는 `spec/api/global-api.md` 2.1·9장이 원본이다.

## 무엇을 한다

- 날짜·시간·복수형을 `Intl`로 전환(`Intl.DateTimeFormat`·`PluralRules`). 서비스 날짜 라벨은 서버 값 그대로.
- `WeeklyChart.tsx`의 기기 시각 −5h KST 가정 제거 → 서버가 준 서비스 날짜 사용.
- 법적 링크 locale 경로(`legal-urls.ts` — 영어 페이지는 FE 6번 또는 Apple 표준 EULA).
- 고정 폭 ~24곳 flex 전환, 영어 장문 QA(버튼 2줄·말줄임), Android 폰트 폴백 확인.
- 나머지 화면 영어 리소스(1번 우선순위 밖).

## 범위 밖

RTL

## 완료 조건

- Given 기기 언어 en·시간대 America/New_York / When 프로필·상세·플레이어 날짜 / Then 영어 포맷이고 서비스 날짜가 서버 값과 같다
- Given `WeeklyChart` / Then 기기 시각 보정 코드 0건
- Given 영어 장문 / Then 잘림·겹침 0건(스크린샷 체크리스트 24곳)
- Given 기기 언어 ko / Then 종전과 동일

## 처리 기록
- 2026-10-14 발행(마크다운 + Jira). 묶음 티켓 분할.
