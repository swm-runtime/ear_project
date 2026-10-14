# [BE] 글로벌(해외 전용 K-컬처) 트랙 — 시장 모델 · 카탈로그 격리 · 시간대 그룹 드립 · 스토어 통화

| 항목 | 값 |
|---|---|
| 대상 | `users`·`contents`·`topics`·`plans`·`notices`·`subscriptions`(+`store_notification_logs`·`archived_users`) 스키마 · 가입·온보딩·탐색·검색·상세·라이브러리·드립·추천 평가·푸시·메일·업로드 DTO · `backend/domain.md`·`spec/api/*`(changes 경유) |
| 요청 파트 | 백엔드 |
| 요청자 | 박준현(테크리드) |
| 담당 | 박준현 |
| Jira | [KAN-185](https://runtime364.atlassian.net/browse/KAN-185) |
| 발행 날짜 | 2026-10-14 |
| 시작 날짜 | 2026-10-14 |
| 기한 | 2026-10-17 (Medium — 1~3일차 마일스톤: 시장 모델·노출 격리까지). 전체 목표: **2026-10-24 글로벌 빌드 심사 제출**(10일 계획) |
| 선행 | 없음(티켓). 사람 손: **결정 2건 확정**(아래 "결정 대기") · K-컬처 주제 트리 초안(AI 티켓 `global-english-track.md`에서 박수헌이 제안, BE가 `topics`에 반영) |
| 관련 | FE `tickets/frontend/pending/global-english-ui.md` · AI `tickets/ai/pending/global-english-track.md` — **이 티켓이 둘을 막는다**(시장 API·발행 계약) |
| 근거 문서 | **`spec/api/global-api.md`(글로벌 트랙 HTTP 계약 — 확정/가안/미결 표시. 구현은 이 문서를 따르고, 계약이 바뀌면 티켓이 아니라 이 문서를 고친다)** · 2026-10-14 글로벌화 조사(BE·FE·AI 세 파트) · `backend/domain.md` · `features/drip-scheduling.md` · `spec/api/subscription-api.md` 4.1 · `common-error-handling.md` 9장 |
| 중요도 | Medium — 기한은 1~3일차 산출물. 전체는 10일 계획이며 콘텐츠 물량·스토어 심사가 코드보다 늦다 |
| 상태 | 대기 |

## 확정된 결정 (2026-10-14 박준현)

- 같은 앱 안에 **KR / GLOBAL 두 시장**. 한국 트랙은 불변.
- 시장 판정은 **기기 언어**: `ko` → KR, 그 외 → GLOBAL. **가입 시 1회 확정해 `users.market`에 저장**(요청마다 헤더로 판정하지 않는다). 결제는 스토어 국가.
- 드립 시각은 **시간대 그룹별**(한국 포함 나라마다 다르게). 1단계는 서비스 날짜 경계는 단일 KST 유지, **발송·배치만 시간대 그룹**(예: 아시아·유럽·미주 3그룹)으로 나눈다. 사용자별 서비스 날짜는 2단계.
- 에러 문구는 **클라이언트가 `error_code`로 번역**. 서버 `message`는 한국어 폴백. 푸시·메일만 서버가 `users.language`로 분기.
- 가격은 **스토어가 주인**(전 세계 가격 설정 완료). `plans.price_krw`는 참고값으로 격하, 플랜 카드에서 제거.
- 영어 진행자는 **영어 전문 새 2인**(윤아·이음 번안 아님). 대본은 영어 네이티브 생성, **주제 체계는 해외 대상(K-컬처)으로 신설**.

## 결정 대기 (기본값으로 진행, 바뀌면 여기 갱신)

- **같은 계정의 시장 전환**: 기본 **불허**(가입 시 확정. 설정에서 언어를 바꿔도 시장은 그대로).
- **연령**: GLOBAL은 **16세 이상 자기 선언**(GDPR 최고 기준·COPPA 13 충족, 부모 동의 흐름 불필요). KR은 현행 18세 유지.

## 무엇을 한다

### 1일차 — 시장 모델 (M)
- `users.market`(enum `kr | global`) · `language_code`(BCP47) · `region_code`(ISO 3166-1) · `timezone`(IANA) 추가. `archived_users`도 동일. `domain.md` 3.1 개정(changes/pending).
- 가입(`POST /auth/social-login`·`sign-up`)과 기기 등록이 앱이 보낸 `language_code`·`region_code`·`timezone`을 받는다(`auth-api.md` 개정). 시장 판정 규칙은 서버 한 곳(`market.policy.ts`): `language_code`가 `ko`로 시작하면 KR, 아니면 GLOBAL. 값이 없으면 KR(기존 사용자 호환).
- 기존 가입자는 `market = kr`로 채운다(마이그레이션 기본값). 다음 앱 실행 때 보내는 값으로 `language_code`·`timezone`만 갱신, `market`은 바꾸지 않는다.
- 요청 로케일: `Accept-Language` 헤더는 **참고용 로그만**, 판정은 `users.market`.

### 2일차 — 카탈로그 격리 (L, 가장 큰 덩어리)
- `contents.market` · `contents.language`, `topics.market`, `plans.market`, `notices.market` 추가. 기존 행은 전부 `kr`/`ko`.
- **노출 쿼리 전부에 market 필터**: 탐색 피드·검색(`content.repository.ts` 가시성 조건)·상세·라이브러리 목록·복원·재개 대상·드립 후보(`findCandidates`·탐험)·인기·공지·요금제 목록(4.1)·온보딩 주제 목록·관심 주제 변경. 누락 검증: **e2e에 "GLOBAL 사용자에게 KR 콘텐츠·주제·공지·요금제가 한 건도 보이지 않는다" 케이스**를 추가한다.
- `content_stats`·`search_query_logs`·주간 지표·어드민 서비스 지표에 market 축(집계는 KST 그대로).
- 추천 평가(`recommend-eval`)에 GLOBAL 합성 카탈로그·페르소나 추가 — 배포 전 평가가 두 시장을 본다.

### 3일차 — 시간대 그룹 드립 · 푸시·메일 언어 · 결제 (M)
- 드립 배치를 **시간대 그룹별 다회 실행**: `users.timezone`을 그룹(예: `Asia/Seoul`·`Europe/*`·`America/*`)으로 묶고 그룹마다 현지 05:00에 해당하는 UTC 시각 크론을 둔다. `drip_batch_runs`에 `group` 축 추가(`run_date` 유니크 → `(run_date, group)`). 재개(resume)·`already_placed` 판정은 그룹 안에서 그대로.
- 푸시 제목·본문(`notification.constant.ts`)과 인증 메일 템플릿을 `users.language`로 분기(ko/en).
- Apple 거래의 `storefront`·`price`·`currency`, Play의 `regionCode`·가격을 `subscriptions`·`store_notification_logs`에 저장. 플랜 카드 DTO에서 `price_krw` 제거(앱은 스토어 현지가만 표시 — `subscription-api.md` 4.1 개정).
- `plans`에 GLOBAL 행(Daily/Pro, 별도 `store_product_id_*`). 요금제 목록은 `users.market`으로 필터.

### 4일차 — 콘텐츠 입구 · 메타 (S)
- 업로드·재발행 DTO(`admin-api.md` 4.6/4.10)와 `enrichment.json`에 `market`·`language` 필수. 발행 시 `contents.market/language` 기록 → **AI 티켓의 발행 선행 조건**.
- 태그 규칙 `^[가-힣A-Za-z0-9]{2,10}$` → 영어 고유명사(공백·20자) 허용으로 완화(파이프라인과 동시 변경). `target_audiences`는 GLOBAL 콘텐츠에서 생략 허용.
- 직군 상수(`user.constant.ts`)는 KR 전용으로 두고 GLOBAL 온보딩은 커리어 단계를 건너뛴다(온보딩 API에 `market`별 단계 정보).

### 5일차 — 통합 검증 · 운영 준비
- 개발계에서 영어 기기 가입 → GLOBAL 판정 → 영어 요금제·주제 → 드립 그룹 배치 → 영어 푸시 실측. KR 계정은 변화 없음(회귀).
- 인증: GLOBAL은 Google/Apple만 노출(앱이 `market`으로 분기 — 서버는 제공자별 독립이라 변경 없음). 약관 버전을 시장별 네임스페이스(`terms_en_v1`)로 — `consents` 개정.
- Sentry 환경 태그에 `market`.
- **사람 손(박준현)**: App Store Connect·Play Console 국가 배포 확장, 영어 리스팅, 구독 상품 현지화, 연령 등급 재설문, Paid Apps·세금 양식 Active 확인, Android 운영 submit 프로필(EAS) — 2단계 전까지 병렬. 영어 약관·개인정보처리방침은 법무(선행, 10일 안에 안 오면 Apple 표준 EULA + 영어 처리방침 초안으로 제출).

## 범위 밖 (공개 후)
- 사용자별 서비스 날짜(재생 한도·체험·주간 별점을 현지 시각으로) — L, 2단계.
- 검색 어간 처리(`to_tsvector` 언어), API 멀티리전, 추가 언어.

## 완료 조건
- Given 영어 기기로 가입한 계정 / When 가입·온보딩·탐색·검색·라이브러리·요금제·공지를 연다 / Then `market = global`이고 KR 콘텐츠·주제·요금제·공지가 **한 건도** 보이지 않는다(e2e)
- Given 한국어 기기 계정 / When 같은 화면을 연다 / Then 종전과 동일하다(회귀 e2e)
- Given GLOBAL 사용자 시간대 그룹 / When 그 그룹의 05:00 현지 시각 / Then 드립 배치가 그 그룹만 돌고 영어 푸시가 나간다. KR 그룹은 05:00 KST 그대로
- Given GLOBAL 사용자가 스토어에서 결제한다 / When 영수증이 반영된다 / Then `subscriptions.storefront/currency/price`가 저장되고 요금제 응답에 `price_krw`가 없다
- Given 업로드에 `market=global, language=en` / When 발행한다 / Then GLOBAL 사용자에게만 노출된다
- `domain.md`·`auth-api.md`·`subscription-api.md` 4.1·`admin-api.md` 4.6/4.10·`common-error-handling.md`(클라이언트 번역 계약) 개정 요청이 `changes/pending`에 있다

## 처리 기록
- 2026-10-14 발행(마크다운 + Jira). 2026-10-14 글로벌화 조사(BE·FE·AI 세 파트 병렬) 결과와 박준현 결정을 반영.
