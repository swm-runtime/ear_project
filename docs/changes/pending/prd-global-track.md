# PRD에 글로벌(국제화) 트랙 FR 추가 — FR-42~FR-48 · 정책 절 · features 결정 목록 · 인덱스

| 항목 | 값 |
|---|---|
| 대상 문서 | `prd/ear_root_prd.md`(4.1 수익화 · 4.2 · 5.1 · 6장 머리말 · **6.10 신설** · 7장 개인정보·보안 · 8.3 리스크 표) · `features/README.md`(FR 커버리지 표 · 🟢 결정 포인트 표 57~67행 신설) · 루트 `CLAUDE.md`(파일별 인덱스 `spec/api/` 줄) · `spec/api/global-api.md` 8행(머리말) |
| 요청 파트 | 백엔드 — 박준현 |
| 발행 날짜 | 2026-10-20 |
| 시작 날짜 | 2026-10-20 |
| 기한 | 2026-10-23 (Low — 다음 통합 때 반영. 계약·코드는 바뀌지 않는다) |
| 선행 | 없음. 단 `changes/pending/global-api-current-state.md` 1-12(9장 #6·#7·#8 삭제)와 같은 통합에 반영하면 아래 "9장 #3·#4"의 번호가 그대로 맞는다 |
| 중요도 | Low — PRD에 이미 결정·구현된 것을 FR로 옮긴다 |
| 관련 | [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) 글로벌 에픽 · KAN-188(카탈로그 격리) · KAN-190(발행 계약) · KAN-191(시간대 그룹) · KAN-192(요금제 보류) · KAN-198(Earcast) · KAN-206·KAN-220(연령) · KAN-212(동의 버전) · KAN-215(국외 이전) · KAN-227(시장 전환) · KAN-229(1.3.0 운영 스위치) · `spec/api/global-api.md` |

## 배경

글로벌 트랙(해외 전용 K-컬처, 앱 1.3.0)은 계약·구현이 끝났는데 PRD에 FR이 없다. `global-api.md` 8행이 "글로벌 트랙 `features/` 문서는 아직 없다 — 이 문서가 그 자리를 임시로 맡고 … **FR은 다음 통합 때 PRD에 추가한다**"고 미뤄 두었다. FR이 없으면 `features/README.md` FR 커버리지·PRD 결정 포인트에서 글로벌 결정이 보이지 않고, "왜 GLOBAL은 커리어 단계가 없나 · 왜 16세인가" 같은 질문에 PRD → features 순서(루트 `CLAUDE.md` 상황별 참조 가이드)로 답할 수 없다.

PRD는 공유 문서라 개발 중 직접 고치지 않는다(루트 `CLAUDE.md` 요청 문서 절). 아래에 **추가할 문구를 그대로** 적는다. 모든 문장은 `global-api.md`와 dev(e31a97bd) 코드로 대조했다 — 근거는 각 FR 아래 "근거" 줄.

### 우선순위를 정한 방식 — PM 확인 필요(결정 항목)

PRD 6장의 P0/P1은 "P0 = MVP 필수 / P1 = 지연 시 시범 운영 초기로 이월 가능"이다. 글로벌 트랙은 MVP 뒤의 트랙이라 이 정의를 그대로 쓸 수 없어, 6.10에 한해 **"P0 = 1.3.0 글로벌 출시(`GLOBAL_SIGNUP_ENABLED`를 여는 시점)에 필수 / P1 = 연 뒤에 붙여도 되는 것"** 으로 읽었다. 1.3.0을 본 출시로 본다(`frontend/app.json` `expo.version` 1.3.0 · runtime 36 주석 "앱 1.3.0 글로벌 출시 빌드").

| FR | 고른 우선순위 | 이유 |
|---|---|---|
| FR-42 시장 판정·가입 | P0 | 시장이 없으면 나머지 전부가 성립하지 않는다 |
| FR-43 카탈로그 격리·영어 표시 | P0 | 격리 누락은 데이터 유출(`global-api.md` 7장) |
| FR-44 연령·동의 | P0 | 법적 요건 — 동의 없이 해외 사용자 정보를 국외로 넘길 수 없다 |
| FR-45 시장 전환 | P0 | PM 결정(2026-10-19)으로 1.3.0에 함께 나간다(`global-api.md` 2.1 "전환" 행). 스위치 `MARKET_CHANGE_ENABLED`로 늦게 열 수는 있다 |
| FR-46 시장별 서버 문구(푸시·메일·요금제) | P0 | GLOBAL 사용자가 한국어 알림·메일을 받으면 안 된다 |
| FR-47 시간대별 드립 그룹 | **P1** | 꺼져 있어도 GLOBAL은 05:00 KST 배치(종전 동작)로 받는다. 경계는 `global-api.md` 9장 #3 미결 |
| FR-48 운영 — 업로드 시장·지표 분리 | P0 | 업로드에 시장이 없으면 격리(FR-43)가 깨진다. 지표 분리는 PoC 성과 판단의 전제 |

**PM이 다르게 정하면 6.10의 `(P0)`/`(P1)`만 바꿔 반영한다**(FR-45를 P1로 내리는 안 · FR-47을 P0로 올리는 안이 가장 그럴듯한 대안이다).

## 수정 내용

### 1. `prd/ear_root_prd.md` — 6.10 신설(6.9 뒤, 7장 앞)

6장 머리말의 P0/P1 정의 줄(148행) 뒤에 한 줄을 더한다.

> 6.10(글로벌 트랙)은 MVP 뒤의 트랙이라 **P0 = 1.3.0 글로벌 출시(글로벌 가입을 여는 시점)에 필수 / P1 = 연 뒤에 붙여도 되는 것**으로 읽는다.

6.9 뒤에 아래 절을 그대로 넣는다.

```markdown
### 6.10 글로벌 트랙 (국제화 — 앱 1.3.0)

해외 사용자에게 영어 K-컬처 콘텐츠를 같은 앱·같은 API로 제공한다. 서버가 사용자의 **시장**(`kr`·`global`)으로 응답을 가르고, 클라이언트는 시장별로 다른 엔드포인트를 부르지 않는다. **KR 사용자의 동작은 이 절로 바뀌지 않는다.** 계약은 `spec/api/global-api.md`(글로벌 `features/` 문서가 생기기 전까지 그 자리를 대신한다). 아래 서버 스위치 세 개(`GLOBAL_SIGNUP_ENABLED`·`MARKET_CHANGE_ENABLED`·`DRIP_TIMEZONE_GROUPS_ENABLED`)는 모두 기본 닫힘이고 출시 순서(GLOBAL 주제 노출 → 콘텐츠 발행 → 스위치)에 맞춰 연다.

- **FR-42** (P0) 시장 판정·가입: 사용자는 시장 `kr`·`global` 중 하나에 속한다. 시장은 **가입 때 1회 서버가 정한다** — 입력은 기기 언어가 아니라 **가입 화면에서 사용자가 고른 콘텐츠 언어**(A21 `preferred_language` — `ko` → `kr`, `en` → `global`)이고, 기기 언어는 그 화면의 기본 선택값으로만 쓴다(값이 없는 구 앱은 기기 언어 `ko*` → `kr`, 그 밖 `global`, 그것도 없으면 `kr`). 기기 언어로 자동 판정하면 영어 기기를 쓰는 한국 사용자가 GLOBAL로 가기 때문이다(결정 2026-10-14). 클라이언트는 시장을 보내지 않으며 요청마다 헤더로 다시 판정하지 않는다. **글로벌 가입 스위치(`GLOBAL_SIGNUP_ENABLED`)가 닫혀 있으면 GLOBAL 판정도 `kr`로 만든다** — GLOBAL 카탈로그가 비어 있는 동안 가입하면 온보딩 주제가 0개라 진행할 수 없다(2026-10-15). GLOBAL 사용자의 앱은 **영어 화면**(앱 이름 **Earcast** — PM 확정 2026-10-18, KAN-198)이고 가입 때 고른 언어로 표시 언어를 맞춘다(그 뒤엔 설정 › 언어로 따로 바꾼다 — 표시 언어를 바꿔도 시장은 그대로다, 2026-10-19). 로그인 화면은 **표시 언어가 영어면 Google·Apple만** 노출한다 — 로그인 전에는 시장을 모르므로 시장이 아니라 표시 언어로 거르고, 카카오·네이버는 국내 계정이라 뺀다(PM 결정 2026-10-15 — `auth-uiux.md` 4장). **GLOBAL 온보딩은 관심 주제 한 단계뿐이다** — 커리어는 한국 직군 분류라 고를 값이 없다. 단계 목록은 서버가 `steps[]`로 내려주고 클라이언트는 하드코딩하지 않는다(`global-api.md` 2.1 · 4.1 · 4.4).
- **FR-43** (P0) 카탈로그 격리·영어 표시: 콘텐츠·주제·공지는 시장별 **별도 행**이고(번역 테이블이 아니다), 사용자는 **자기 시장의 것만** 본다 — 탐색·검색·라이브러리·상세·플레이어·재개·드립·탐험·온보딩 추천 전부. 다른 시장 콘텐츠는 상세 URL로 직접 접근해도 404다. 다른 시장의 주제를 관심 주제로 저장할 수 없고(409), 자동 확장도 같은 시장 안에서만 일어난다. **격리 누락은 데이터 유출로 본다.** 콘텐츠 응답의 `language`는 표시용이며 거르는 책임은 서버에 있다. 주제 이미지 키는 이름이 아니라 `slug`다(`global-api.md` 4.5 · 4.7 · 4.8 · 7장).
- **FR-44** (P0) 연령·동의(국외 이전): 가입 연령 확인 기준은 시장·나라별이고 **서버가 판정해** 동의 항목의 `min_age`로 내려준다 — **KR 18 · GLOBAL은 기기 지역(`region_code`)이 싱가포르·홍콩·한국이면 16, 그 밖·지역 모름은 18**(자기 선언, PM 결정 2026-10-16 — KAN-206). GLOBAL은 확인한 기준을 동의 이력 버전(`age-16`·`age-18`)으로 남기고, 16으로 확인한 사용자가 18 지역으로 옮기면 한 번 다시 묻는다. **약관·처리방침 동의 버전은 시장별**이다(KR `0.1` · GLOBAL `global-0.1`, 다른 시장 버전은 409 — KAN-212). **GLOBAL 가입 필수 동의에 국외 이전 동의(`cross_border_transfer`)가 있다** — 해외 사용자 정보가 서울 서버와 해외 외부 서비스로 넘어가서다. KR은 받지 않는다(KAN-215)(`global-api.md` 2.1 · 4.1).
- **FR-45** (P0) 시장 전환: 가입 뒤 **설정 › 콘텐츠 언어**에서 시장을 바꿀 수 있다(PM 결정 2026-10-19 — KAN-227). 전용 엔드포인트가 미리보기 → 실행 2단계로 처리하고, **새 시장의 필수 동의(연령 포함)를 전환 요청에서 받는다** — 동의 없이 새 시장 콘텐츠가 나가는 틈을 두지 않는다. 전환은 한 트랜잭션으로 이전 시장 관심 주제를 비활성하고 **재온보딩**(새 시장의 `steps[]`)으로 보낸다. 라이브러리·재생 위치·완청은 남기되 시장 조건으로 숨고, 구독·재생 한도·체험·초대 코드는 그대로다. **서비스 날짜(05:00 KST)당 1회**이며(429 `MARKET_CHANGE_COOLDOWN`), **재온보딩을 끝내기 전 직전 시장으로 되돌리는 것은 횟수에 세지 않는다**(되돌리기를 다시 되돌리는 것은 예외가 아니다). 새 시장에 노출 주제가 없거나 전환 스위치(`MARKET_CHANGE_ENABLED`)가 닫혀 있으면 막는다 — GLOBAL로의 전환은 글로벌 가입 스위치도 따른다(409 `MARKET_UNAVAILABLE`). 같은 계정의 다른 기기는 다음 토큰 갱신(최대 30분)까지 이전 시장을 본다(`global-api.md` 4.11 · 7장).
- **FR-46** (P0) 시장별 서버 문구: 서버가 만드는 문자열의 언어는 기기 언어가 아니라 **`users.market`으로 고른다**(KR → 한국어 · GLOBAL → 영어, 2026-10-14) — 드립 도착 푸시, 인증 메일(영어 브랜드 `Earcast`), 요금제 이름·설명(같은 요금제 행의 `name_en`·`description_en`, 2026-10-16). 화면 문구와 에러 문구는 클라이언트가 소유한다(에러는 `error_code`로 번역). **GLOBAL 전용 요금제·스토어 상품·USD 가격은 두지 않는다** — 같은 상품을 스토어 현지가로 팔고, 앱은 가격을 스토어 현지가로만 그린다. 해외에 다른 가격·혜택을 둘 때 재개한다(보류 2026-10-14 — KAN-192, `global-api.md` 9장 #4)(`global-api.md` 2.3 · 4.6).
- **FR-47** (P1) 시간대별 드립: 드립 편성과 도착 알림을 사용자 시간대 그룹의 **현지 시각**에 맞춘다 — 그룹은 asia(기준 `Asia/Seoul`)·europe(`Europe/London`)·americas(`America/Chicago`) 3개, 편성은 그룹 기준 시간대의 **현지 05:00**, 도착 알림은 **현지 07:00**(KR은 07:00 KST). GLOBAL 시장만 가르고 KR·시간대 모름은 asia다. 서비스 날짜 경계(재생 한도·하루 1회 판정)는 전 시장 05:00 KST 단일로 둔다. 서버 스위치(`DRIP_TIMEZONE_GROUPS_ENABLED`)가 꺼져 있으면 전원 asia(종전 05:00 KST)다(2026-10-14 — KAN-191). **그룹 경계·그룹 수는 미결**(`global-api.md` 2.4 · 9장 #3).
- **FR-48** (P0) 운영 — 업로드 시장·지표 분리: 관리자 콘텐츠 업로드에 **`market`·`language`가 필수**다(조합 `kr`↔`ko` · `global`↔`en`, 지정 주제가 전부 같은 시장 — 아니면 400. 2026-10-19 KAN-190 2단계). 기본값으로 `kr`을 채우지 않는다 — 값이 빠진 영어 콘텐츠가 KR 카탈로그에 조용히 섞이기 때문이다. 영어 고유명사 태그(공백 포함)를 허용한다. 운영 집계는 시장으로 나눈다 — 어드민 운영 현황의 `by_market`(가입·활성·청취·결제, 2026-10-14), 검색 질의 로그의 시장 필터(2026-10-15), **일일 Slack 보고의 시장별 가입·청취·탈퇴와 시장 전환 건수**(2026-10-17·10-19). 시장별 집계는 현재 시장 기준이다(`global-api.md` 4.9 · 4.10 · 4.11 "지표").
```

**근거(코드 — dev e31a97bd)**

| FR | 근거 |
|---|---|
| FR-42 | `backend/src/modules/user/policies/market.policy.ts` `resolveMarket`(preferred → device → default `kr`, 스위치 닫힘 → `global_closed`) · `user/services/user.service.ts` `resolveSignUpMarket`(`GLOBAL_SIGNUP_ENABLED === 'true'`일 때만 열림) · `user/policies/onboarding-steps.policy.ts` `onboardingStepsFor`(KR `topic,career` · GLOBAL `topic`) · `frontend/app.config.js` 81행(홈 화면 이름 이어/Earcast, KAN-198) · `frontend/src/shared/i18n/` · `changes/pending/global-display-language-follows-signup.md`(표시 언어 PM 확정 2026-10-19) · `spec/uiux/auth-uiux.md` 88–92행(제공자 목록은 표시 언어로 거름) · 20·127행(A21은 로그인 뒤·A4 동의 앞) |
| FR-43 | `backend/test/global-catalog-isolation.e2e-spec.ts` · `CONTENT_VISIBILITY_CONDITION`(`content/repositories/content-topic.repository.ts` 등) · `changes/archive/global-catalog-market.md` · `changes/archive/global-market-mismatch-and-steps.md` |
| FR-44 | `user/policies/age-confirmation.policy.ts`(`REDUCED_MIN_AGE_REGIONS` = SG·HK·KR, 기본 18, `age-${n}`) · `user/user.constant.ts`(GLOBAL `global-0.1` · `CROSS_BORDER_TRANSFER` 필수) · `changes/archive/global-consent-version-namespace.md` · `changes/archive/global-cross-border-consent-backend.md` |
| FR-45 | `user/services/user-market-change.service.ts` `isTargetOpen`(전환 스위치 + GLOBAL은 가입 스위치) · `judgeCooldown`(되돌리기 판정 · `countNonRevertByUserIdSince`) · `modules/market-change/` · `changes/archive/global-market-change-design.md` |
| FR-46 | `user/policies/market.policy.ts` `messageLanguageOf` — 호출부 `notification/services/drip-arrival-notification.service.ts` 151행 · `user/services/email-verification.service.ts` 166행 · `subscription/policies/plan-text.policy.ts` · `user/verification-mail.template.ts` `EN_BRAND = 'Earcast'` · `tickets/backend/pending/global-plans-storefront.md`(보류) |
| FR-47 | `drip/drip-group.policy.ts`(그룹 3개·기준 시간대·`DRIP_ARRIVAL_PUSH_LOCAL_HOUR = 7`) · `drip-batch/drip-batch.orchestrator.ts` 151행(`DRIP_TIMEZONE_GROUPS_ENABLED`) |
| FR-48 | `admin/dto/upload-content-request.dto.ts` 112–122행(`market`·`language` 필수, `@IsOptional` 없음) · `admin/dto/admin-insights-summary-response.dto.ts` `by_market` · `admin/services/daily-metrics.format.ts`(가입자·시장별 청취·탈퇴·시장 전환 줄) · `changes/pending/upload-market-language-required.md` |

### 2. `prd/ear_root_prd.md` — 정책 절 덧붙임

PRD에는 별도 "결정 포인트" 절이 없고 정책이 4장(범위)·7장(비기능)·8.3(리스크)에 흩어져 있어, 글로벌 정책도 그 자리에 둔다.

1. **4.1 "수익화" 끝**에 한 줄:
   > - **글로벌(GLOBAL 시장)은 같은 요금제·같은 스토어 상품을 스토어 현지가로 판다.** GLOBAL 전용 요금제·USD 가격은 두지 않고(보류 — KAN-192), 이름·설명만 영어로 내려준다(FR-46).
2. **4.2 "MVP에 포함하지 않을 것" 끝**에 한 줄:
   > - **글로벌 트랙 2단계**: 영어 외 추가 언어, 한 시장 안의 여러 언어, 사용자별(시간대별) 서비스 날짜 경계 — 1.3.0은 시장당 언어 하나, 서비스 날짜는 전 시장 05:00 KST다(`global-api.md` 1장·2.4).
3. **5.1 "신규 사용자" 흐름 아래**에 한 줄:
   > - 신규 가입은 소셜 로그인 뒤 **콘텐츠 언어 선택**(A21)을 거쳐 약관 동의로 간다 — 고른 언어가 시장과 동의 목록을 정한다(FR-42·FR-44, PM 결정 2026-10-16). GLOBAL은 관심 주제 선택 뒤 커리어 단계 없이 완료로 간다.
4. **7장 "개인정보·보안"의 하위 목록 끝**에 두 줄:
   > - **연령 기준은 시장·나라별이다**(FR-44): KR 만 18세. GLOBAL은 본인 동의 연령이 16 이하인 싱가포르·홍콩·한국 기기 지역은 16세, 18세 미만에 법정대리인 동의가 필요한 나라(말레이시아·필리핀·인도네시아)·성년 20인 태국·지역 모름은 18세. 기기 지역은 사용자가 바꿀 수 있는 자기 선언 수준의 근거이고, 확인한 기준을 동의 이력에 남긴다(PM 결정 2026-10-16 — KAN-206). 스토어 등급은 Apple 16+ · Play 16–17/18+로 맞춘다.
   > - **해외 사용자 정보의 국외 이전은 별도 필수 동의로 받는다**(FR-44 — GLOBAL만). 시장 전환으로 GLOBAL에 들어올 때도 같은 동의를 받는다(FR-45). `region_code`와 IP를 묶어 저장하지 않는다(위치 추정 금지 — `global-api.md` 7장).
5. **8.3 리스크 표**에 한 행:
   > | 시장 격리 누락 | 한국어 콘텐츠가 해외 피드에(또는 그 반대로) 노출 — 데이터 유출 | 콘텐츠를 반환하는 모든 경로가 같은 가시성 조건 + 시장을 쓴다, 교차 접근 e2e(`global-catalog-isolation`), 업로드 `market` 필수(FR-48) |

### 3. `features/README.md`

1. **FR 커버리지 표**에 행을 더한다(글로벌 `features/` 문서가 없어 계약 문서를 적는다). 표 아래 "FR-01 ~ FR-40 전부 커버됨."은 "FR-01 ~ FR-41 전부 커버됨. FR-42 ~ FR-48(글로벌)은 `features/` 문서 없이 `spec/api/global-api.md`가 임시로 맡는다."로 바꾼다. (FR-41 행 `drip-feedback`도 표에 없다 — 같이 더한다.)

   | FR | 문서 |
   |---|---|
   | FR-41 | drip-feedback |
   | FR-42 | global-api 2.1·4.1·4.4 (임시), auth, onboarding |
   | FR-43 | global-api 4.5·4.7·4.8 (임시), explore, library |
   | FR-44 | global-api 2.1·4.1 (임시), auth |
   | FR-45 | global-api 4.11 (임시), settings, onboarding |
   | FR-46 | global-api 2.3·4.6 (임시), notification, subscription |
   | FR-47 | global-api 2.4 (임시), drip-scheduling, notification |
   | FR-48 | global-api 4.9·4.10 (임시), admin, backend-monitoring |

   (기존 표는 두 칸짜리 짝 구성이다 — 통합 때 그 구성에 맞춰 왼쪽 빈칸부터 채운다.)

2. **🟢 결정 포인트 표**(마지막 56번 뒤)에 행을 더한다.

   ```markdown
   | 57 | **시장 모델 — 가입 때 고른 콘텐츠 언어로 정한다**(2026-10-14) | 시장 `kr`·`global`. 가입 화면(A21)에서 고른 콘텐츠 언어(`ko`→`kr` · `en`→`global`)로 서버가 1회 정한다 — 기기 언어 자동 판정은 영어 기기 한국 사용자를 GLOBAL로 보내서 버렸다(기기 언어는 기본 선택값만). 클라이언트는 시장을 보내지 않고, 서버는 요청마다 다시 판정하지 않는다. 글로벌 가입 스위치 `GLOBAL_SIGNUP_ENABLED`(기본 닫힘)가 닫혀 있으면 GLOBAL 판정도 `kr`(2026-10-15) | PRD FR-42, global-api 2.1·4.1 |
   | 58 | **카탈로그 격리 — 시장별 별도 행**(2026-10-14) | 콘텐츠·주제·공지는 번역 테이블이 아니라 시장별 행. 사용자는 자기 시장 것만 보고(상세 직접 접근도 404) 다른 시장 주제는 저장 불가(409 `MARKET_MISMATCH`). 격리 누락은 데이터 유출. 주제 이미지 키는 `slug`(KAN-188) | PRD FR-43, global-api 4.5·4.7 |
   | 59 | **영어 화면·브랜드 Earcast**(2026-10-18) | GLOBAL 앱은 영어 화면, 영어 앱 이름·메일 브랜드는 **Earcast**(종전 임시 `Ear`, KAN-198). 가입 때 고른 언어로 표시 언어도 맞추고 그 뒤엔 설정 › 언어(2026-10-19 PM). 표시 언어는 시장을 바꾸지 않는다 | PRD FR-42·FR-46, global-api 2.3 |
   | 60 | **GLOBAL 온보딩 = 관심 주제 한 단계**(2026-10-14) | 커리어는 한국 직군 분류라 GLOBAL에서 뺀다. 단계는 서버가 `steps[]`로 준다(KR `topic,career` · GLOBAL `topic`) — 클라이언트 하드코딩 금지 | PRD FR-42, global-api 4.4, onboarding |
   | 61 | **연령 기준 — 나라별 자기 선언 16/18**(2026-10-16 PM, KAN-206) | KR 18 불변. GLOBAL은 기기 지역 SG·HK·KR 16, 그 밖·모름 18(종전 2026-10-14 "GLOBAL 일괄 16" 폐기). 서버가 `min_age`로 내려주고 이력 버전 `age-16`·`age-18`로 남긴다 | PRD FR-44·7장, global-api 2.1 |
   | 62 | **시장별 동의 버전 · 국외 이전 동의**(2026-10-16, KAN-212·KAN-215) | 약관·처리방침 버전은 시장별(KR `0.1` · GLOBAL `global-0.1`) — 다른 시장 버전은 409. GLOBAL 필수 동의에 `cross_border_transfer`(버전 없음)를 더한다, KR은 받지 않는다 | PRD FR-44, global-api 4.1, auth-api 4.14 |
   | 63 | **시장 전환 — 설정에서, 하루 1회, 되돌리기 예외**(2026-10-19 PM · 규칙 BE, KAN-227) | 설정 › 콘텐츠 언어. 미리보기 → 실행, 새 시장 필수 동의를 함께 받는다. 이전 시장 관심 주제 비활성 + 재온보딩. 서비스 날짜당 1회, 재온보딩 전 직전 시장으로 되돌리기는 세지 않는다(되돌리기의 되돌리기는 센다). 구독·한도·체험 그대로. 스위치 `MARKET_CHANGE_ENABLED`(기본 닫힘) | PRD FR-45, global-api 4.11 |
   | 64 | **서버 문구 언어 = 시장**(2026-10-14 정정) | 푸시·인증 메일·요금제 이름은 기기 언어가 아니라 `users.market`으로 고른다 — 영어 기기 KR 사용자가 한국어 콘텐츠를 영어 알림으로 받지 않게. 화면·에러 문구는 클라이언트 소유 | PRD FR-46, global-api 2.3, notification |
   | 65 | **GLOBAL 요금제·USD 가격 보류**(2026-10-14 보류 · 2026-10-16 이름만 영어) | 같은 상품을 스토어 현지가로 판다. GLOBAL 전용 행·상품 없음, `name_en`·`description_en`만. 다른 가격·혜택을 둘 때 재개(KAN-192) | PRD FR-46·4.1, global-api 4.6·9장 #4 |
   | 66 | **시간대별 드립 그룹**(2026-10-14, KAN-191) | asia·europe·americas 3그룹, 그룹 현지 05:00 편성 · 07:00 도착 알림. 서비스 날짜는 전 시장 05:00 KST 단일. 스위치 `DRIP_TIMEZONE_GROUPS_ENABLED` 꺼짐이면 전원 asia. 경계·그룹 수는 미결(global-api 9장 #3) | PRD FR-47, global-api 2.4, drip-scheduling |
   | 67 | **운영 — 업로드 시장 필수·지표 시장 분리**(2026-10-14~10-19) | 업로드 `market`·`language` 필수(2026-10-19, KAN-190 2단계 — 기본값 `kr` 채우지 않음). 어드민 `by_market`·검색 로그 시장 필터·일일 Slack 보고 시장별 가입·청취·탈퇴·시장 전환 줄. 집계는 현재 시장 기준 | PRD FR-48, global-api 4.9·4.10, admin, backend-monitoring |
   ```

### 4. 루트 `CLAUDE.md` — 파일별 인덱스 `spec/api/` 줄

`**spec/api/**` 줄 끝("… `drip-feedback-api.md`(추천 별점, 2026-09-30).")에 덧붙인다:

> 시장에 묶인 횡단 계약: `global-api.md`(국제화 — 시장·영어·국외 이전·시장 전환 계약, 2026-10-14 — 글로벌 `features/` 문서가 생기기 전까지 동작 규칙도 맡는다).

### 5. `spec/api/global-api.md` 8행(머리말)

"FR은 다음 통합 때 PRD에 추가한다." → "FR은 PRD 6.10 **FR-42 ~ FR-48**이다(2026-10-20 — `changes/pending/prd-global-track.md`)."

## 미결 — PRD에 확정처럼 쓰지 않은 것

| 항목 | 이 요청에서의 처리 | 원본 |
|---|---|---|
| 발송 그룹 경계 오프셋·그룹 수 | FR-47에 "미결"로 적음. 현행 3그룹은 결정 전 구현 기준 | `global-api.md` 9장 #3 |
| GLOBAL 상품 ID·USD 요금 | FR-46·4.1에 "보류(KAN-192)"로 적음 | `global-api.md` 9장 #4 · `tickets/backend/pending/global-plans-storefront.md` |
| 6.10의 우선순위 해석·각 FR의 P0/P1 | 위 "우선순위를 정한 방식" 표 — PM 확인 | 이 문서 |
| 글로벌 `features/` 문서 신설 여부 | 이 요청은 만들지 않는다. FR 커버리지에 "global-api (임시)"로 적음 | `global-api.md` 8행 |

## 완료 조건

- Given `prd/ear_root_prd.md` / When 6장을 읽는다 / Then 6.10이 있고 FR-42 ~ FR-48 일곱 개가 각각 `(P0)`/`(P1)`과 `global-api.md` 절을 갖는다
- Given PRD 6.10 / When FR-47을 읽는다 / Then 그룹 경계가 미결이고 `global-api.md` 9장 #3을 가리킨다
- Given PRD 4.1·7장 / Then GLOBAL 요금제 보류(KAN-192)와 연령 16/18·국외 이전 동의가 적혀 있다
- Given PRD 8.3 / Then "시장 격리 누락" 행이 있다
- Given `features/README.md` / Then FR 커버리지에 FR-41 ~ FR-48이 있고 🟢 표에 57 ~ 67이 있다
- Given 루트 `CLAUDE.md` 파일별 인덱스 / Then `spec/api/` 줄에 `global-api.md`가 있다
- Given `global-api.md` 8행 / When "다음 통합 때 PRD에 추가"를 검색한다 / Then 0건이고 FR-42 ~ FR-48을 가리킨다
- Given PM 확인 / Then 6.10의 우선순위가 PM이 정한 값이고, 처리 기록에 확인 날짜가 있다

## 처리 기록

- 2026-10-20 발행(BE — 박준현, 브랜치 `docs(be)/prd-global-track`). 각 문장은 `global-api.md`와 dev(e31a97bd) 코드로 대조했다. 우선순위는 PM 확인 대기.
- 2026-10-20 반영(통합 — `docs(be)/apply-global-change-requests`). 1~5를 요청 문구 그대로 반영했다 — PRD 6장 머리말 한 줄 + 6.10(FR-42~48, 우선순위는 요청의 제안값 FR-47 P1 · 나머지 P0) · 4.1 수익화 · 4.2 · 5.1 · 7장 개인정보·보안 두 줄 · 8.3 "시장 격리 누락" 행, `features/README.md` FR 커버리지(FR-41~48 — 두 칸 짝 구성의 왼쪽 빈칸부터 채움)·문장 · 🟢 57~67, 루트 `CLAUDE.md` `spec/api/` 줄, `global-api.md` 8행. 요청과 다른 점: PRD 6장 머리말과 README 커버리지 문장, `global-api.md` 8행에 "P0/P1은 PM 확인 대기"를 한 마디씩 덧붙였다. `global-api.md` 1-12(9장 #6·#7·#8 삭제)를 같은 통합에서 반영해 FR-46·47의 "9장 #3·#4" 번호가 맞는다. 코드 근거는 dev(29072292)에서 다시 확인했다(`age-confirmation.policy.ts` SG·HK·KR · `drip-group.policy.ts` 3그룹·07시 · `EN_BRAND` · `messageLanguageOf` 호출부 · `countNonRevertByUserIdSince`).
- 2026-10-20 **보류(pending 유지)** — 완료 조건 마지막 줄("6.10의 우선순위가 PM이 정한 값이고 처리 기록에 확인 날짜가 있다")이 아직 성립하지 않는다. 남은 결정: PM이 FR-42~48의 P0/P1을 확인(대안 — FR-45 P1로 내림 · FR-47 P0로 올림). 확인되면 다른 값만 6.10의 `(P0)`/`(P1)`에서 바꾸고, PRD 6장 머리말·README 커버리지 문장·`global-api.md` 8행의 "PM 확인 대기" 문구를 지운 뒤 확인 날짜를 여기 적고 archive로 옮긴다.
