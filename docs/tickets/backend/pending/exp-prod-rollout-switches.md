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
| `DRIP_ARRIVAL_AB_ENABLED` | `true` | ③-1 도착 알림 시각 A/B KAN-289 | 개발계 07:30·08:00 로그 확인 뒤. 켠 시각을 티켓에 기록(07:00 기준선은 처리 기록에 고정됨) | 구현 중 |
| `RETENTION_MORNING_PUSH_MODE` | `dry_run` → `on` | ③ 아침 알림 KAN-288 | 개발계 dry_run 08:00 로그·시험 기기 확인 뒤. 저녁 `RETENTION_PUSH_MODE`와 따로 켠다 | 구현 중 |
| `SIGNUP_TRIAL_DAYS` | `3` | ⑦ 체험 3일 KAN-287 | 바꾼 시각 기록(가입 코호트 기준점). 기존 체험자는 그대로 | `3` (host `.env.prod`, 백업 `.env.prod.bak-20261029-trial3`) |
| `SHORT_CONTENT_COHORT_SINCE` | 새 앱 스토어 배포 시각(ISO) | ④ 짧은 판 KAN-298 | 심사 통과·배포 시각. **짧은 판 재고를 먼저 채운다**(폴백 없음) | 구현 중 |
| `CONTENT_REVIEW_ENABLED` | `true` | 콘텐츠 후기 KAN-279 | 개인정보 처리방침 시행일(KAN-285) 이후 + FE KAN-280 배포 | 꺼짐 |
| `CONTENT_REVIEW_REWARD_ENABLED` | `true` | 후기 보상 KAN-279 | 위와 함께 | 꺼짐 |
| `SERIES_PAYWALL_ENABLED` · `SERIES_FREE_EPISODES` | `true` · `3`(비우면 3, 1~99) | ⑤ 시리즈 4편부터 프로 KAN-290 | 구현됨(2026-10-30 — `feat(be)/series-paywall`). FE KAN-294(잠금 표시·PW2 시트) 배포와 함께 켠다(구버전 앱 대응은 하지 않기로 함 — KAN-290 결정. KAN-294가 없는 앱은 `is_locked`를 몰라 잠긴 편을 탭하면 403 에러만 본다). 켜면 응답 `is_locked`·재생 403 `SERIES_EPISODE_LOCKED`·드립 4편 차단·리텐션 "듣던 콘텐츠" 제외가 함께 바뀐다(앱 배포 없이 끄면 되돌아간다). **켜기 직전에 운영 스냅샷으로 추천 평가를 돌린다**(`recommendation-evaluation.md` 7장 — `eval:recommend --snapshot <운영 스냅샷> --series-paywall` 를 같은 스냅샷 · 같은 옵션의 기준선과 비교. 시리즈를 따라가던 무료 사용자 중 4편을 못 받게 되는 수 · 편성이 비는 수를 보고 켠다 — 2026-10-30 개발계는 합성 카탈로그로만 통과). 켠 시각을 KAN-290 처리 기록에 남긴다 | 꺼짐(키 없음) |

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
