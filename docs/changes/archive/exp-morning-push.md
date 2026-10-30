# notification · domain — 아침 알림(드립이 없는 날 08:00 미청취 유도, `RETENTION_MORNING_PUSH_MODE`) (BE · KAN-288)

| 항목 | 값 |
|---|---|
| 대상 문서 | `features/notification.md` 4.6(아침 슬롯 신설 — 4.6-1 또는 표 행 추가)·8·6 · `features/drip-scheduling.md` 2(도착 알림 크론) · `backend/domain.md` 9.1 `notification_logs.type` |
| 요청 파트 | 백엔드 — 박준현 |
| 발행 날짜 | 2026-10-29 |
| 반영 날짜 | 2026-10-30 |
| 시작 날짜 | 2026-10-29 |
| 기한 | 2026-11-01 (Medium — 다음 통합 때) |
| 선행 | `changes/pending/exp-drip-arrival-ab.md`(KAN-289 — 같은 08:00 크론) |
| 중요도 | Medium — 서술 추가. 스위치가 꺼져 있으면(기본) 동작 변화 없음 |
| 관련 | [KAN-288](https://runtime364.atlassian.net/browse/KAN-288) · 브랜치 `feat(be)/morning-retention-push` · 티켓 `tickets/backend/pending/exp-morning-retention-push.md` |

## 배경

단기 실험 ③(2026-10-29 확정) — 드립이 있는 날만 아침 알림(도착 알림)이 가고 없는 날은 아무것도 가지 않았다. 드립이 없는 날(미완료 5편 이상으로 편성 건너뜀·후보 고갈 등)에도 아침에 "안 들은 콘텐츠"를 알려 앱으로 부른다. 사용자 결정(2026-10-29): 별도 크론이 아니라 **같은 아침 도착 알림 크론 안에서**, 드립을 받지 않은 사용자에게만 보낸다(하루 1건).

## 고칠 내용

### 1. `features/notification.md` 4.6 — 아침 알림 소절 추가(4.6-1)

> **아침 알림(KAN-288, 2026-10-29)** — 드립이 없는 날의 미청취 유도. 저녁 리텐션 알림과 같은 광고성 취급(마케팅 수신 동의자만 · `(광고)`·수신거부 표기 · 대상 = 온보딩 완료 · 보낼 기기).
>
> | 규칙 | 내용 |
> |---|---|
> | 시점 | 그룹 기준 시간대 **현지 08:00** — 드립 도착 알림 08:00 크론 안에서 B 그룹 도착 알림(시각 A/B 켜짐일 때)을 보낸 **뒤**. 07:30에는 보내지 않는다(야간 금지 21~08시). 배치가 08:00 뒤에 끝나면 08:00 크론은 건너뛰고 배치가 끝나는 즉시 보낸다(도착 알림과 같은 규칙) |
> | 야간 금지 | **사용자 현지 시각**으로 08~21시만. 같은 그룹 안에도 시차가 있어(동남아 그룹의 +7 나라 07:00, americas 서부 06:00) 현지 08시 전인 사용자는 그날 건너뛴다. 시간대를 모르면 그룹 기준 시간대로 본다 |
> | 대상 | 저녁과 같음 + **오늘 그 그룹 배치가 적립하지 않은 사용자**(드립이 있는 날은 도착 알림만) + 오늘(서비스 날짜) 도착 알림 `sent` 없음 + 최근 7일 안에 받은(드립·탐험) **안 들은(`unplayed`) 편이 1편 이상**(라이브러리에 살아 있고 같은 시장 공개 콘텐츠. 담은 편은 세지 않는다) + 오늘(현지 05:00 이후) 아직 안 들음 |
> | 빈도 | **하루 1건**(최근 20시간 안에 `retention.morning.*` `sent`가 있으면 건너뜀 — 재시작 대비). **주간 상한 없음.** 저녁 리텐션의 20시간·주 3건 상한과 **서로 세지 않는다** — 08:00 아침 알림이 같은 날 18:00 저녁 알림을 막지 않고, 어제 18:00 저녁 알림이 오늘 08:00을 막지 않는다 |
> | 탭 목적지 | 안 들은 편이 **1편이면 그 콘텐츠**(본문 = 제목), **여러 편이면 라이브러리** |
> | 문구 | KO 변형 2개(1편: "추천받은 콘텐츠를 아직 안 들었어요" / "출근길에 이 콘텐츠 어때요?" · 여러 편: "아직 안 들은 콘텐츠 {count}편이 있어요" / "추천받은 콘텐츠 {count}편이 기다리고 있어요"), EN 1개. 변형은 사용자·주 해시(`experimentBucket`, 키 `retention.morning.<주 시작>`)로 고정. 문구 원본은 `retention-push/morning-push.policy.ts` |
> | 보관 시한 | `ttl` 4시간 — 출근길 알림이라 점심 무렵이면 버린다 |
> | 기록 | `notification_logs.type = retention.morning.<변형>`. 앱은 `retention.*`를 이미 처리한다(탭 이동·포그라운드 숨김·`push_open`) — 앱 변경 없음 |
> | 서버 스위치 | **`RETENTION_MORNING_PUSH_MODE`** = `off`(기본) · `dry_run` · `on` — 저녁 `RETENTION_PUSH_MODE`와 따로다(저녁이 켜진 환경에 배포되자마자 아침이 나가지 않게, 두 실험을 따로 켜고 끄게). `dry_run`은 대상·문구까지 정하고 시험 대상(`RETENTION_PUSH_TEST_USER_IDS`, 저녁과 공유)에게만 보낸다. 로그 `retention morning push processed`에 대상 수·보낼 수·건너뛴 사유별 수(`placed_today`·`arrival_sent`·`already_sent`·`listened`·`no_unplayed`·`ad_hours`)·변형별 수(dry_run은 문구 예시)를 남긴다. 사용자 식별값은 싣지 않는다 |

### 2. `features/notification.md` 8장 완료 조건 — 추가

> - Given `RETENTION_MORNING_PUSH_MODE=on` · 마케팅 동의 · 오늘 드립 적립 없음 · 최근 7일 미청취 드립·탐험 편 1편 / When 그룹 현지 08:00 / Then 그 콘텐츠로 가는 `(광고)` 아침 알림 1건이 간다(여러 편이면 라이브러리)
> - Given 오늘 드립을 적립받은 사용자 / When 08:00 / Then 아침 알림은 가지 않는다(도착 알림만 — 하루 1건)
> - Given 마케팅 미동의(최신 행이 철회) / Then 아침 알림이 가지 않는다
> - Given 07:30 크론 / Then 아침 알림은 가지 않는다
> - Given 같은 날 08:00 아침 알림을 받은 사용자 / When 18:00 저녁 리텐션 판정 / Then 아침 알림은 저녁 상한에 세지 않는다(반대도 같다)
> - Given `dry_run` · 시험 대상 없음 / Then 아무에게도 보내지 않고 사유별 건수만 로그에 남는다

### 3. `features/notification.md` 6장 데이터 모델 표

> `consents`(최신 `marketing` 행) — 저녁 리텐션 알림(4.6)**·아침 알림(4.6-1)**의 수신 여부

### 4. `features/drip-scheduling.md` 2 — 도착 알림 크론 서술 끝에

> 08:00 크론은 아침 알림(`notification.md` 4.6-1, KAN-288)도 맡는다 — 그날 배치가 적립하지 않은 사용자에게만.

### 5. `backend/domain.md` 9.1 `notification_logs.type`

> `retention.<규칙>.<변형>`의 규칙에 `morning`(아침 알림, KAN-288)이 있다 — 저녁 규칙 표와 따로 센다.

## 완료 조건

- Given `features/notification.md` 4.6-1 / When 아침 알림 규칙을 본다 / Then 시점(08:00, 도착 크론 안)·사용자 현지 야간 금지·대상(드립 없는 날·미청취 7일·담은 편 제외)·하루 1건·저녁 상한과 독립·주간 상한 없음·목적지·스위치(`RETENTION_MORNING_PUSH_MODE`)가 적혀 있다
- Given `features/notification.md` 8장 / Then 위 완료 조건 6줄이 있다
- Given `backend/domain.md` 9.1 / Then `retention.morning.<변형>`이 적혀 있다

## 처리 기록

- 2026-10-29 발행(BE — 구현과 같은 PR).
- 2026-10-30 반영 — `features/notification.md` 4.6-1 "아침 알림" 소절 신설(규칙 표 그대로) · 8장 완료 조건 6줄 · 6장 `consents` 행, `features/drip-scheduling.md` 2장(08:00 크론이 아침 알림도 맡는다), `backend/domain.md` 9.1(`retention.morning.<변형>` — 저녁과 따로 센다). 선행 `exp-drip-arrival-ab.md`와 같은 통합에서 반영했다.
