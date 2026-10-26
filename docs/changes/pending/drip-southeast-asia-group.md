# 드립 발송 그룹에 `southeast_asia`(싱가포르 기준) 추가

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/global-api.md` 2.4(발송 그룹 정의) · `features/drip-scheduling.md` 2(그룹 표) · `features/notification.md` 4.3·4.6(그룹 현지 07:00·18:00 — 그룹 이름 나열이 있으면) · `backend/domain.md` 7.3 `drip_batch_runs.group` 값 |
| 요청 파트 | 백엔드 — 박준현 |
| 발행 날짜 | 2026-10-26 |
| 시작 날짜 | 2026-10-26 |
| 기한 | 다음 통합 |
| 선행 | 없음 · 코드 `feat(be)/drip-southeast-asia-group` |
| 중요도 | Low — 코드는 반영됨. 문서가 코드를 따라간다 |

## 배경

1차 공개 7개국(2026-10-15 결정 — `tickets/ops/archive/store-english-legal-links.md`: 한국·싱가포르·말레이시아·필리핀·태국·인도네시아·홍콩) 중 한국을 뺀 6개국이 전부 UTC+7·+8인데, 발송 그룹 `asia`(UTC+5 이상)의 기준이 KST 라 현지로 **도착 알림 05:00~06:00 · 리텐션 알림 16:00~17:00**이었다 — 07:00으로 옮긴 이유("새벽 5시 알림은 잠금화면에 묻힌다")를 동남아가 그대로 겪었다. 반대로 europe·americas 는 공개 국가 기준으로 거의 비어 있다(10-26 각 0·1명). 결정(2026-10-26 박준현): 동남아 그룹을 하나 둔다.

## 고칠 내용

1. 그룹 정의(`global-api.md` 2.4 · `drip-scheduling.md` 2) — 선언 순서대로 오프셋 하한 판정:

   | 그룹 | 오프셋 | 기준 시간대 | 현지 05:00 편성 = KST | 비고 |
   |---|---|---|---|---|
   | `asia` | **UTC+9 이상** | Asia/Seoul | 05:00 | KR 시장은 시간대 무관하게 전원 여기 |
   | **`southeast_asia`** (신설) | **UTC+5 이상** | **Asia/Singapore** | 06:00 | 싱가포르·말레이시아·필리핀·홍콩(+8) 현지 07:00 알림 · 태국·인도네시아 서부(+7) 06:00 |
   | `europe` | UTC−1 이상 | Europe/London | 13:00~14:00 | |
   | `americas` | 그 아래 | America/Chicago | 19:00~20:00 | |

   - 종전 `asia` 하한 UTC+5 → UTC+9. GLOBAL 이면서 +5~+8.x 인 사용자가 `southeast_asia`로 옮긴다. KR 시장은 영향 없음.
   - 싱가포르 05:00·07:00 은 같은 KST 서비스 날짜 안이다(서머타임 없음). 리텐션 알림 18:00 SGT = 19:00 KST.
   - 스위치 `DRIP_TIMEZONE_GROUPS_ENABLED`가 꺼져 있으면 종전처럼 전원 `asia`.
2. `domain.md` 7.3 `drip_batch_runs.group` 값에 `southeast_asia`(varchar(16) 안 — 마이그레이션 없음).
3. 크론 3개 추가(편성 `daily-drip-batch-southeast-asia` · 도착 `drip-arrival-push-southeast-asia` · 리텐션 `retention-push-southeast-asia`) — 문서에 크론 목록이 있으면 함께.

## 완료 조건

- Given 위 문서들 / Then 그룹 4개의 오프셋 하한·기준 시간대·현지 시각이 적혀 있고 `drip-group.policy.ts` `DRIP_GROUP_SCHEDULES`와 같다

## 처리 기록

- 2026-10-26 발행(박준현).
