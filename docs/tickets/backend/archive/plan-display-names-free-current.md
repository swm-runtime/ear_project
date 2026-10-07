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
| 상태 | **완료**(2026-10-07) |

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

## 처리 기록

### 2026-10-06 — 반영 (PR `feat(be)/plan-display-names-free-current`)

1. **표시 문구** — 손 SQL 대신 마이그레이션 `1789100000000-RenamePlanDisplayNames`로 넣었다(개발계·운영에 같은 값이 들어가야 하고, 되돌릴 수 있어야 해서). `tier` 기준 UPDATE 셋: Light / "하루 2편까지 들을 수 있어요", Daily / "하루 5편까지 들을 수 있어요", Pro / "제한 없이 마음껏 들을 수 있어요". `down`은 종전 한국어 문구로 되돌린다. 시드 마이그레이션은 손대지 않았다(기존 행을 덮지 않는 시드라 새 환경에서도 이 마이그레이션이 뒤에 돌아 같은 값이 된다). 테스트 월드(`billing-test-world.ts`)와 플랜 이름을 단언하는 스펙은 새 이름으로 맞췄다. 가입 체험 "무료 체험"은 범위 밖 그대로.
2. **`action`** — `resolvePlanAction`에 "무료 요금제이고 유효한 구독이 없으면 `current`" 분기를 추가했다. 유료 구독자에게 무료는 종전처럼 `none`, 다른 스토어 구독자 규칙도 그대로. 가입 체험 중인 사용자도 구독이 없으므로 무료가 `current`다(체험 여부는 4.2 `plan.trial`이 따로 알린다). `subscription-api.md` `action` 표·응답 예시·표시 문구 설명 갱신.
3. **확인** — 단위 205건(billing) 통과, e2e `subscription-billing.e2e-spec` 기대값을 `light → current`로 갱신(CI). 운영 반영은 다음 릴리스 — 들어가면 **지금 깔린 앱의 프로필·설정 플랜 이름이 바로 영어로 바뀐다**(앱은 서버 값을 그린다). KAN-146(FE)은 이 계약으로 "이용 중"을 그리면 된다.

**완료 조건**: ① DB 문구 — 마이그레이션으로 개발계는 머지 시 적용, 운영은 다음 릴리스에서 같은 마이그레이션이 자동 적용 ② `action` — 반영 ③ 문서 — 반영.

### 2026-10-07 — 완료 처리 (반영 날짜 2026-10-07)

짝 티켓 KAN-146(FE)이 완료됐고 서버 몫은 dev 머지로 끝났다(박준현 결정 2026-10-07). 운영 반영은 코드 작업이 아니라 다음 `dev → main` 릴리스의 마이그레이션 자동 적용이므로 여기서 닫는다 — 릴리스 뒤 운영 `plans` 이름이 Light·Daily·Pro인지는 릴리스 체크(`runbook.md` 4장)에서 본다.
