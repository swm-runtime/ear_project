# [BE] 요금제 표시 이름·설명 변경(Light·Daily·Pro) + 무료 요금제도 action=current

| 항목 | 값 |
|---|---|
| 대상 | DB `plans`(개발계·운영) · `modules/subscription`(`GET /plans`의 `action` 판정) · `spec/api/subscription-api.md` · 테스트 픽스처 |
| 요청 파트 | 백엔드 |
| 요청자 | 이주호(PM) |
| 담당 | 박준현 |
| Jira | [KAN-147](https://runtime364.atlassian.net/browse/KAN-147) |
| 발행 날짜 | 2026-10-06 |
| 시작 날짜 | 2026-10-06 |
| 기한 | 2026-10-09 (Medium — 3일 안) |
| 선행 | 없음 |
| 근거 문서 | `backend/domain.md` 8.1(`plans` — "name·description 은 표시 문구라 DB 에서 고친다") · `spec/api/subscription-api.md` `action` 표 · 짝 FE 티켓 KAN-146(`tickets/frontend/pending/plan-management-redesign-pill-buttons.md`) |
| 중요도 | Medium — 1.2.0 묶음 빌드(결제 화면 첫 공개) 전에 맞춘다 |
| 상태 | 대기 |

## 1. 표시 문구 — DB `plans` (개발계·운영)

PM 결정(2026-10-06): 요금제 이름을 영어로, 설명에서 "무료로"·"광고 없이"를 뺀다(앱에 광고가 없다).

```sql
UPDATE plans SET name='Light', description='하루 2편까지 들을 수 있어요'     WHERE tier='light';
UPDATE plans SET name='Daily', description='하루 5편까지 들을 수 있어요'     WHERE tier='daily';
UPDATE plans SET name='Pro',   description='제한 없이 마음껏 들을 수 있어요' WHERE tier='pro';
```

- 운영에 넣으면 **지금 깔린 앱(1.1.0)의 프로필·설정 플랜 이름도 바로 바뀐다**(앱은 서버 값을 그린다)
- 테스트 픽스처(`billing-test-world.ts` 등)·시드 마이그레이션의 한국어 이름은 필요하면 맞춘다(시드는 기존 행을 덮지 않는다)
- 가입 체험 플랜 이름 "무료 체험"은 이번 범위가 아니다

## 2. `action` 계약 — 무료 요금제도 `current`

지금은 무료 티어(light)가 **항상** `none`이다(`subscription-api.md` `action` 표). 요금제 관리 화면 개편(KAN-146)은 "현재 구독" 섹션을 없애고 **이용 중인 요금제 카드에 [이용 중]**을 그린다. 무료 사용자도 Light 카드에 [이용 중]이 보여야 한다.

- **유효한 구독이 없는 사용자 → light 를 `current`**
- 유료 구독자 → light 는 지금처럼 `none`(유료 → 무료는 해지 — 스토어 이동)
- 다른 스토어 구독자 규칙(유료 전부 `none`)은 그대로
- `subscription-api.md` `action` 표의 `current`·`none` 조건을 고친다

## 완료 조건

- Given 개발계·운영 DB / When `plans`를 조회한다 / Then 이름이 Light·Daily·Pro, 설명이 위 문구다
- Given 구독이 없는 사용자 / When `GET /plans` / Then light 의 `action`이 `current`다
- Given Daily 구독자 / When `GET /plans` / Then daily 가 `current`, light 가 `none`이다
- Given `subscription-api.md` / When `action` 표를 읽는다 / Then 무료 요금제 `current` 조건이 적혀 있다
