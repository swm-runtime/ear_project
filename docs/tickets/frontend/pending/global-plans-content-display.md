# [FE] 글로벌 3 — 요금제 `price_krw` 의존 제거·스토어 `displayPrice`만·시장별 법적 고지·콘텐츠 `language` 표시

| 항목 | 값 |
|---|---|
| 대상 | `subscription`(`plan-catalog.ts:27` 무료 판정·플랜 카드·법적 고지) · 콘텐츠 카드·상세·플레이어의 `language` 사용 |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현(테크리드) |
| 담당 | 이주호 |
| Jira | [KAN-196](https://runtime364.atlassian.net/browse/KAN-196) · 에픽 [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) |
| 발행 날짜 | 2026-10-14 |
| 시작 날짜 | 2026-10-14 |
| 기한 | 2026-10-20 (Medium 환산은 발행+3일(10-17)이나 선행 티켓 뒤 착수라 10일 계획의 마일스톤 날짜로 적음) |
| 선행 | [KAN-194](https://runtime364.atlassian.net/browse/KAN-194) · BE [KAN-192](https://runtime364.atlassian.net/browse/KAN-192)(`GET /plans` 시장 필터·`price_krw: null`) · BE [KAN-188](https://runtime364.atlassian.net/browse/KAN-188)(콘텐츠 `language`) |
| 관련 | KAN-120 결제 화면(SB1–SB3·PW1)의 카피가 리소스로 넘어간 뒤 |
| 근거 문서 | **`spec/api/global-api.md` 4.6 · 4.7** — 구현은 이 문서를 따르고, 계약이 바뀌면 티켓이 아니라 이 문서를 고친다 · 2026-10-14 글로벌화 조사 |
| 중요도 | Medium |
| 상태 | 대기 |

> 2026-10-14 발행한 묶음 티켓(BE KAN-185 · FE KAN-183 · AI KAN-184)을 처리 단위로 나눈 것. 결정 사항(같은 앱·기기 언어로 가입 시 1회 시장 판정·한국 트랙 불변·에러 번역은 클라이언트·가격은 스토어·영어 진행자 새 2인·K-컬처 주제 신설)과 결정 대기(시장 전환 불허·GLOBAL 16세)는 `spec/api/global-api.md` 2.1·9장이 원본이다.

## 무엇을 한다

- `priceKrw` 의존 전부 제거 — 무료 판정은 서버 `action`/`tier`로, 가격은 스토어 SDK `displayPrice`만(KR도 동일하게 바꿔 두 시장 코드 경로를 하나로).
- `price_krw: null`을 받아도 깨지지 않는다(구 앱 호환 확인은 BE 쪽).
- 구독 법적 고지를 시장별 리소스로(KR 전자상거래법 문구 / GLOBAL Apple·Google 표준 문구).
- 콘텐츠 객체 `language`는 **표시 전용**(자막 폰트·낭독 언어 라벨 등). 클라이언트가 `language`로 목록을 거르지 않는다.

## 범위 밖

가격 책정·상품 ID(스토어·BE)

## 완료 조건

- Given 코드베이스 / When `priceKrw` 검색 / Then 사용 0건
- Given GLOBAL 요금제 응답(`price_krw: null`) / Then 카드에 스토어 현지가만, 오류 0건
- Given KR 계정 / Then 종전 화면과 동일(회귀)
- Given 콘텐츠 `language = en` / Then 표시만 바뀌고 목록 필터링 로직 0건

## 처리 기록
- 2026-10-14 발행(마크다운 + Jira). 묶음 티켓 분할.
