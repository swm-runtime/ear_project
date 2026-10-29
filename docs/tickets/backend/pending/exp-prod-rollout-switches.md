# [OPS] 단기 실험 운영 반영 체크리스트 — 스위치·env·스토어·순서

| 항목 | 값 |
|---|---|
| 대상 | 운영 Secrets `ear/prod/api` · `/opt/ear/backend/.env.prod` · 스토어 콘솔 · main 배포 순서 |
| 요청 파트 | 백엔드(운영) |
| 요청자 | 박준현(테크리드) |
| 담당 | 박준현 |
| Jira | [KAN-300](https://runtime364.atlassian.net/browse/KAN-300) |
| 발행 날짜 | 2026-10-29 |
| 시작 날짜 | 2026-10-29 |
| 기한 | 2026-10-30 (Low — 이번 주) — 실제 반영은 실험별 시점에 맞춘다. 이 문서는 그때까지 갱신한다 |
| 선행 | 없음 |
| 중요도 | Low |
| 상태 | 발행 |

> 단기 실험 기능이 dev에 쌓였다. **main 배포만으로는 대부분 꺼진 채 나간다.** 운영 반영 때 빠뜨리지 않게 스위치·env·사람 손 작업을 여기 한 곳에 모은다. 새 스위치가 생기면 이 표에 한 줄 추가한다.

## main 배포 때 자동으로 적용되는 것 (주의)

- 마이그레이션 `LowerPaidPlanPrices` — 운영 `plans.price_krw`가 daily 1,900 · pro 3,900으로 바뀐다(KAN-286). 앱은 스토어 가격을 보여 주므로 화면 가격은 스토어 변경 때 바뀐다.
- 마이그레이션 `AddContentReviews` · `AddPromotions`(KAN-279) · `AddContentLengthProfile`(KAN-298) — 테이블·컬럼만. 스위치가 꺼져 있어 동작 변화 없음.
- `GET /onboarding/first-drip`의 `first_content_id`(KAN-292) · `GET /admin/insights/series-episodes`(KAN-293) — 스위치 없이 바로 동작.

## 스위치·env

| 키 | 켤 값 | 실험 | 켜는 시점 · 조건 | 개발계(2026-10-29) |
|---|---|---|---|---|
| `PLAN_DISCOUNT_DISPLAY_ENABLED` | `true` | ① 할인 표시 KAN-286 | 스토어 가격 변경 + FE KAN-299 배포와 같은 때 | 꺼짐 |
| `PLAN_DISCOUNT_ORIGINAL_PRICE_DAILY_KRW` | `3900` | ① | 위와 함께 | 비어 있음 |
| `PLAN_DISCOUNT_ORIGINAL_PRICE_PRO_KRW` | `9900` | ① | 위와 함께 | 비어 있음 |
| `FIRST_DRIP_RANDOM_ENABLED` | `true` | ⑥ 첫 드립 랜덤 KAN-291 | 가능하면 코호트 분리일과 **다른 날** | `true` (Secrets) |
| `SIGNUP_TRIAL_DAYS` | `3` | ⑦ 체험 3일 KAN-287 | 바꾼 시각 기록(가입 코호트 기준점). 기존 체험자는 그대로 | `3` (host `.env.prod`, 백업 `.env.prod.bak-20261029-trial3`) |
| `SHORT_CONTENT_COHORT_SINCE` | 새 앱 스토어 배포 시각(ISO) | ④ 짧은 판 KAN-298 | 심사 통과·배포 시각. **짧은 판 재고를 먼저 채운다**(폴백 없음) | 구현 중 |
| `CONTENT_REVIEW_ENABLED` | `true` | 콘텐츠 후기 KAN-279 | 개인정보 처리방침 시행일(KAN-285) 이후 + FE KAN-280 배포 | 꺼짐 |
| `CONTENT_REVIEW_REWARD_ENABLED` | `true` | 후기 보상 KAN-279 | 위와 함께 | 꺼짐 |
| `SERIES_PAYWALL_ENABLED` · `SERIES_FREE_EPISODES` | `true` · `3` | ⑤ 시리즈 4편부터 프로 KAN-290 | **미구현** — 구현 후 FE KAN-294와 함께 | — |

- 키는 운영 Secrets `ear/prod/api`에 넣으면 배포(`push.sh` 선택 키 목록)가 `.env.prod`에 반영한다. 배포 없이 바꾸면 `.env.prod`를 백업하고 고친 뒤 API를 재생성한다.

## 사람 손 작업

- App Store Connect · Play Console 가격: daily ₩1,900 · pro ₩3,900 (상품 id 그대로, "기존 구독자 가격 유지" 선택 안 함) — KAN-286
- 랜딩 페이지 가격 문구(`landing-page/src/content/site.ts` 등) — 담당 전달
- IT 커뮤니티별 초대 코드 발급 — KAN-293
- 07:00 드립 도착 알림 기준선 지표 고정 — KAN-289 착수 전

## 순서·주의

- env 변경 뒤 API 재생성은 `API_IMAGE=$(cat .api-image)` 필수, 재생성 뒤 `Config.Image`가 ECR 태그인지 확인.
- 같은 날 여러 실험을 켜면 가입 코호트 비교가 섞인다 — 켠 시각을 각 티켓 처리 기록에 남긴다.
- 배포·재생성은 04:00–05:30 · 07:00 · 17:00 · 18:00–19:00 · 21:00 KST 근처를 피한다.

## 완료 조건

- Given 실험별 운영 반영 / When 이 표의 키를 켠다 / Then 각 실험 티켓 처리 기록에 켠 시각과 값이 남고, 이 표의 "운영" 상태가 갱신된다
- Given 모든 실험이 운영에 반영됐거나 취소됐다 / Then 이 티켓을 archive로 옮긴다

## 처리 기록

- 2026-10-29 발행(마크다운 + Jira KAN-300).
