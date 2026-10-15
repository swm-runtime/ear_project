# global-api

# 글로벌(해외 전용 K-컬처) 트랙 API 명세서

> 기준 문서: 글로벌 트랙 에픽 [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) — 자식 티켓 `docs/tickets/<파트>/pending/global-*.md`(BE 8 — KAN-187~193·207 · FE · AI는 에픽 목록 참조, 2026-10-14 결정. 처음 발행한 묶음 티켓 KAN-183/184/185는 분할 후 닫음)
> 규약: [`docs/backend/convention.md`](../../backend/convention.md) 5장 · [`docs/backend/architecture.md`](../../backend/architecture.md) 7·9장
> 스키마: [`docs/backend/domain.md`](../../backend/domain.md) — 이 문서의 8장이 개정 요청의 원본이다(`changes/pending` 경유)
> 작성: 2026-10-14 (박준현). **글로벌 트랙 `features/` 문서는 아직 없다** — 이 문서가 그 자리를 임시로 맡고, 동작 규칙은 각 티켓의 "결정" 절이 기준이다. FR은 다음 통합 때 PRD에 추가한다.

## 0. 이 문서를 읽는 법

세 파트가 따로 만들다가 다시 합치며 티켓을 또 내는 일을 막기 위해 **지금 확정할 수 있는 계약은 확정하고, 못 하는 것은 가안으로 적어 둔다.** 각 항목에 상태를 붙인다.

| 표시 | 뜻 |
|---|---|
| ✅ 확정 | 2026-10-14 결정으로 닫힘. 세 파트가 이대로 구현한다 |
| 🟡 가안 | 모양은 정했으나 값·세부가 바뀔 수 있음. **바뀌면 이 문서를 먼저 고치고** 구현을 맞춘다 |
| ⚪ 미결 | 결정 대기. 9장에 목록 |

### 0.1 원칙 — 기존 계약은 유지하고, 바꾸는 것은 이유를 적는다

- **기존 엔드포인트·필드·에러 코드를 쓸 수 있으면 그대로 쓴다.** 글로벌 전용 엔드포인트(`/global/...`, `/v2/...`)를 만들지 않는다. 같은 화면이 같은 API를 부르고, 서버가 `users.market`으로 응답 내용만 가른다. 이유: 클라이언트 분기 지점이 늘어나면 KR·GLOBAL 두 코드 경로를 영원히 따로 유지해야 하고, 한쪽만 고치는 버그가 생긴다.
- **기존 필드는 빼지 않고 이름을 바꾸지 않는다.** 추가만 한다. 지금 스토어에 나가 있는 앱(3.1.x)이 새 서버에 그대로 붙어야 한다. 빼야 할 필드(예 `price_krw`)는 `null`로 내리고 다음 메이저에서 뺀다.
- **변경에는 이유가 붙는다.** 3장 표의 "이유" 열과 4장 각 절의 **왜** 줄. 이유가 "글로벌이니까"로만 설명되는 변경은 하지 않는다 — 그 변경이 없으면 무엇이 깨지는지가 적혀야 한다.
- 변경이 **필요 없는** 것도 적는다(3장 12번처럼). "확인하고 안 바꿨다"와 "아직 안 봤다"를 구분하기 위해서다.

기존 화면 계약(`auth-api.md` 등)은 그대로 유효하다. 이 문서는 **그 계약들에 덧붙는 필드·필터·규칙만** 적는다. 충돌하면 이 문서가 글로벌 트랙에 한해 우선한다.

## 1. 범위

- 시장(`market`) 모델 — 사용자가 KR/GLOBAL 중 어디에 속하는지, 누가 언제 정하는지
- 시장에 따라 갈리는 응답 — 주제·콘텐츠·요금제·공지·온보딩 단계
- 언어 — 요청 헤더, 사용자 표시 언어, 서버가 만드는 문자열(에러·푸시·메일)의 소유자
- 시간대 — 기기 시간대 수집과 드립 발송 그룹
- 파이프라인 → 서버 발행 계약 — `market`·`language`·태그 규칙

**다루지 않는 것**: 가격 체계(스토어가 주인), 사용자별 서비스 날짜(2단계), 추가 언어(영어 외), 한국 트랙의 어떤 변경도 — **KR 사용자의 응답은 이 문서로 바뀌지 않는다.**

## 2. 공통 규약

### 2.1 시장 모델 ✅

| 항목 | 값 |
|---|---|
| 시장 | `market` enum — `kr` · `global` |
| 판정 | **가입 시 1회**, 서버가 한다. 입력은 **사용자가 가입 때 고른 콘텐츠 언어** `locale.preferred_language`(`ko` → `kr`, `en` → `global`). 앱은 모든 신규 가입자에게 한 화면으로 한 번 묻고, 기기 언어는 그 화면의 **기본 선택값**으로만 쓴다. 값이 없으면(구 앱) 기기 `language_code`가 `ko`로 시작하면 `kr`, 그 밖은 `global`, 그것도 없으면 `kr`. **(2026-10-14 결정 — 기기 언어 자동 판정은 영어 설정 한국 사용자를 GLOBAL로 보내고 되돌릴 길이 없어서. 모호한 사용자만 묻는 방식 등은 추후 필요하면 다시 논의)** |
| 저장 | `users.market`. **요청마다 헤더로 판정하지 않는다** — 헤더는 로그·통계용 |
| 전환 | ⚪ 기본은 **불허**(가입 시 확정. 표시 언어를 바꿔도 시장은 그대로) |
| 결제 | 시장과 무관하게 **스토어 국가**를 따른다(`storefront`). 가격 표시는 스토어 현지가만 |
| 연령 | ✅ GLOBAL **16세 이상 자기 선언**(2026-10-14 확정 — 법정대리인 동의 없이 본인 동의가 가능한 최저 연령이 GDPR 기본 16·영국 13·미국 COPPA 13·한국 14이므로 16이면 어느 공개 국가에서도 부모 동의 흐름이 필요 없다), KR 현행 18세 불변. 스토어 등급은 Apple 16+ · Play 16–17/18+로 맞춘다 |

### 2.2 요청 헤더 🟡

| 헤더 | 값 | 비고 |
|---|---|---|
| `Accept-Language` | BCP 47, 예 `en-US` · `ko-KR` | 모든 요청. 서버는 **로그·통계에만** 쓴다. 판정은 `users.market` |
| `X-Timezone` | IANA, 예 `America/New_York` | 모든 요청. 기기 등록(4.2)이 저장의 원천이고 헤더는 보조 |

**왜 헤더까지 받나**: 판정은 저장값으로 하지만, 요청 로그에 언어·시간대가 있어야 "어느 시장 트래픽이 느린가 · 어느 시간대에 몰리나"를 CloudWatch Insights로 바로 셀 수 있다. DB 조인 없이 로그만으로 보기 위한 것이고, 없어도 동작은 같다(그래서 🟡).

### 2.3 언어 — 문자열의 소유자 ✅

| 문자열 | 소유자 | 규칙 |
|---|---|---|
| 화면 문구 | **클라이언트** | i18n 리소스(ko/en). 서버는 화면 문구를 내려주지 않는다 |
| 에러 `message` | **클라이언트가 `error_code`로 번역** | 서버 `message`는 한국어 **폴백**이고 GLOBAL 사용자에게 보이면 안 된다 → 클라이언트는 `common-error-handling.md` 9장의 **모든 `error_code`에 en 문자열**을 갖고, 누락을 테스트로 막는다. 계약 문서(`common-error-handling.md` 4장)에 이 규칙을 추가한다(changes/pending) |
| 푸시 제목·본문 | **서버** | **`users.market`으로 템플릿 선택**(KR → ko · GLOBAL → en, 2026-10-14 정정). 1단계는 시장마다 콘텐츠 언어가 하나라 문구도 그 언어를 따른다 — 기기 언어(`language_code`)로 고르면 영어 기기를 쓰는 KR 사용자가 한국어 콘텐츠를 영어 알림으로 받는다. 시장 안에 언어가 둘 이상이 되면(2단계) `language_code`로 넓힌다. 본문(대표 콘텐츠 제목)은 콘텐츠 그대로. 클라이언트는 개입하지 않는다 |
| 인증 메일 | **서버** | 같은 규칙(`users.market`). 영어 앱 이름은 PM 확정 전 임시값 `Ear`(KAN-198) |
| DB 저장 문자열 — 주제 이름·요금제 이름·콘텐츠 제목·공지 | **서버(시장별 행)** | 번역 테이블이 아니라 **시장별로 별도 행**이다. GLOBAL 주제·요금제·공지는 처음부터 영어로 만든다. 한국어 행을 번역하지 않는다 |

### 2.4 시간대 🟡

- 서버는 `users.timezone`(IANA)을 저장하고 **드립 배치·푸시 발송 그룹**에만 쓴다. 1단계에서 서비스 날짜 경계는 전 시장 **05:00 KST 단일**이다(재생 한도·체험 종료·주간 창 포함).
- 발송 그룹은 서버 설정이다(`drip-group.policy.ts` — 현재 오프셋 기준 `asia` = UTC+5 이상 · `europe` = UTC−1 이상 · `americas` = 그 아래. 빈틈 없이 나눈다). 그룹마다 기준 시간대(asia `Asia/Seoul` · europe `Europe/London` · americas `America/Chicago`, 서머타임은 이를 따른다)의 "현지 05:00"에 그 그룹의 사용자만 배치한다. GLOBAL 시장만 가르고 KR·시간대 없음은 `asia`다. 서버 스위치 `DRIP_TIMEZONE_GROUPS_ENABLED`가 꺼져 있으면 전원 `asia`(2026-10-14 구현 — KAN-191). 경계 확정은 9장 미결.
- **도착 알림은 편성과 떼어 "현지 07:00"에 보낸다**(2026-10-14 확정 — KR은 07:00 KST, PR #1532). 새벽 5시 알림은 잠금화면에 묻혀 청취로 이어지지 않는다. 그룹 알림은 그 그룹 배치가 적립한 것만 다시 읽어 사용자당 1건(정규 + 탐험)이고, 배치가 현지 07:00까지 안 끝났으면 끝나는 즉시 보낸다. 하루 1건 판정은 서비스 날짜(05:00 KST) 기준 그대로다 — 그룹 시각이 KST 서비스 날짜를 넘지 않게 경계를 정한다(9장 미결 #3).
- 응답의 시각은 종전대로 **ISO 8601 UTC**다. 날짜 라벨(`service_date` 등)은 서버 서비스 날짜(KST 기준) 그대로 — 클라이언트는 기기 시각으로 재계산하지 않는다.

## 3. 변경되는 엔드포인트 목록

| # | 메서드·경로 | 원 문서 | 변경 | 이유(없으면 무엇이 깨지나) | 상태 |
|---|---|---|---|---|---|
| 1 | `POST /auth/social-login` · `POST /auth/sign-up` | auth-api 4.1·4.2 | 요청 `locale` 객체 추가(사용자가 고른 `preferred_language` 포함), 응답 `user.market`·`user.language_code` | 시장을 정할 입력이 가입 요청에 없다. 기기 언어로 자동 판정하면 영어 설정 한국 사용자가 GLOBAL로 가고 되돌릴 수 없다 → 가입 때 사용자에게 1회 묻고 그 값을 본문으로 받아 저장한다. 헤더로만 받으면 "요청마다 판정"이 되어 언어를 바꾸면 피드가 통째로 바뀐다 | ✅ |
| 2 | `GET /users/me` | auth-api 4.13 | `user.market`·`user.language_code`·`user.timezone` | 클라이언트가 제공자 목록·온보딩 단계·결제 상품을 가르는 기준이 필요하다. 언어로 추측하면 영어 설정 한국 사용자가 GLOBAL로 보인다 → 서버 판정값을 그대로 노출 | ✅ |
| 3 | `PUT /users/me/devices/:device_id` | onboarding-api 4.9 | 요청 `language_code`·`timezone` | 기존 가입자의 `language_code`·`timezone`은 비어 있다. 매 실행 호출되는 이 API에 실어야 재가입 없이 채워진다 | ✅ |
| 4 | `GET /users/me/settings` · `PATCH` | settings-api 4.1·4.2 | 응답 `market`(읽기 전용)·`language_code`·`timezone`, PATCH로 `language_code` 변경 | 표시 언어를 사용자가 바꿀 길이 없다(기기 언어 = 가입 시 1회). 서버 문구(푸시·메일) 언어는 이 값이 아니라 `users.market`으로 고른다(2.3) | 🟡 |
| 5 | `GET /onboarding/state` | onboarding-api 4.1 | `steps[]` 추가 — GLOBAL은 `career` 없음 | 커리어 단계는 한국 직군 분류다. GLOBAL에 보이면 선택할 값이 없다. 클라이언트가 `market`으로 단계를 하드코딩하면 단계가 바뀔 때마다 앱 빌드가 필요해 서버가 배열로 준다 | 🟡 |
| 6 | `GET /onboarding/topics` · `GET /users/me/interests` · `PUT …` | onboarding-api 4.2·4.3, interest-management-api | 사용자 시장의 주제만, `items[].slug` 추가, 다른 시장 주제 저장은 409 | 주제는 시장별 별도 행이라 거르지 않으면 한국어 주제가 영어 피드에 섞인다. `slug`는 클라이언트 주제 이미지 키가 한국어 이름이어서 영어 주제에 이미지가 안 붙는 문제 | ✅ |
| 7 | `GET /plans` | subscription-api 4.1 | 사용자 시장의 요금제만, GLOBAL은 `price_krw: null` | GLOBAL 요금제는 별도 스토어 상품(ID 다름). KR 행이 보이면 결제가 KR 상품으로 간다. `price_krw`는 해외 사용자에게 원화를 보여 주는 셈이라 `null` | ✅ |
| 8 | 탐색·라이브러리·상세·플레이어·검색·재개 — 콘텐츠를 담는 모든 응답 | explore·library·content-detail·player-api | `language` 필드 추가, 서버가 시장 필터 | 시장 필터가 없으면 한국어 콘텐츠가 해외 피드·검색·드립에 나온다(유출). `language`는 자막 폰트·낭독 언어 등 표시용 | ✅ |
| 9 | `GET /notices` · `GET /notices/:id` | settings-api 4.4·4.5 | 시장 필터(필드 변화 없음) | 공지도 시장별로 따로 쓴다. 필터만 추가, 필드는 그대로 쓸 수 있어 바꾸지 않는다 | ✅ |
| 10 | `POST /admin/contents` · `POST /admin/contents/:id/republish` | admin-api 4.6·4.10 | payload `market`·`language` 필수, `enrichment.json` `language`·태그 규칙·`target_audiences` 생략 | 파이프라인이 두 트랙을 만들기 시작하면 서버가 어느 시장 콘텐츠인지 알 길이 payload밖에 없다. 태그 규칙은 현행이 공백 금지여서 "Stray Kids"가 400 — 영어 고유명사 대부분이 막힌다. `target_audiences`는 KR 직군 enum | ✅ |
| 11 | `GET /admin/contents` · `POST /admin/topics` · `GET /admin/insights/summary` | admin-api | `market` 필터·필드 | 운영 집계가 시장 섞여 나오면 PoC 성과(GLOBAL 가입·청취)를 읽을 수 없다 | 🟡 |
| 12 | `POST /users/me/subscription/invite-codes` 및 구독 조회 | subscription-api 4.8 | 변경 없음(코드는 시장 무관). `plan.grant` 그대로 | 초대 코드는 시장과 무관한 부여 기능. 확인 결과 바꿀 것이 없다 | ✅ |

## 4. 엔드포인트 상세

### 4.1 `POST /auth/social-login` · `POST /auth/sign-up` — `locale` ✅

**왜**: 시장 판정의 입력이 필요하다. 기기 언어로 자동 판정하면 **영어 설정을 쓰는 한국 사용자**가 GLOBAL로 가고(시장 전환 불허라 되돌릴 수 없다), 지역·시간대로 보정해도 한국 거주 외국인·해외 거주 한국인 어느 한쪽은 틀린다. 그래서 **가입 때 사용자에게 콘텐츠 언어를 한 번 묻고** 그 값을 본문으로 받아 1회 저장한다. 헤더(`Accept-Language`)만 쓰면 요청마다 판정이 되어 언어를 바꾸는 순간 주제·피드·요금제가 통째로 바뀐다. 기존 필드는 그대로이고 `locale`은 선택이라 구 앱도 그대로 가입된다(→ 기기 언어 규칙, 없으면 `kr`).

**Request**(기존 필드에 추가)

```json
{
  "provider": "google",
  "provider_token": "...",
  "device_id": "...",
  "locale": { "preferred_language": "en", "language_code": "en-US", "region_code": "US", "timezone": "America/New_York" }
}
```

| 필드 | 타입 | 필수 | 비고 |
|---|---|---|---|
| `locale.preferred_language` | `ko` · `en` | 선택(신규 앱은 항상 보낸다) | **사용자가 가입 화면에서 고른 콘텐츠 언어 — 시장 판정의 입력**(`ko` → `kr`, `en` → `global`). 앱은 모든 신규 가입자에게 한 번 묻고 기기 언어를 기본 선택값으로 둔다. 없으면 `language_code` 규칙으로 폴백 |
| `locale.language_code` | BCP 47 | 선택 | 기기 언어(`expo-localization` `getLocales()[0].languageTag`). 표시 언어의 초깃값(서버 문구 언어는 `users.market` — 2.3). `preferred_language`가 없을 때만 판정 폴백(`ko*` → `kr`, 그 밖 `global`, 없으면 `kr`) |
| `locale.region_code` | ISO 3166-1 alpha-2 | 선택 | 통계용 |
| `locale.timezone` | IANA | 선택 | 드립 발송 그룹. 없으면 `Asia/Seoul` |

- 시장은 **계정 생성(sign-up) 시점에만** 정한다. 기존 계정의 로그인에 다른 `locale`이 와도 `market`은 바뀌지 않고 `language_code`·`region_code`·`timezone`만 갱신한다(`preferred_language`는 무시).
- 가입 화면의 질문은 시장 하나당 선택지 하나다(한국어 / English). 시장이 늘면 선택지가 는다. 화면에는 "선택한 언어에 따라 보여 주는 콘텐츠가 달라진다"는 설명과 해외 거주자에게 English를 권하는 안내, 가입 뒤 변경 불가 안내를 함께 둔다(카피는 FE `spec/uiux`). 앱 실행 직후의 **표시 언어**는 서버 호출 전이라 클라이언트가 기기 `locale`로 1차 판단한다 — 시장 판정과 별개다. 질문을 모호한 사용자에게만 보이는 방식 등은 **추후 필요하면 다시 논의**한다(2026-10-14).
- GLOBAL 시장에서 `provider`가 `kakao`·`naver`인 요청은 거부하지 않는다(서버는 제공자별 독립). **노출을 막는 것은 클라이언트 몫**(4.2 응답의 `market`으로 분기).
- 연령 동의(`age_confirmation`)의 기준 연령은 시장별이다(2.1 — GLOBAL 16 · KR 18). `pending_consents[].version`에 시장 네임스페이스가 들어간다 — 예 `terms_global_v1` 🟡.

**Response**(`user` 객체, `GET /users/me`도 동일)

```json
{ "user": { "id": "uuid", "market": "global", "language_code": "en-US", "timezone": "America/New_York", "provider": "google", "tier": "light", "...": "기존 필드 그대로" } }
```

### 4.2 `PUT /users/me/devices/:device_id` — 로케일 갱신 ✅

**왜**: 기존 가입자와 구 앱은 `locale`을 보낸 적이 없다. 재가입 없이 채우려면 **이미 매 실행마다 호출되는** 이 API에 싣는 것이 가장 싸다. 새 엔드포인트를 만들지 않는다.

기존 요청에 `language_code`·`timezone`(둘 다 선택)을 더한다. 앱 실행·포그라운드 복귀마다 보내는 이 호출이 **`users.language_code`·`users.timezone`의 갱신 경로**다. 기존 가입자도 다음 실행에서 채워진다. `market`은 건드리지 않는다.

### 4.3 `GET /users/me/settings` · `PATCH /users/me/settings` 🟡

**왜**: 기기 언어는 가입 시 1회만 보므로 사용자가 표시 언어를 바꿀 길이 설정밖에 없다. 서버가 만드는 문자열(푸시·메일)의 언어는 이 값이 아니라 `users.market`으로 고른다(2.3). 기존 설정 API에 필드만 더한다.

- 응답에 `market`(읽기 전용) · `language_code` · `timezone` 추가.
- `PATCH { "language_code": "en-US", "client_seq": n }` — **표시 언어 변경**. 시장은 바뀌지 않는다(⚪ 전환 불허 기본). 서버 문구(푸시·메일) 언어는 이 값이 아니라 `users.market`으로 고른다(2.3, 2026-10-14 정정).

### 4.4 `GET /onboarding/state` — 단계 목록 🟡

**왜**: 커리어는 한국 직군 분류여서 GLOBAL에는 고를 값이 없다. 클라이언트가 `market === 'global'`로 단계를 빼는 방식도 가능하지만, 그러면 단계 구성이 바뀔 때마다 **스토어 빌드**가 필요하다(이번 PoC가 그 비용을 이미 치르고 있다). 서버가 배열로 주면 서버 배포로 끝난다.

```json
{ "onboarding_completed": false, "onboarding_step": "topic", "steps": ["topic"], "selected_topic_ids": [], "career": null, "picked_count": 0 }
```

- `steps[]`: 이 사용자가 밟을 화면 단계. KR `["topic","career"]`, GLOBAL `["topic"]`(커리어 생략 — 해외 사용자에게 한국 직군 분류가 무의미. 담기 단계는 2026-10-11에 없어졌다). GLOBAL은 주제 저장 시 `onboarding_step`이 곧바로 `pick`(완료 대기)으로 간다. 클라이언트는 **이 배열대로** 화면을 잇고 단계를 하드코딩하지 않는다.
- GLOBAL 계정에 `PATCH /onboarding/career`가 오면 409 `MARKET_MISMATCH`(5장).

### 4.5 주제 — `GET /onboarding/topics` · `GET /users/me/interests` · `PUT /users/me/interests` ✅

**왜**: 주제는 번역 테이블이 아니라 시장별 **별도 행**이다(2.3). 거르지 않으면 한국어 주제가 영어 피드에 섞이고, 사용자가 다른 시장 주제를 저장하면 그 주제의 콘텐츠(한국어)가 추천에 들어온다. `slug`는 클라이언트의 주제 이미지 매핑 키가 **한국어 이름**이어서 영어 주제에 이미지가 하나도 안 붙는 문제를 푼다 — 이름이 아닌 안정 키로 바꾸는 것은 KR에도 이득이다.

```json
{ "items": [ { "topic_id": "uuid-k1", "slug": "k-pop", "name": "K-Pop", "parent_category": "Entertainment" } ], "max_selectable": 3, "is_fallback": false }
```

- `items`는 **사용자 시장의 주제만**(`topics.market = users.market`). GLOBAL 주제 이름·대분류는 영어로 저장된 값 그대로.
- `slug` 추가(모든 시장). 클라이언트의 주제 이미지·아이콘 매핑은 **`slug` 키**로 한다(한국어 이름 키 폐기). KR 주제에도 slug를 채운다(예 `career`, `productivity`) — 채우기 전의 KR 주제는 `slug: null`이고 클라이언트는 기본 이미지를 쓴다(관리자 `POST`·`PATCH /admin/topics`로 입력 — admin-api 4.2·4.3).
- `PUT /users/me/interests`·`PUT /onboarding/interests`에 다른 시장의 `topic_id`가 섞이면 409 `MARKET_MISMATCH`, 아무것도 저장하지 않는다.
- 자동 확장(`source = auto_expand`)도 같은 시장 안에서만 일어난다.

### 4.6 `GET /plans` ⏸ 보류(2026-10-14)

> **보류** — 기존 구독 상품에 전 세계 현지 가격이 이미 설정돼 있어 해외 사용자도 같은 상품을 쓴다. 아래 시장별 요금제 행·`price_krw: null`은 해외에 다른 가격·혜택을 둘 때 재개한다(KAN-192). 지금 `GET /plans`는 시장과 무관하게 종전 응답이고, 앱은 가격을 스토어 현지가로만 그린다.

**왜**: GLOBAL 요금제는 스토어 상품 ID가 다르다(현지가 책정·세금 처리가 상품 단위). KR 행이 응답에 섞이면 결제가 KR 상품으로 간다. `price_krw`는 해외 사용자에게 원화를 보이는 값이어서 `null`로 내리되 **필드는 유지**한다 — 지금 스토어의 3.1.x 앱이 이 필드를 읽는다.

- `plans[]`는 **사용자 시장의 요금제 행만**(`plans.market`). GLOBAL 요금제는 별도 행·별도 `store_product_id_*`(예 `com.runtime.ear.global.pro.monthly` 🟡).
- `price_krw`: KR은 종전대로 참고값, **GLOBAL은 `null`**. 클라이언트는 어느 시장이든 스토어 SDK의 현지가(`displayPrice`)만 그린다. 다음 메이저에서 필드 자체를 뺀다.
- `name`·`description`은 시장별 행의 값(GLOBAL은 영어).
- `action` 판정은 종전과 같다(`subscription-api.md` 4.1). 구독 행은 시장을 가지지 않는다 — 결제는 스토어 국가 기준이고, GLOBAL 사용자가 KR 상품 ID로 결제하는 경로는 앱에 없다.

### 4.7 콘텐츠를 담는 모든 응답 — `language` ✅

**왜**: 가시성 조건에 시장이 없으면 한국어 콘텐츠가 해외 피드·검색·드립·재개 목록에 그대로 나온다. 이것은 "안 어울리는 콘텐츠"가 아니라 **격리 실패**다. `language`는 클라이언트 표시용(폰트·낭독·자막)으로만 더한다 — 거르는 책임을 클라이언트에 주지 않기 위해 명시한다.

탐색 피드·검색·콘텐츠 상세·라이브러리 목록·재개 대상·플레이어 메타·온보딩 추천(`/onboarding/recommendations`)의 콘텐츠 객체에 `language`(BCP 47 primary, `ko` · `en`)를 더한다.

```json
{ "content_id": "uuid", "title": "Why BLACKPINK's Comeback Broke Streaming Records", "language": "en", "speaker": "…", "...": "기존 필드 그대로" }
```

- **시장 필터는 서버가 한다.** 사용자 시장이 아닌 콘텐츠는 어떤 응답에도 나오지 않는다(상세 URL로 직접 접근해도 404). 클라이언트는 `language`로 거르지 않는다 — 표시 전용(예: 자막 폰트·낭독 언어).
- 드립 편성·탐험·인기·검색 후보도 같은 필터를 탄다. 이 격리는 서버 e2e(KAN-188 — `test/global-catalog-isolation.e2e-spec.ts`)가 보장한다.

### 4.8 공지 ✅

**왜**: 공지는 시장별로 따로 쓴다. 필드는 그대로 쓸 수 있어 바꾸지 않고 필터만 더한다.

`GET /notices`·`GET /notices/:id`는 `notices.market`으로 거른다. 필드 변화 없음. 공지는 시장별로 따로 쓴다.

### 4.9 파이프라인 → 서버 발행 — `POST /admin/contents` · `republish` ✅

**왜**: 두 트랙을 만들기 시작하면 서버가 콘텐츠의 시장을 알 길은 payload밖에 없다(주제로 추론하면 주제 없는 콘텐츠·다중 주제에서 깨진다). 태그 규칙은 현행이 **공백 금지**여서 "Stray Kids"·"Squid Game"이 400으로 막히고, 영어 고유명사 대부분이 그렇다. `target_audiences`는 KR 직군 enum이라 GLOBAL에는 채울 값이 없다. 나머지(`title`·`sources`·`script_file`·`enrichment_file`)는 **그대로 쓴다**.

`payload`(JSON 문자열)에 두 필드를 더한다. **1단계는 선택**(없으면 `kr`·`ko` — 구 콘솔·KR 파이프라인 무중단), **파이프라인이 보내기 시작한 뒤(AI KAN-204) 필수로 올린다**(KAN-190 2단계).

```json
{ "title": "...", "description": "...", "origin": "ai_generated", "market": "global", "language": "en", "topic_ids": ["uuid-k1"], "sources": [ ... ] }
```

| 필드 | 값 | 규칙 |
|---|---|---|
| `market` | `kr` · `global` | `topic_ids`의 주제가 전부 같은 시장이어야 한다. 아니면 400 `VALIDATION_FAILED`(`details.field = "topic_ids"`) |
| `language` | `ko` · `en` | `market = kr`는 `ko`만, `global`은 `en`(1단계). 아니면 400 |

- 기존 콘텐츠·기존 업로드는 `market = kr`, `language = ko`로 간주한다(마이그레이션 기본값). **파이프라인은 한국어 트랙에도 두 필드를 명시해 보낸다**(콘솔의 `SEND_*` 플래그 패턴 — 서버 배포 전에는 400이 나므로 서버 반영 뒤 켠다).
- `enrichment.json`(`ai/metadata-pipeline.md` 4.4)에 `language` 키 추가(선택, 없으면 payload 값). `tags` 규칙 완화: **공백 허용, 2~20자, 한글·영문·숫자·공백, 앞뒤 공백 없음**(`^[가-힣A-Za-z0-9][가-힣A-Za-z0-9 ]{0,18}[가-힣A-Za-z0-9]$` — `content.constant.ts` `CONTENT_TAG_PATTERN`) — "Stray Kids"·"BLACKPINK"가 통과한다. `target_audiences`는 **`market = global`이면 생략 허용**(있으면 무시하지 않고 400 — 직군 enum이 KR 전용).
- `upload-meta.json`(파이프라인 패키지)에 같은 `market`·`language`를 기록해 콘솔이 payload로 옮긴다.
- 주제 생성 `POST /admin/topics`에 `market`(1단계 선택 — 없으면 `kr`)·`slug` 🟡. `slug`는 생성·수정(`PATCH /admin/topics/:id`)에서 선택 입력으로 받는다(2026-10-14 — 소문자·숫자·하이픈, 같은 시장에 같은 slug면 409 `CONFLICT`, 수정에서 `null`이면 비운다). 목록·응답 항목에 `slug`가 실린다. 두 필드의 필수 전환은 발행 계약 필수 전환(KAN-190 2단계)과 같은 때 한다. GLOBAL 주제 8개는 마이그레이션으로 시드됐다(1790100000000).

### 4.10 어드민 조회 🟡

**왜**: PoC 성과를 읽어야 한다. 시장이 섞인 가입·청취 수는 어느 트랙이 움직였는지 말해 주지 않는다.

`GET /admin/contents?market=` 필터, `GET /admin/insights/summary`에 `by_market` 블록(가입·활성·청취·결제의 시장별 집계 — 2026-10-14 구현):

```json
"by_market": [ { "market": "kr", "users": 225, "signups_in_window": 30, "onboarding_completed": 208, "active_7d": 190, "listeners_7d": 130, "listen_sec": 70844, "plays": 233, "paid_active": 0 }, { "market": "global", "users": 0, "...": 0 } ]
```

- 시장마다 한 칸(계정이 없는 시장도 0으로). 각 값은 `users`·`listening.window`의 같은 이름 지표를 시장으로 나눈 것이다. **현재 계정 기준** — 탈퇴 기록에는 시장이 없어 탈퇴 수는 시장별로 나누지 않는다.
- `GET /admin/search-query-logs/summary?market=` — 검색 질의 로그 요약을 **검색한 사용자의 시장**(`users.market`)으로 거른다(2026-10-15 — KAN-188, `admin-api.md` 4.21). 생략하면 전 시장, `kr`·`global` 밖의 값은 400 `VALIDATION_FAILED`. 한국어·영어 질의가 한 순위·미스율에 섞이지 않게 하려는 것이고, 한국어 매칭 방식(`pg_trgm`)을 판단할 때는 `market=kr`로 본다.

## 5. 에러 코드 표

| error_code | HTTP | retryable | 발생 지점 | 상태 |
|---|---|---|---|---|
| `MARKET_MISMATCH` | 409 | false | 4.4 GLOBAL의 커리어 저장 · 4.5 다른 시장 주제 저장 · 4.9 `topic_ids` 시장 불일치(이건 400 `VALIDATION_FAILED`) | 🟡 신설 — `common-error-handling.md` 9장 등재는 BE 구현 PR에서 |
| `VALIDATION_FAILED` | 400 | false | `locale` 형식·`language`/`market` 값·태그 규칙 | 기존 |

클라이언트 문구(ko/en)는 클라이언트가 갖는다(2.3). `MARKET_MISMATCH`는 정상 UI에서 나올 수 없는 상태라 "다시 시도해 주세요" 류 공통 문구로 충분하다.

## 6. 흐름

```
[가입 — 영어 기기]
앱: getLocales()[0] → 가입 화면 "어떤 언어로 들을까요?" 기본 선택 English → 사용자가 고름
   → POST /auth/sign-up {provider: google, locale{preferred_language: en, en-US, US, America/New_York}}
서버: preferred_language 'en' → market = global 확정 · 저장 (영어 기기라도 '한국어'를 고르면 kr)
   → user{market: global, language_code: en-US}
앱: market === 'global' → 제공자 목록 Google/Apple · 온보딩 steps=[topic]
   → GET /onboarding/topics → GLOBAL 주제(영어, slug)
   → PUT /onboarding/interests → GET /onboarding/recommendations(GLOBAL 콘텐츠만)
   → PUT /users/me/devices/:id {push_token, language_code, timezone}

[드립]
서버: 발송 그룹(americas) 현지 05:00 = UTC 10:00 → 그 그룹 사용자만 배치
서버: 같은 그룹 현지 07:00 = UTC 12:00 → 그 그룹 적립분만 다시 읽어 영어 푸시(users.market)

[결제]
앱: GET /plans → GLOBAL 요금제(price_krw null) → StoreKit/Billing 현지가 표시 → 영수증 제출(종전 계약)
서버: storefront·currency·price 저장(subscription-api 4.4 개정)

[발행 — 파이프라인]
upload-meta{market: global, language: en} → 콘솔 payload → POST /admin/contents → contents.market=global → GLOBAL 사용자에게만
```

## 7. 보안·검증 규칙

- `market`은 클라이언트가 보내지 않는다(서버 판정값). 요청에 들어와도 무시한다. 클라이언트가 보내는 것은 사용자가 고른 `preferred_language`이고, 그것을 시장으로 바꾸는 규칙은 서버에 있다.
- `locale.*`·헤더 값은 저장 전 형식 검증(BCP 47·ISO 3166·IANA 목록). 모르는 값은 버리고 기본값.
- 시장 격리 누락은 **데이터 유출**로 본다(한국어 콘텐츠가 해외 피드에, 또는 그 반대). 콘텐츠를 반환하는 모든 레포지토리 메서드가 같은 가시성 조건(`CONTENT_VISIBILITY_CONDITION` + market)을 쓰고, e2e가 교차 접근 0건을 검사한다.
- 로그에 `Accept-Language`·`timezone`은 남겨도 되지만 `region_code`와 IP를 묶어 저장하지 않는다(위치 추정 금지 — 개인정보 원칙).

## 8. 데이터 모델 — `domain.md` 개정 요청(changes/pending 원본)

| 테이블 | 추가 | 비고 |
|---|---|---|
| `users` | `market` enum(kr/global, NOT NULL, DEFAULT kr) · `language_code` varchar(16) NULL · `region_code` varchar(2) NULL · `timezone` varchar(64) NULL | 판정은 가입 시 1회. **`archived_users`에는 넣지 않는다** — 거래 주체 식별과 무관해 보존 근거가 없다(domain.md 11.3, 2026-10-14 구현 시 정정) |
| `contents` | `market` enum NOT NULL DEFAULT kr · `language` varchar(8) NOT NULL DEFAULT ko | 인덱스 `(market, status, published_at)` |
| `topics` | `market` enum NOT NULL DEFAULT kr · `slug` varchar(64) UNIQUE(market, slug) | 이미지 키 |
| `plans` | `market` enum NOT NULL DEFAULT kr | GLOBAL 행 2개(Daily/Pro) 신규, `price_krw` NULL 허용 |
| `notices` | `market` enum NOT NULL DEFAULT kr | |
| `subscriptions` · `store_notification_logs` | `storefront` char(3) NULL · `currency` char(3) NULL · `price` numeric NULL | 스토어 응답값 그대로 |
| `drip_batch_runs` | `group` varchar(16) NOT NULL DEFAULT asia, 유니크 `(run_date, group)` | 발송 그룹 |

## 9. 미결 사항

| # | 항목 | 기본값(결정 전 구현 기준) | 결정자 |
|---|---|---|---|
| 1 | 같은 계정의 시장 전환 | 불허 | 박준현 |
| 3 | 발송 그룹 정의(경계 오프셋·그룹 수) | asia/europe/americas 3그룹 | BE |
| 4 | GLOBAL 상품 ID·요금(USD) | `com.runtime.ear.global.{daily,pro}.monthly` | 박준현(스토어) |
| 5 | 약관 네임스페이스(`terms_global_v1`)와 재동의 흐름 | 가입 시 1회, 재동의 없음 | BE·법무 |
| 6 | GLOBAL 주제 트리(대·중분류, slug) | KAN-184 제안 | 박수헌 → PM |
| 7 | 어드민 시장별 집계 모양(4.10) | BE 구현 시 확정 | BE |
| 8 | `MARKET_MISMATCH` 코드명·`common-error-handling.md` 등재 | 이 이름 | BE |

결정이 나면 이 표를 지우고 해당 절의 🟡/⚪를 ✅로 바꾼다. 세 파트는 **이 문서의 변경 이력(git)** 을 보고 계약 변화를 따라간다 — 티켓을 다시 내지 않는다.
