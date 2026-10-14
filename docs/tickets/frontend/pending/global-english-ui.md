# [FE] 글로벌(해외 전용 K-컬처) 트랙 — i18n 기반 · 영어 UI · 시장 분기(로그인·온보딩·요금제) · 글로벌 빌드

| 항목 | 값 |
|---|---|
| 대상 | `shared/`(i18n·로케일·헤더) · `*.copy.ts` 16개 · `auth`(제공자 분기·연령) · `onboarding`(K-컬처 주제·커리어 생략) · `subscription`(스토어 현지가) · `profile`·`library`·`player`·`settings` 날짜 포맷 · `app.json`(locales·앱 이름) · 랜딩 영어 필수 4페이지(선택 범위) |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현(테크리드) |
| 담당 | 이주호 |
| Jira | [KAN-183](https://runtime364.atlassian.net/browse/KAN-183) |
| 발행 날짜 | 2026-10-14 |
| 시작 날짜 | 2026-10-14 |
| 기한 | 2026-10-17 (Medium — 1~3일차: i18n 기반·핵심 화면 영어·시장 분기). 전체 목표 **2026-10-24 글로벌 빌드 심사 제출** |
| 선행 | BE `tickets/backend/pending/global-market-model.md`(KAN-185 — 시장 판정 API·요금제·주제 응답. 1일차 산출물부터 mock으로 병행 가능) · 사람 손: K-컬처 주제 트리·이미지(AI 티켓) |
| 관련 | AI `tickets/ai/pending/global-english-track.md` · `tickets/frontend/pending/invite-code-event-ui.md`(KAN-182 — **같은 빌드에 묶어 심사 한 번**) |
| 근거 문서 | **`spec/api/global-api.md`(글로벌 트랙 HTTP 계약 — 확정/가안/미결 표시. 구현은 이 문서를 따르고, 계약이 바뀌면 티켓이 아니라 이 문서를 고친다)** · 2026-10-14 글로벌화 조사(FE) · `frontend/architecture.md` · `common-error-handling.md` 9장 · `spec/uiux/*` |
| 중요도 | Medium — 기한은 1~3일차. 10일 계획의 FE 임계 경로는 i18n 리소스 전환(L) |
| 상태 | 대기 |

## 결정 사항 (2026-10-14 박준현)
같은 앱·시장은 기기 언어로 서버가 판정(`users.market`) · 에러 문구는 **클라이언트가 `error_code`로 번역** · 가격은 스토어 현지가만 표시 · 영어 진행자는 새 2인 · 주제 체계는 K-컬처 신설 · (대기) 시장 전환 불허 · GLOBAL 연령 16세 자기 선언.

## 무엇을 한다

### 1일차 — i18n 기반 (M)
- `expo-localization` + i18n 라이브러리(i18n-js 또는 react-i18next) 도입. 기기 `languageCode`·`regionCode`·`timezone`을 **가입·기기 등록 요청에 싣고**(BE 계약) 모든 요청에 `Accept-Language` 헤더.
- 리소스 구조: `*.copy.ts` 16개(1,081줄)를 키-리소스(`ko`/`en`)로 전환. 함수형 카피(`${displayPrice}/월` 등)는 ICU 메시지로. 카피 파일 밖 한국어 리터럴 137줄(`MainNavigator.tsx` 탭 라벨, `api-client.ts` 네트워크 폴백, `sleep-timer.ts`, `content-detail.format.ts`, `app-version.ts`, `accessibilityLabel` 8건) 회수.
- **에러 코드 영어표**: `common-error-handling.md` 9장의 모든 `error_code`에 en 문자열. **누락 시 실패하는 테스트**를 둔다(없으면 해외 사용자에게 서버 한국어 폴백이 보인다).

### 2일차 — 핵심 화면 영어 + 시장 분기 (M)
- 영어 리소스 우선순위: 시작·약관 동의·온보딩·라이브러리·플레이어·탐색·설정·페이월/요금제 관리·프로필. 나머지 화면은 3~4일차.
- 시장 분기(서버 `market` 응답 기준, 클라이언트가 언어로 추측하지 않는다): GLOBAL이면 **로그인 제공자 Google/Apple만**(`auth.constants.ts:30`), 온보딩 주제는 서버가 내려주는 K-컬처 트리(이미지 키는 **id/slug 기반**으로 전환 — `TopicChip.tsx`·`career.images.ts` 한글 키 제거), **커리어 단계 생략**, 연령 체크 16세 문구.
- 요금제: `priceKrw` 의존 제거(`plan-catalog.ts:27` 무료 판정은 서버 `action`/`tier`로), 가격은 스토어 `displayPrice`만. 구독 법적 고지는 시장별(KR 전자상거래법 문구 / GLOBAL Apple·Google 표준 문구).

### 3일차 — 로케일 포맷·시간대 (M)
- 날짜·시간·복수형 `Intl` 전환(`profile.copy.ts` "N월 N일", `content-detail.format.ts`, `player.format.ts`, `subscription.copy.ts:8`).
- `WeeklyChart.tsx`의 기기 시각 −5h KST 가정 제거 → 서버가 준 서비스 날짜 라벨 사용(BE와 합의).
- 법적 링크 locale 경로(`legal-urls.ts`), 설정 "언어/지역" 항목(표시 언어 변경, 시장은 변경 불가).

### 4~5일차 — 레이아웃 QA · 빌드
- 고정 폭 ~24곳(`WeeklyChart` 주 라벨·`StartScreen`·`TermsConsentScreen`·`CareerInfoScreen`) flex 전환, 영어 장문 QA, Android 폰트 폴백 확인.
- `app.json` `expo.locales`(ko/en)·`CFBundleLocalizations`·앱 이름 현지화(영문명 PM 확정). runtimeVersion 올린 네이티브 빌드 → 개발계 TestFlight·내부 테스트.
- **이벤트 코드(KAN-182)를 같은 빌드에 포함**해 심사 한 번으로.

### 6~8일차 — 스토어 제출 준비
- 영어 리스팅 자료(스크린샷 영어 UI·설명·키워드) 전달, 글로벌 빌드 심사 제출(iOS·Android). 심사 노트에 영어 테스트 계정·K-컬처 저작물 미사용 명시.
- (선택 범위) 랜딩 영어 필수 4페이지(소개·약관·개인정보·계정 삭제) — `landing-page/src/content/site.ts` 영어판 + `/en` 경로 + `hreflang`. 법무 영어 약관이 없으면 Apple 표준 EULA 링크로 대체.

## 범위 밖 (공개 후)
RTL · 추가 언어 · 랜딩 전면 영어화 · 사용자별 서비스 날짜 반영 UI.

## 완료 조건
- Given 영어 기기 / When 가입부터 재생까지 / Then 모든 사용자 노출 문구가 영어이고 한국어 리터럴이 보이지 않는다(스크린샷 QA 체크리스트)
- Given GLOBAL 계정 / When 시작·온보딩 / Then Google/Apple만, K-컬처 주제, 커리어 단계 없음, 연령 16세 문구
- Given 서버가 모든 `error_code`를 낸다 / When 테스트 / Then en 문자열 누락 0건
- Given 요금제 화면 / Then 가격은 스토어 현지가만, `price_krw` 사용 0건
- Given 한국어 기기 / Then 종전과 동일(회귀)
- Given 글로벌 빌드 / Then runtimeVersion 올림, `app.json` locales, 이벤트 코드 포함, 2026-10-24까지 심사 제출

## 처리 기록
- 2026-10-14 발행(마크다운 + Jira). 2026-10-14 글로벌화 조사(FE) 결과와 박준현 결정 반영.
