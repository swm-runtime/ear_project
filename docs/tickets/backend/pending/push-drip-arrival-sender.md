# [BE] 드립 도착 푸시를 실제로 보낸다 — 발송 코드가 없다

| 항목 | 값 |
|---|---|
| 대상 | `backend/src/modules/` 신규 `notification` 모듈(`notification_logs` 소유 — `domain.md` 2장) · `drip-batch.orchestrator.ts`(탐험 편성까지 끝난 지점) · `auth.service.ts` `logout`(토큰 해제 TODO) · 배포 비밀값(Expo access token) |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-09-17 |
| 발견 시점 | 2026-09-17 "앱에서 알림이 안 온다" 문의 조사 — 고장이 아니라 **발송 경로가 처음부터 없었다** |
| 근거 문서 | `features/notification.md`(FR-19, P1) 4.2·4.3·8 · `features/drip-scheduling.md` 4.8(탐험 편) · `backend/domain.md` 3.6 `device_tokens` · 9.1 `notification_logs` · `spec/api/onboarding-api.md` 4.9 · `features/auth.md` 4.2(로그아웃 시 토큰 해제) · **`changes/archive/push-expo-and-discovery-in-drip-alert.md`(Expo Push·탐험 편 포함 결정 — 2026-09-17 문서 반영 완료)** |
| 연관 | `tickets/frontend/pending/push-sdk-integration.md` — **앱이 실제 토큰을 보내야** 이 티켓의 발송이 닿는다. 두 티켓이 모두 끝나야 사용자에게 알림이 간다 |
| 심각도 | **하** — P1 기능 미구현. 장애가 아니다 |
| 우선순위 | Low(이번 주 안) |

## 문제

`notification.md`는 **드립 편성 직후(05:00) 알림 수신 동의 사용자에게 "오늘의 콘텐츠 N편이 도착했어요"를 보낸다**고 정한다. 서버에 있는 것은 그 입력의 **저장**뿐이다.

| 있는 것 | 없는 것 |
|---|---|
| `PUT /users/me/devices/:device_id` — 토큰·OS 권한 저장(`device-token.service.ts`) | Expo Push로 실제 발송하는 클라이언트 |
| `user_settings.is_drip_notification_enabled` — 앱 토글 | 편성 완료 → 발송 대상 판정 → 발송 연결 |
| `notification_logs` 테이블(마이그레이션만, 보존 배치가 지운다) | 이 테이블을 쓰는 코드(소유 모듈 `notification` 자체가 없다) |
| | 로그아웃 시 토큰 해제 — `auth.service.ts` `logout`에 `TODO(notification 모듈 도입 시)`로만 남아 있다 |

게다가 앱은 아직 실제 토큰을 보내지 않는다(연관 FE 티켓). 지금 `device_tokens`에는 개발 스텁 토큰(`dev-push-token`)이나 `null`만 있을 수 있다.

> 참고: 문서에 정의된 푸시는 **드립 도착(`type = drip_arrival`) 하나뿐**이다(`notification.md` 3장 "MVP에서는 이 하나"). 관심 주제 밖 **탐험 편**("이런 주제는 어떠신가요?")도 새 알림 종류를 만들지 않고 이 알림에 합친다(결정 2026-09-17).

## 요청 내용

1. **`notification` 모듈 신설** — `notification_logs` Entity·Repository 소유. 의존은 `user`(`domain.md` 2장 — `notification → user`). 발송 클라이언트(**Expo Push API**)는 인터페이스 뒤에 두고 로컬·테스트는 가짜 구현을 쓴다(`admin`의 `ContentStorageClient` 선택 방식과 같은 관례).
2. **발송 연결** — 드립 편성 배치(`DripBatchOrchestrator`)가 사용자별로 **정규 편성과 탐험 편성(`drip-scheduling.md` 4.8)까지 끝낸 뒤**(탐험 성공·실패 무관) 발송을 요청한다. 편성 실패가 발송을, 발송 실패가 편성을 되돌리지 않는다(사용자 단위 격리).
   - **탐험 편도 알림에 포함한다 — 하루 1건으로 합친다**(사용자 결정 2026-09-17). N = 그날 적립된 정규 + 탐험 편수, **N ≥ 1이면 보낸다**(정규 0편 · 탐험 1편도 보낸다). 탐험 전용 알림은 따로 보내지 않는다. 라이브러리 도착 배너가 이미 탐험 편을 세는 것과 같은 기준이다(`library.md` 4.6)
3. **발송 대상 판정은 서버가 한다**(`notification.md` 4.2·4.3)
   - 앱 토글 `is_drip_notification_enabled = true` **그리고** 그 사용자의 `device_tokens` 중 `is_os_permission_granted = true` · `token IS NOT NULL` · `invalidated_at IS NULL`인 기기
   - **전 티어** 대상 — 티어로 가르지 않는다. 방해금지 없음
   - 하루 최대 1건 — `notification_logs`로 같은 사용자·같은 서비스 날짜의 `drip_arrival` 중복을 막는다(`domain.md` 9.1 B-8)
   - 보내지 않은 사유는 `status = skipped` + `skip_reason`(`no_permission` · `toggle_off` · `daily_cap`)으로 남긴다
4. **페이로드**(`notification.md` 3·4.3) — "오늘의 콘텐츠 N편이 도착했어요"(N = 정규 + 탐험) + 대표 콘텐츠 제목(정규 첫 편, 정규 0편이면 탐험 편), `deep_link`는 1편이면 해당 콘텐츠·2편 이상이면 라이브러리, `content_count`.
5. **토큰 수명**
   - Expo Push는 발송 응답(ticket)과 **나중에 조회하는 receipt**가 분리돼 있다. receipt에서 `DeviceNotRegistered`가 나오면 해당 `device_tokens.invalidated_at`을 찍어 다음부터 제외한다. 형식이 Expo 푸시 토큰이 아닌 값(`dev-push-token` 등)은 발송 전에 거른다
   - **로그아웃 시 그 기기의 토큰을 해제한다**(`auth.md` 4.2 — `logout`의 TODO). 완료 조건 "로그아웃한 기기로 알림이 가지 않는다"
6. **비밀값** — Expo access token(보안 발송 — EAS 프로젝트 설정에서 활성화)을 Secrets Manager `ear/prod/api`·`ear/dev/api`에 넣고 `env.validation.ts`에 등록한다. 저장소에 커밋하지 않는다. APNs 키·FCM 자격 증명은 **서버가 아니라 EAS**에 있다(FE 티켓). **개발계는 운영 사용자에게 보내지 않도록** 발송 여부 스위치를 둔다(개발계는 사용자 데이터가 분리돼 있지만 토큰은 기기 값이라 같은 기기가 양쪽에 등록될 수 있다).

## 결정 사항 (2026-09-17)

- **발송 수단 = Expo Push**(FCM 직접 아님). `frontend/architecture.md` 2 · `notification.md` 3·4.3·7·8 · `onboarding-api.md` 4.9 · 개인정보처리방침 6·6.1(Expo 수탁·국외 이전)에 **반영 완료**(2026-09-17 — `changes/archive/push-expo-and-discovery-in-drip-alert.md`). 문서대로 바로 구현하면 된다.
- **드립 도착 알림 = 정규 + 탐험 합쳐 하루 1건**(요청 2·4번).
- 발송 시각 — 편성 직후(05:00)가 확정이다(`notification.md` 4.3). "통근 직전 07:30 고정"은 미결 사항이며 이 티켓 범위가 아니다.

## 완료 조건

- Given 앱 토글 ON · OS 권한 허용 · 유효 토큰 기기를 가진 사용자(무료 포함) / When 05:00 편성이 정규 2편 + 탐험 1편을 적립한다 / Then 탐험 편성이 끝난 뒤 "오늘의 콘텐츠 3편이 도착했어요" 알림 **1건**이 발송되고 `notification_logs`에 `sent`로 남는다
- Given 탐험 편성이 실패한 사용자 / When 정규 2편만 적립된다 / Then "2편이 도착했어요" 1건이 발송된다
- Given 정규 후보가 없어 탐험 1편만 적립된 사용자 / When 편성이 끝난다 / Then 탐험 편을 대표로 1편 알림이 발송된다
- Given 같은 사용자 / When 같은 서비스 날짜에 편성이 다시 돈다 / Then 두 번째 알림은 보내지 않고 `skipped · daily_cap`으로 남는다
- Given 앱 토글 OFF / When 드립이 편성된다 / Then 발송하지 않고 `skipped · toggle_off`로 남는다
- Given OS 권한 거부 기기만 가진 사용자 / When 드립이 편성된다 / Then 발송하지 않고 `skipped · no_permission`으로 남는다
- Given 드립 1편 / When 알림을 만든다 / Then `deep_link`가 해당 콘텐츠를, 2편 이상이면 라이브러리를 가리킨다
- Given Expo receipt가 토큰을 `DeviceNotRegistered`로 알려준다 / When 다음 편성이 돈다 / Then 그 기기에는 보내지 않는다
- Given 로그아웃한 기기 / When 이전 사용자에게 드립이 편성된다 / Then 해당 기기로 알림이 가지 않는다
- Given 발송이 실패한다 / When 편성 배치 결과를 본다 / Then 적립은 그대로 남고 발송 실패만 `failed`로 기록된다
- Given 개발계 / When 편성이 돈다 / Then 스위치가 꺼져 있으면 실제 Expo Push 호출이 일어나지 않는다
