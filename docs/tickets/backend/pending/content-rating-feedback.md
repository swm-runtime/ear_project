# [BE] 콘텐츠 후기 저장 + 후기 참여 프로모션 발급·사용

| 항목 | 값 |
|---|---|
| 대상 | 후기 API · 먼저 묻기 판정 · 후기 참여 프로모션(발급 · 보관 · 사용) · 서버 스위치 · 운영 집계 API. 규칙은 `features/content-review.md` |
| 요청 파트 | 백엔드 |
| 요청자 | 이주호(PM) · 기획 박수헌(KAN-278) |
| 담당 | 박준현 |
| Jira | [KAN-279](https://runtime364.atlassian.net/browse/KAN-279) |
| 발행 날짜 | 2026-10-26 |
| 시작 날짜 | 2026-10-26 |
| 기한 | 2026-10-30 (Low — 이번 주 금요일) — 선행이 기한 안에 안 끝나면 이 티켓 기한도 못 지킨다. 그때는 사유를 적는다 |
| 선행 | `ai/pending/content-rating-feedback-planning.md`(KAN-278 — 기획. 확정본 2026-10-28 작성, PM 검토 대기) |
| 후속 | `frontend/pending/content-rating-feedback.md`(KAN-280) · `ai/pending/content-review-console.md`(KAN-284 — 콘솔) |
| 근거 문서 | `features/content-review.md`(전체) · `features/subscription.md` 4.9(지급 경로) · `features/drip-feedback.md`(먼저 묻기·오프라인 재전송 선례) |
| 갱신 | 2026-10-28 — 기획 확정 반영. 요청·완료 조건을 전면 갱신했다(종전 "참여하면 Pro 7일 지급" → **발급해 두고 사용자가 원할 때 사용**) |
| 중요도 | Low — PM 지정(2026-10-26). 마감이 안 맞으면 등급을 내리지 말고 사유를 적는다 |
| 상태 | 대기 — 개발계 확인 완료 · 운영 켜기는 2026-12-01(처리방침 개정 시행일) |

## 요지 (Jira 본문용)

- 들어 본 편의 후기(별점 1~5 + 글 500자) 조회·저장 API — 후기 시점 완청 여부 · `content_version`을 함께 남긴다
- 라이브러리 진입 시 먼저 묻기 판정(최근 14일 완청 · 후기 없음 · 5일 간격 · 이번 주 그만 보기)
- 끝까지 들은 편 3개 + 별점 + 글 10자 → **후기 참여 프로모션(Pro 7일) 계정당 1회 발급**, 사용 기한 3개월
- 설정 › 프로모션 조회·사용 API — 사용은 초대 코드 지급 경로 재사용, Pro 구독 중 · 다른 지급 중이면 거부
- 서버 스위치 2개(후기 기능 · 발급), 관리자 집계 · 글 목록 API(작성자 계정 없음), 일일 Slack 보고 건수 줄
- 스키마는 `domain.md`에 먼저 올린다. 상세 · 완료 조건은 원본 문서

## 요청

**모든 편의 후기를 받는 API와 후기 참여 프로모션(Pro 7일)을 만든다**(10월 5주차 계획(2026-10-26 회의) · 기획 확정 2026-10-28).

### 1. 스키마 먼저 — `domain.md` (`content-review.md` 6장)

- **후기 행**: 사용자 · 편 · 별점 · 글 · 후기 시점 완청 여부 · `content_version` · 작성/수정 시각. (사용자, 편) 유니크. 사용자 삭제 시 CASCADE
- **프로모션 행**: 사용자 · 종류(`review_reward`) · 요금제(`pro`) · 일수(7) · 발급 · 소멸 · 사용 시각. (사용자, 종류) 유니크 — 계정당 1회를 DB가 보장. CASCADE
- **사용으로 생긴 지급**: `invite_code_redemptions`(8.6)를 재사용한다. 초대 코드 FK가 필수라 **① 입력을 막은 내부 캠페인 행 ② 프로모션 행을 가리키는 칸** 중 하나를 고르고 8.6에 적는다
- **`user_settings`**: 마지막으로 물은 서비스 날짜 · 그만 보기가 끝나는 서비스 날짜
- 보존: 탈퇴 즉시 파기(12.3). 아카이브 대상이 아니다

### 2. 후기 (`content-review.md` 4.1 · 4.2 · 4.3 · 4.8)

- **조회**: 쓸 수 있는지(재생을 시작한 적 있음 · 볼 수 있는 편 · 회수 아님) · 내 후기 · 발급까지의 진행(N/3 — 받은 적 있거나 스위치가 꺼져 있으면 싣지 않음)
- **저장**: 덮어쓰기. 별 1~5, 글은 앞뒤 공백을 뺀 0~500자. 완청 여부 · `content_version`은 저장 시점 값. 회수 편 거부. 응답에 이번 저장으로 발급된 프로모션
- **먼저 묻기**: 스위치 → 최근 14일 안에 끝까지 들었고 후기 없는 편 중 가장 최근 1편 → 마지막으로 물은 날 + 5 서비스 날짜 → 그만 보기(서비스 주). 닫기(`dismiss`) · 그만 보기(`mute`). 회수 편 제외. 상수 `CONTENT_REVIEW_PROMPT_INTERVAL_DAYS = 5` · `CONTENT_REVIEW_PROMPT_RECENT_DAYS = 14`
- **추천 비반영**: 드립 편성 · 선호 계산에 쓰지 않는다 — `DRIP_ALGORITHM_VERSION`을 올릴 일이 없다

### 3. 후기 참여 프로모션 (`content-review.md` 4.4 · 4.5)

- **발급**: 끝까지 들은 편 + 별점 + 글(공백 빼고 10자 이상)인 후기가 **서로 다른 편 3개** 채워지는 순간. **계정당 전체 1회**(사용 · 소멸 포함). 상수 `CONTENT_REVIEW_REWARD_REQUIRED = 3` · `CONTENT_REVIEW_REWARD_MIN_TEXT = 10`. 동시 요청에도 1장
- **소멸**: 발급 서비스 날짜의 3개월 뒤 같은 날짜 05:00 KST(그 달에 없으면 말일). 판정은 조회 · 사용 시점 — 배치 불필요. 화면에 쓸 수 있는 마지막 서비스 날짜를 내려준다
- **조회(S12)**: 이용 중 `plan.grant` · 사용 가능한 프로모션(쓸 수 있는지 · 사유 `pro_subscribed` / `grant_active` · 마지막 사용일 · 지금 쓰면 끝나는 날) · 발급까지의 진행
- **사용**: 4.5 표대로 판정 → `subscription.md` 4.9 경로로 지급. **7개 서비스 날짜**, `plan.grant.name` = "후기 참여"(GLOBAL "Review"), 응답 본문은 초대 코드 입력(`subscription-api.md` 4.8)과 같다. 쓸 때 구독이 없던 계정이 결제하면 지급 종료(기존 규칙)
- **`users.tier`를 직접 바꾸지 않는다** — 캐시는 `BillingSyncService.syncUserTier` 한 경로, 만료는 기존 지급 만료 배치

### 4. 서버 스위치 (`content-review.md` 4.9)

- `CONTENT_REVIEW_ENABLED` — **기본 꺼짐. 개인정보 처리방침 시행일 이후에 켠다**(`frontend/pending/privacy-content-review.md` — KAN-285). 꺼지면 저장 거부 · 먼저 묻기 `show=false`. **켜짐 여부를 앱에 내려준다**(위치는 계약에서 정한다)
- `CONTENT_REVIEW_REWARD_ENABLED` — 상시 켠다. 끄면 새 발급만 멈춘다

### 5. 운영 (`content-review.md` 4.7)

- **admin API**: 편별 후기 수 · 평균 · 1~5 분포 · 글 수 / 글 목록(편별 · 최신순 — 별점 · 글 · 작성 서비스 날짜 · 시장 · 완청 여부 · `content_version`) / 프로모션 발급 · 사용 · 소멸 건수. **`user_id` · 닉네임을 응답에 싣지 않는다**
- **일일 Slack 보고**: 후기 건수 · 평균 한 줄. 원문 없음
- 로그에 글 원문을 남기지 않는다(`convention.md` 8.4 — VoC와 같다)

### 6. 계약 문서

- `spec/api/`에 계약을 확정한다(골격은 `content-review.md` 2.3). FE(KAN-280)와 콘솔(AI)이 이 계약으로 붙는다

## 완료 조건

- Given 재생 기록이 있는 편 / When 후기를 저장한다 / Then 저장되고, 다시 조회하면 내 후기가 오며, 완청 여부 · `content_version`이 기록돼 있다
- Given 재생 기록이 없는 편 또는 회수된 편 / When 저장한다 / Then 거부된다
- Given 끝까지 들은 편 2개에 글 있는 후기 / When 3번째를 저장한다 / Then 응답에 프로모션 1장이 오고, 같은 요청 두 개가 동시에 와도 1장이다
- Given 별점만 있는 후기 또는 끝까지 듣지 않은 편의 후기 / Then 발급 셈에 들어가지 않는다
- Given 프로모션을 받은 적 있는 계정(사용 · 소멸 포함) / When 조건을 다시 채운다 / Then 발급되지 않는다
- Given 무료 계정이 프로모션을 쓴다 / Then Pro 7일이 지급되고 `plan.grant.name`이 "후기 참여"이며, 끝나면 만료 배치가 캐시를 되돌린다
- Given Pro 구독 중 또는 초대 코드 지급 중 / When 쓴다 / Then 거부되고 사유(`pro_subscribed` · `grant_active`)가 온다
- Given 데일리 구독자가 썼다 / When 그사이 구독이 갱신된다 / Then 지급은 유지되고 끝나면 데일리다
- Given 발급 후 3개월이 지났다 / Then 목록에서 빠지고 사용이 거부된다
- Given 마지막으로 물은 지 5 서비스 날짜 · 조건 충족 / Then 먼저 묻기 `show=true`. 4일이면 `false`, 그만 보기 주 안이면 `false`
- Given `CONTENT_REVIEW_ENABLED` 꺼짐 / Then 저장 거부 · `show=false` · 꺼짐이 앱에 내려간다
- Given admin 글 목록 / Then 응답에 `user_id`가 없다
- Given 후기를 저장했다 / Then 그 사용자의 드립 편성 · 선호 계산이 바뀌지 않는다

## 처리 기록

- 2026-10-29 BE 1단계(후기 API) PR #2141 — 후기 시트 · 저장 · 먼저 묻기 · 관리자 집계/글 목록, `CONTENT_REVIEW_ENABLED`(기본 꺼짐). FE(KAN-280)와의 E2E 전이라 pending 유지
- 2026-10-29 BE 2단계(보상) PR #2143 — 후기 참여 프로모션 발급(3편 · 10자 · 계정당 1회 · 3개월) · S12 조회/사용(초대 코드 지급 경로 재사용), `CONTENT_REVIEW_REWARD_ENABLED`(기본 꺼짐). #2141 위에 쌓음. FE(KAN-280)와의 E2E 전이라 pending 유지
- 2026-10-30 개발계 실기기 확인(박준현, FE #2171 OTA `01a1885a`) — 끝까지 들은 편 3개에 별점 + 글 10자 이상 → 3번째 저장에서 `review_reward` 발급 → [사용하기] → Pro 7 서비스 날짜 지급 · `users.tier` 반영 확인. 별점만 · 글 1자 · 완청 아닌 편(다음 편 스킵 = 위치 0~1%)은 셈에서 빠짐. 먼저 묻는 간격 5 → 2 서비스 날짜([#2176](https://github.com/swm-runtime/ear_project/pull/2176) — API로 1일 닫힘 · 2일 열림 확인). Jira 검토 중. 남은 일: 운영 `CONTENT_REVIEW_ENABLED` · `CONTENT_REVIEW_REWARD_ENABLED`(개인정보 처리방침 시행일 뒤, KAN-300).
- 2026-10-31 **운영 켜기를 2026-12-01로 미룬다**(박준현). 개발계에서는 10-30 확인 완료(발급 · 사용 · 기한 · 먼저 묻는 간격 2일). 후기는 이용자가 직접 입력하는 새 수집 항목이라 개인정보 처리방침에 먼저 올려야 하고, 그 개정(KAN-285)은 30일 고지로 **2026-12-01 시행**이다(고지 2026-10-29~30, 앱 내 공지 KAN-301). 그 전에 운영에서 켜면 공지 전 수집이 된다. 12-01 할 일은 KAN-303(12-01 가격 원복) 7번에 묶었다 — 그날 `CONTENT_REVIEW_ENABLED` · `CONTENT_REVIEW_REWARD_ENABLED`를 켜고 운영에서 작성 → 보상 → 콘솔 집계를 본 뒤 완료로 넘긴다.
