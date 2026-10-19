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
- 2026-10-15 코드 반영(브랜치 `feat(fe)/global-formats-plans-age`, 미커밋). 상태는 **진행 중** — 영어 실기기 스크린샷 QA 가 남아 `pending/` 에 둔다.
  - **날짜·복수형 → `Intl`**: 공용 `frontend/src/shared/i18n/format.ts`(+ 테스트 — en · en-GB · America/New_York 포함). 서버 날짜 라벨(`YYYY-MM-DD` — `last_free_date`·이벤트 `last_date`·`week_start`)은 문자열을 나눠 **UTC 로 포맷**해 시간대가 날짜를 밀지 않는다. ISO 순간(`renews_at`·`published_at`·공지)은 기기 시간대 날짜. **한국어는 종전 문자열을 그대로 조립**한다(기기 ICU 차이로 한 글자도 안 바뀌게 — `copy-ko.snapshot.test` 무변경 통과). 영어는 `Intl.DateTimeFormat`(기기 로캘 순서 — en-US "Oct 15" · en-GB "15 Oct"), 복수형은 `Intl.PluralRules` — **Hermes 는 `PluralRules` 가 없는 버전이 있어** 없으면 영어 규칙(1 = one)으로 폴백한다. 적용: `profile.copy.ts` · `content-detail.format.ts` · `player.format.ts` · `subscription.copy.ts`(날짜 함수만) · `settings.copy.ts` · `notice.format.ts`(영어는 "Oct 15, 2026") · 영어 복수형(`player.copy` · `sleep-timer` · `explore.copy` · `interest.copy` · `library.copy` · `onboarding.copy`). `shared/lib/date-only.ts` 는 `format.ts` 의 `parseDateLabel` 로 대체해 지웠다. 영어 회귀는 `frontend/src/app/copy-en-format.test.ts`.
  - **`WeeklyChart` 기기 시각 보정 0건**: `SERVICE_DAY_OFFSET_MS`(기기 시각 −5h) 삭제. 이번 주 "오늘" 요일은 **서버가 준 오늘 서비스 날짜**(잔여 재생 표시값 `service_date` — 라이브러리·탐색·재생 응답, player `usePlayLimitStore`)와 `week_start` 라벨의 차이로 정한다(`profile.format.ts` `toServiceDayIndex`). 프로필 응답 자체에는 오늘 날짜가 없어서 고른 원천이다. 값이 없거나 그 주 밖이면 오늘 강조를 하지 않고 기록이 있는 마지막 요일까지를 지난 날로 센다. 문서: `docs/features/profile.md` 7장 "05시 경계 부근 진입" · `docs/frontend/architecture.md` 4.4 profile 행(player 의존 추가).
  - **법적 링크 locale**: `frontend/src/shared/lib/legal-urls.ts` — 표시 언어 영어면 `https://earcast.co.kr/en/terms` · `/en/privacy`(env `EXPO_PUBLIC_TERMS_URL_EN` · `EXPO_PUBLIC_PRIVACY_POLICY_URL_EN` 로 덮을 수 있다), 한국어는 종전 env·주소 그대로. 앱에는 계정 삭제 링크가 없어(스토어 등록 정보에만) 손대지 않았고, `LICENSES_URL` 은 영어 페이지가 없어 한국어 그대로다. 인증 화면의 약관 링크(`auth.constants.ts`)는 auth 작업 몫.
    - **2026-10-16 기준 변경(KAN-216)**: 위 "표시 언어 영어면"은 **시장 기준**으로 바뀌었다 — `legalUrlsFor(market)`(GLOBAL → `/en/…`, KR → 종전). 가입 전(A4)은 A21에서 고른 언어의 시장, 가입 후(설정·구독 고지·재동의)는 세션 `user.market`. 상수 `TERMS_URL`·`PRIVACY_POLICY_URL` 은 없앴다. 근거·경위는 `global-consent-screen-legal.md` 처리 기록.
  - **고정 폭**: 아래 "고정 폭 체크리스트" 9곳.
  - **남은 것**: ① 영어 기기(en-US · America/New_York) 실기기 스크린샷 QA — 프로필·상세·플레이어 날짜, 체크리스트 9곳 + 인증 화면, 버튼 2줄·Android 폰트 폴백. ② `Intl.DateTimeFormat`(timeZone `UTC`) 출력이 Hermes iOS·Android 에서 en-US "Oct 15" 로 나오는지 실기기 확인(폴백은 있으나 모양이 같은지). ③ 오늘 서비스 날짜를 프로필 응답이 직접 주면(BE `weekly_listening.service_date` 등) player 의존을 걷을 수 있다 — 필요하면 BE 요청.
- 2026-10-18 영어 화면 QA 반영(PR `fix(fe)/global-en-layout-qa`) — 아래 체크리스트 10~13행 추가: 탐색 인기 제목 줄(영어는 토글을 다음 줄로) · 온보딩 주제 알약 en 184 → 216(+라벨 여백 16·한 줄 축소) · 상세 메타 라벨 열(최대 라벨 폭 실측) · 프로필 누적 청취 값 숫자만. 상세 길이 영어는 초 0 이면 "5 min". 실기기 확인이 남아 pending 유지.

## 고정 폭 체크리스트 (2026-10-15)

> 범위: `features/auth/**`(StartScreen·TermsConsentScreen — 다른 작업 몫)·`features/subscription/**` 제외. `width:` 숫자·상수를 전부 훑어 **글자를 담는 칸**만 골랐다. 썸네일·시트 손잡이·원형 아이콘 버튼·스켈레톤 블록(`CareerInfoScreen` 180 · `InterestManagementScreen` 96 · `WeeklyChart` 120)·`minWidth` 터치 타깃은 글자와 무관해 그대로 둔다. 탭 바 칸(`CapsuleTabBar` ITEM_WIDTH ≈110, 라벨 11pt 한 줄)·연차 토글(`YearsSegment`, flex)·주제 거품(`InterestBubble`, 두 줄 + 글자 줄임)은 이미 영어가 들어가 바꾸지 않았다. 아래 "확인"은 실기기 영어 스크린샷으로 볼 자리다.

| # | 위치 | 영어에서 생길 문제 | 바꾼 것 | 한국어 |
|---|---|---|---|---|
| 1 | `frontend/src/features/profile/components/WeeklyChart.tsx:880` 주 범위 라벨 | 고정 폭 140 — 글자 크기 설정·로캘 순서("26 Oct – 1 Nov")에 따라 넘치면 말줄임 | `width: 140` 삭제, `minWidth: 140` 만(화살표가 주마다 뛰지 않는 목적은 유지) | 140 안이라 동일 |
| 2 | `WeeklyChart.tsx:939` 하루 평균 오른쪽 두 줄(`rankBlock`) | "vs. Wednesday the week before"(16pt)가 큰 숫자를 밀어냄 | `maxWidth: '62%'`, 아랫줄 `rankText` `flexShrink: 1`(`:964`) — 줄 안 말줄임 | 상한 안이라 동일(숫자만 줄어드는 종전 규칙 유지) |
| 3 | `WeeklyChart.tsx` 오른쪽 축(`AXIS_WIDTH` 48, 라벨 자리 28) | "180 min" 이 잘림 | 축 칸은 그대로, 영어 카피를 "180m"·"<1m" 로(`profile.copy.ts:557` `axisMax`) | 카피 불변 |
| 4 | `frontend/src/features/explore/components/PopularPeriodToggle.tsx:24` 인기 구간 토글(시스템 UISegmentedControl) | 칸 52 × 3 — "Monthly"·"All time" 잘림 | 칸 폭 언어별: ko 52 · en 76 | 52 그대로 |
| 5 | `PopularPeriodToggle.tsx:77` JS 토글(Android·옛 iOS 빌드) | iOS 옛 빌드는 기본 칸 48 | 영어면 같은 76 을 넘긴다 | 종전 그대로 |
| 6 | `frontend/src/shared/ui/SegmentedControl.tsx:190·206` 칸 라벨 | 고정 칸에서 두 줄로 접혀 칸 밖으로 잘림 | `numberOfLines={1}`(말줄임) | 한 줄이라 동일 |
| 7 | `frontend/src/features/onboarding/components/TopicSelectSkeleton.tsx:14` 온보딩 주제 마퀴 알약(`TOPIC_PILL_WIDTH`) | 156 고정 — "Personal Finance" 등 말줄임 | ko 156 · en 184(마퀴는 알약 폭이 같아야 해 언어별 고정값) | 156 그대로 |
| 8 | `frontend/src/features/career/components/JobCategoryChips.tsx:58·112` 직군 사진 칩(2열 고정 폭·높이 56) | 긴 이름이 세 줄로 넘쳐 칩 밖으로 잘림 | `numberOfLines={2}` + 가운데 정렬 | 한 줄 이름이라 동일 |
| 9 | `frontend/src/features/career/screens/CareerInfoScreen.tsx:44·231` 앱바 가운데 제목(줄 전체에 겹친 절대 배치) | 긴 제목이 [초기화]·뒤로 밑으로 겹침 | 좌우 104 비움(`APP_BAR_TITLE_INSET`) + `numberOfLines={1}` | 제목이 짧아 위치·모양 동일 |
| 10 | `frontend/src/features/explore/screens/ExploreScreen.tsx` 인기 섹션 제목 줄(제목 + 토글 76×3) | 제목 칸이 약 150 뿐이라 서버 제목이 두 줄로 접힘(2026-10-18 QA) | 영어만 행 `flexWrap` — 한 줄에 안 들어가면 토글을 제목 아래 줄로(말줄임 없음, explore-uiux 7장) | 바꾸지 않음 |
| 11 | 7행 재조정 — `TopicSelectSkeleton.tsx` `TOPIC_PILL_WIDTH` · `interest/components/TopicChip.tsx` 라벨 | GLOBAL 주제 "Korean History & Society"·"K-Beauty & Fashion" 이 184 에서도 말줄임(10-18 QA) | en 184 → 216, 영어 라벨 좌우 여백 24 → 16 + 한 줄 축소(`adjustsFontSizeToFit` 0.85) | 156·여백 24 그대로 |
| 12 | `frontend/src/features/content-detail/components/ContentDetailMeta.tsx` 메타 라벨 열(`minWidth: 56`) | "Published" 가 56 보다 길어 그 행만 값이 밀림(10-18 QA) | 라벨 실측 최대 폭을 모든 라벨의 최소 폭으로 | 라벨이 56 안이라 동일(글자 200% 에선 열이 함께 넓어진다) |
| 13 | `frontend/src/features/profile/profile.copy.ts` 누적 청취 타일 값 | "12 episodes" 가 두 줄로 접히고 라벨 "Episodes played" 와 겹말(10-18 QA) | 영어 값은 숫자만 | 카피 불변("N편") |
| 14 | `frontend/src/features/profile/profile.copy.ts` 하루 평균 오른쪽 두 줄(2행 `rankBlock` 의 영어 문구) | 2026-10-19 실기기(iPhone, en · New York): 요일 선택 시 "vs. Thursday the week…" · "12 hr 38 min m…" 둘 다 말줄임 — 2행의 폭 상한만으로는 부족 | 화면 문구만 짧게: lead "vs. last week"·"vs. prior week"·"vs. last Thursday"·"vs. prior Thursday", main "12h 38m more"(큰 숫자와 같은 h·m). 낭독은 종전 풀어 쓴 문장 그대로 | 카피 불변 |
| 15 | `WeeklyChart.tsx` `AverageValue` 1분 미만 갈래 · `profile.copy.ts` 들은 날 수·그날 편 수(2행 `rankBlock` 문구) | 2026-10-19 실기기: 화요일 선택 시 큰 숫자 "<1 min" 이 "<1" / "min" 두 줄로 접힘(이 갈래만 한 줄 고정이 없었다) · 오른쪽 "Listened to 1 e…" 말줄임 | 1분 미만 갈래도 숫자 갈래처럼 `numberOfLines={1}` + 글자 줄임 · 화면 문구는 수만("1 episode"·"3 days" — 윗줄 "That day"·"This week"), 낭독은 문장 그대로 | 카피 불변(한국어 "1분 미만"도 넘치면 한 줄 안에서 줄어든다) |
| 16 | `career.copy.ts` `yearsChip` · `onboarding.copy.ts` `yearsOption` 연차 칸 영어 문구(`YearsSegment` 4칸 균등·한 줄) | 2026-10-19 실기기: 커리어 정보 연차 "1 year or less"만 말줄임(다른 칸 "2–3 years"·"7+ years"는 들어감) | 영어만 "0–1 year" — 다른 칸과 같은 "N–M" 꼴로 짧게. 낭독도 같은 문구 | 카피 불변("1년 이하") |

남은 확인(실기기 영어 스크린샷): 위 13곳 + 인증 화면(StartScreen·TermsConsentScreen — 다른 작업) + 버튼 2줄·Android 폰트 폴백. 실측에서 잘림이 나오면 이 표에 행을 더한다.
- 2026-10-19 **실기기 확인 진행(PM, iPhone · 개발계 · 설정 › 언어 English · 시간대 America/New_York)**: 주간 차트 "오늘" 요일이 서버 서비스 날짜(10-19 월)대로 — 기기 시각 보정 없음 확인(조건 2 실기기). 잘림 1곳 발견 → 표 14행 수정(PR `fix(fe)/profile-rank-en-truncation`). 나머지 날짜·잘림 확인 계속, pending 유지.
- 2026-10-19 실기기 확인 이어서(PM): 탐색 인기 구간 토글 · 관심 주제 칩 이름 잘림 없음. 커리어 정보 연차 "1 year or less" 말줄임 → 표 16행 수정.
