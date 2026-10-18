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
| 상태 | 코드 반영(2026-10-15) — 실기기 실측·KR slug 입력(KAN-212) 뒤 이미지 대조 남음 |

> 2026-10-14 발행한 묶음 티켓(BE KAN-185 · FE KAN-183 · AI KAN-184)을 처리 단위로 나눈 것. 결정 사항(같은 앱·기기 언어로 가입 시 1회 시장 판정·한국 트랙 불변·에러 번역은 클라이언트·가격은 스토어·영어 진행자 새 2인·K-컬처 주제 신설·GLOBAL 연령 16세)과 결정 대기(시장 전환 불허)는 `spec/api/global-api.md` 2.1·9장이 원본이다.

## 무엇을 한다

- **앱을 켰을 때**는 기기 `locale`로 **표시 언어를 1차 판단**해 시작·로그인 화면을 그 언어로 그린다(서버 호출 전이라 클라이언트가 정한다 — 이것은 UI 언어이고 시장 판정이 아니다).
- **가입 때 콘텐츠 언어 선택 화면 1장**(모든 신규 가입자): "어떤 언어로 들을까요? 한국어 / English". 기본 선택은 기기 언어. **선택한 언어에 따라 보여 주는 콘텐츠가 달라진다는 설명**과 **"해외에 거주하시면 English 선택을 추천해요"** 같은 안내 문구를 함께 둔다(가입 뒤 바꿀 수 없다는 점도 한 줄). 선택값을 `locale.preferred_language`(`ko`|`en`)로 보낸다 — 시장은 이 값으로 서버가 정한다(2026-10-14 결정. 모호한 사용자에게만 묻는 방식 등은 추후 필요하면 재논의). 화면 ID·확정 카피(ko/en)는 FE가 정하고 `spec/uiux`에 기록.
- 가입·로그인 요청에 `locale { preferred_language, language_code, region_code, timezone }`(`getLocales()[0]`·`getCalendars()[0].timeZone`). 기기 등록에 `language_code`·`timezone`.
- **분기 기준은 응답 `user.market`**(언어로 추측 금지): GLOBAL이면 제공자 Google/Apple만, 구독 법적 고지 GLOBAL 문구. (연령 16세 문구·차단 흐름은 [KAN-206](https://runtime364.atlassian.net/browse/KAN-206) `global-age-consent-16.md`로 이관)
- 온보딩은 `GET /onboarding/state`의 `steps[]`대로 화면을 잇는다 — 단계를 하드코딩하지 않는다. `career`가 없으면 커리어 화면을 띄우지 않는다.
- 주제 이미지·아이콘 매핑 키를 **`items[].slug`**로 전환(한국어 이름 키 폐기). GLOBAL 주제 이미지 자산은 AI/PM에서 수령.
  - ⚠️ **KR 주제 slug는 BE KAN-212에 확정 표가 있다**(2026-10-15). 서버에 값이 들어가기 전에 이름 키를 지우면 KR 주제 이미지가 기본 이미지로 바뀐다 — slug가 null이면 이름 키로 폴백하거나, BE 입력 뒤 배포한다.
  - ⚠️ **재테크·투자 파일명이 slug와 엇갈린다.** 재테크 이미지 = `topic-investing.jpg`(slug `personal-finance`), 투자 이미지 = `topic-invest.jpg`(slug `investing`). "slug → `topic-{slug}.jpg`"로 바꾸면 투자 칩에 재테크 이미지가 붙는다. 파일명을 slug에 맞춰 정리하거나(재테크 먼저 옮기고 투자) slug → 파일 표를 따로 둔다.
- 설정에 "언어" 항목 — `PATCH /users/me/settings { language_code }`로 표시 언어 변경, 시장은 표시만(변경 불가).

## 범위 밖

연령 동의 화면(KAN-206) · 주제 트리 내용(AI)

## 완료 조건

- Given 신규 가입 / When 콘텐츠 언어 화면 / Then 기기 언어가 기본 선택이고, 고른 값이 `locale.preferred_language`로 전송된다
- Given 콘텐츠 언어 화면 / Then "선택한 언어에 따라 콘텐츠가 달라진다"는 설명과 해외 거주자 English 추천 문구, 가입 뒤 변경 불가 안내가 보인다(ko/en 리소스)
- Given 영어 기기에서 앱 첫 실행 / Then 서버 호출 전 시작·로그인 화면이 영어로 그려진다
- Given 영어 기기에서 '한국어' 선택 / Then 응답 `market = kr`, 한국어 주제·요금제(서버 판정 — 클라이언트가 기기 언어로 덮어쓰지 않는다)
- Given 영어 기기 가입 / When 요청 캡처 / Then `locale`의 기기 값 세 필드가 기기 값과 같다
- Given 응답 `market = global` / Then 시작 화면 제공자 Google/Apple만
- Given `steps = ["topic"]`(GLOBAL) / Then 커리어 화면이 뜨지 않는다; `["topic","career"]`(KR)이면 종전과 같다 (2026-10-14 정정 — 담기 단계는 없다, `global-api.md` 4.4)
- Given 주제 응답에 slug / Then 이미지가 slug로 붙고 한국어 이름 키 참조 0건
- Given slug 매핑 배포 / Then 재테크·투자를 포함한 KR 주제 칩 이미지가 1.2.0과 같다(스크린샷 대조)
- Given 설정에서 언어를 en→ko / Then 문구가 바뀌고 `market` 표시는 그대로

## 처리 기록
- 2026-10-14 발행(마크다운 + Jira). 묶음 티켓 분할.
- 2026-10-14 연령 16세 문구 항목을 KAN-206으로 이관.
- 2026-10-15 코드 반영(PR `feat(fe)/global-signup-locale-market`). 선행 KAN-187·189 완료 확인.
  - **PM 결정(2026-10-15) — 콘텐츠 언어는 가입 단계에서 묻는다**: 시작 → 소셜 로그인 → (신규면) **A21 "어떤 언어로 들을까요?"**(기본 = 표시 언어) → 약관 A4 → 가입. 가입 요청에 `locale.preferred_language`. 카피(ko/en)·상태는 `auth-uiux.md` 4.2-1.
  - **시작 화면 제공자**: 로그인 전엔 시장을 모르므로 **표시 언어로** 거른다 — 영어면 Google·Apple, 한국어면 4개(PM 결정, `auth-uiux.md` 4.1). 완료 조건의 "응답 `market = global` → 시작 화면 Google/Apple만"은 이 규칙으로 대신한다.
  - 가입·로그인 `locale { language_code, region_code, timezone }`(로그인은 `preferred_language` 없음), 기기 등록 `language_code`·`timezone`. 기기 값은 `Intl`(expo-localization 은 KAN-198 빌드 때).
  - 세션에 `market`·`languageCode`·`timezone`(없거나 모르는 시장은 `kr`), `selectMarket` 공개.
  - **온보딩은 `steps[]` 대로**: 다음 단계가 없으면 완료 대기로. GLOBAL `["topic"]` → 커리어 화면 없음, 단계 표시 1/1. `steps` 없는 옛 서버는 `["topic","career"]`.
  - **주제 이미지 slug 우선 + 한국어 이름 폴백**(`interest/interest.images.ts`) — slug→이미지 표를 따로 둬서 재테크(`personal-finance` → `topic-investing.jpg`)·투자(`investing` → `topic-invest.jpg`)가 엇갈리지 않는다. KAN-212 의 KR slug 36개가 이름 키와 같은 이미지를 가리키는 테스트. GLOBAL 8개는 이미지가 없어 기본 이미지. slug 를 주는 응답(`GET /onboarding/topics`)만 slug 를 넘기고 나머지 화면은 이름.
  - **설정 "언어"**: 기기 언어 따르기 · 한국어 · English. 바꾸면 `PATCH language_code` → 기기 저장 → 앱 다시 부르기. 콘텐츠 언어(시장)는 섹션 아래에 "바뀌지 않음"으로 알린다(`settings-uiux.md`). 표시 언어는 시작 때 동기로 읽는다(`shared/i18n/locale.ts`, 화면 모드와 같은 방식).
  - 검증: tsc 0 · jest 595 통과(실패 2 — `ConfirmDialog`·`ProfileHeader`, dev 와 같은 기존 실패). 한국어 카피 스냅숏은 **추가만**(기존 문구 무변화).
  - **남은 것**: 실기기 실측(영어 기기 첫 실행·A21·GLOBAL 가입 → 커리어 없음·요청 캡처), KAN-212 KR slug 입력 뒤 KR 주제 칩 이미지 1.2.0 대조, GLOBAL 주제 이미지 자산(AI/PM).
- 2026-10-18 영어 화면 QA 반영(PR `fix(fe)/global-en-layout-qa`) — 설정 mock 의 `account.market` 이 `'kr'` 고정이라 GLOBAL mock 세션에서 "Episodes stay in Korean" 이 나왔다. mock 이 세션 시장을 따르게 하고 `global` 시나리오를 더했다(실서버는 `users.market` 을 준다 — 코드 버그 아님 확인). GLOBAL 의 프로필·설정 "Career info" 행은 문서에 규칙이 없어 그대로 두고 PM 결정으로 넘겼다. pending 유지.
- 2026-10-19 A21 다듬기(PR `feat(fe)/content-language-flags`, PM 확정 2026-10-19). pending 유지 — 남은 것은 위 2026-10-15 항목 그대로.
  - **화면 문구가 고른 선택지의 언어를 따른다**: 한국어 ↔ English 를 고르는 즉시 질문·설명·변경 불가·[다음]·뒤로가기 낭독이 그 언어로 바뀐다(앱 표시 언어는 그대로). 두 언어 글자를 같은 자리에 겹쳐 카드가 움직이지 않게 했고, 글자마다 `accessibilityLanguage`.
  - **English 카드 설명 "Learn Korea with K-podcast" · 권장 안내 "Into K-culture? Choose English"**(키 `recommendOverseas` → `recommendEnglish`) — 글로벌은 K-콘텐츠 위주라 화면 언어와 무관하게 늘 영어. 한국어 카피 스냅숏은 이 두 값만 바뀐다(의도).
  - **카드 뒤 흐린 국기**(태극기 · 성조기): `frontend/scripts/generate-language-flags.py` 로 규격대로 그려 미리 흐린 PNG(`assets/flags/`, 420×140). 런타임 흐림·네이티브 모듈 없음 — rt 그대로 OTA. 막 토큰 `decorWash`·`decorWashSelected`. 카피·상태는 `auth-uiux.md` 4.2-1, 규칙은 `design.md` §5 "장식 배경 그림".
- 2026-10-19 **English 카드 설명을 종전 "영어 에피소드와 주제" / "Episodes and topics in English"로 되돌림**(PM 정정 — "Learn Korea with K-podcast"는 A1 시작 화면 영어 설명 요청이었다. A1은 PR #1700에서 반영). 권장 안내 "Into K-culture? Choose English"는 그대로.
- 2026-10-19 **GLOBAL 주제 사진 8장 + 온보딩 알약 폭을 라벨에 맞춤**(PR `feat(fe)/global-topic-photos`, PM 확정 2026-10-19). pending 유지 — 남은 것은 실기기 실측·KAN-212 뒤 KR 이미지 대조.
  - **GLOBAL 사진**: 8개 slug 가 기본 사진 대신 각자 사진(`assets/topics/topic-<slug>.jpg`, Openverse CC0 — 9월 주제 사진과 같은 절차, 800×320). 한국어 = 한글 서예 · K-Food = 비빔밥 · K-Pop = 공연장 손 하트(뒷모습) · K-Drama & Film = 빈 영화관 · Korean Culture = 연등 · K-Beauty & Fashion = 한복 가게 · Korean History & Society = 창덕궁 인정전 · Travel in Korea = 롯데월드타워 일몰. 출처 URL·라이선스는 `interest.images.ts` 주석. "GLOBAL 주제 이미지 자산(AI/PM)" 남은 항목은 이것으로 끝.
  - **알약 폭 = 라벨 + 좌우 24**(최소 96 · 최대 줄 폭, 넘치면 두 줄) — 한국어·영어 공통. 고정 폭(156/216)·영어 글자 축소(0.85)는 걷어냈다. 마퀴 한 벌 폭은 실측(onLayout). 탐색·필터 시트 사진 칩은 원래 내용 폭이라 그대로. `design.md` §5 주제 칩 · `onboarding-uiux.md` 4.1 반영.
