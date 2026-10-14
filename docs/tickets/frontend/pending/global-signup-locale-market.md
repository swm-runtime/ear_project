# [FE] 글로벌 2 — 가입·기기 등록에 `locale` 전송·`user.market` 분기(제공자·온보딩 `steps[]`)·주제 `slug` 이미지·설정 표시 언어

| 항목 | 값 |
|---|---|
| 대상 | `auth`(제공자 목록 `auth.constants.ts:30`·연령 문구) · 가입·기기 등록 요청 · `onboarding`(`steps[]` 기반 내비게이션·`TopicChip.tsx`·`career.images.ts` 한글 키) · `settings` 언어 항목 |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현(테크리드) |
| 담당 | 이주호 |
| Jira | [KAN-195](https://runtime364.atlassian.net/browse/KAN-195) · 에픽 [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) |
| 발행 날짜 | 2026-10-14 |
| 시작 날짜 | 2026-10-14 |
| 기한 | 2026-10-19 (Medium 환산은 발행+3일(10-17)이나 선행 티켓 뒤 착수라 10일 계획의 마일스톤 날짜로 적음) |
| 선행 | [KAN-194](https://runtime364.atlassian.net/browse/KAN-194) · BE [KAN-187](https://runtime364.atlassian.net/browse/KAN-187)(`locale`·`user.market`) · BE [KAN-189](https://runtime364.atlassian.net/browse/KAN-189)(`steps[]`·`slug`) — BE 배포 전엔 `global-api.md` 모양으로 mock |
| 관련 | KAN-182 이벤트 코드 UI와 같은 빌드 |
| 근거 문서 | **`spec/api/global-api.md` 4.1 · 4.2 · 4.3 · 4.4 · 4.5** — 구현은 이 문서를 따르고, 계약이 바뀌면 티켓이 아니라 이 문서를 고친다 · 2026-10-14 글로벌화 조사 |
| 중요도 | Medium |
| 상태 | 대기 |

> 2026-10-14 발행한 묶음 티켓(BE KAN-185 · FE KAN-183 · AI KAN-184)을 처리 단위로 나눈 것. 결정 사항(같은 앱·기기 언어로 가입 시 1회 시장 판정·한국 트랙 불변·에러 번역은 클라이언트·가격은 스토어·영어 진행자 새 2인·K-컬처 주제 신설·GLOBAL 연령 16세)과 결정 대기(시장 전환 불허)는 `spec/api/global-api.md` 2.1·9장이 원본이다.

## 무엇을 한다

- 가입·로그인 요청에 `locale { language_code, region_code, timezone }`(`getLocales()[0]`·`getCalendars()[0].timeZone`). 기기 등록에 `language_code`·`timezone`.
- **분기 기준은 응답 `user.market`**(언어로 추측 금지): GLOBAL이면 제공자 Google/Apple만, 구독 법적 고지 GLOBAL 문구. (연령 16세 문구·차단 흐름은 [KAN-206](https://runtime364.atlassian.net/browse/KAN-206) `global-age-consent-16.md`로 이관)
- 온보딩은 `GET /onboarding/state`의 `steps[]`대로 화면을 잇는다 — 단계를 하드코딩하지 않는다. `career`가 없으면 커리어 화면을 띄우지 않는다.
- 주제 이미지·아이콘 매핑 키를 **`items[].slug`**로 전환(한국어 이름 키 폐기). GLOBAL 주제 이미지 자산은 AI/PM에서 수령.
- 설정에 "언어" 항목 — `PATCH /users/me/settings { language_code }`로 표시 언어 변경, 시장은 표시만(변경 불가).

## 범위 밖

연령 동의 화면(KAN-206) · 주제 트리 내용(AI)

## 완료 조건

- Given 영어 기기 가입 / When 요청 캡처 / Then `locale` 세 필드가 기기 값과 같다
- Given 응답 `market = global` / Then 시작 화면 제공자 Google/Apple만
- Given `steps = ["topic","pick"]` / Then 커리어 화면이 뜨지 않는다; `["topic","career","pick"]`이면 종전과 같다
- Given 주제 응답에 slug / Then 이미지가 slug로 붙고 한국어 이름 키 참조 0건
- Given 설정에서 언어를 en→ko / Then 문구가 바뀌고 `market` 표시는 그대로

## 처리 기록
- 2026-10-14 발행(마크다운 + Jira). 묶음 티켓 분할.
- 2026-10-14 연령 16세 문구 항목을 KAN-206으로 이관.
