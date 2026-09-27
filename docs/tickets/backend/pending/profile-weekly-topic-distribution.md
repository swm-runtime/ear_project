# [BE] 프로필 주간 응답에 그 주의 주제 분포 싣기

| 항목 | 값 |
|---|---|
| 요청 파트 | backend |
| 요청자 | 이주호(PM) — 2026-09-28 04:15 "가장 많이 들은 주제를 주마다 · 비율만" |
| 담당 | (BE 배정) |
| 발행 날짜 | 2026-09-28 |
| 시작 날짜 | 2026-09-28 |
| 기한 | 2026-10-02 (Low — 이번 주 안) |
| 선행 | 없음 — FE 는 필드가 없으면 전체 기간으로 떨어지게 선반영했다(PR `feat(fe)/weekly-topics-by-week`). 문서 반영은 `changes/pending/profile-weekly-topics-merge.md` |
| Jira | [KAN-113](https://runtime364.atlassian.net/browse/KAN-113) |
| 중요도 | Low — 없어도 화면은 전체 기간으로 동작한다 |

## 배경

프로필 주간 청취 카드 안에 "가장 많이 들은 주제" 구획을 합쳤다(#883). 위 차트는 고른 주를 보여주는데 주제는 가입 후 전체 기간이라, 주를 넘겨도 주제가 그대로다. PM 결정(2026-09-28): **주제 분포를 주 단위로, 비율만**(08-06 "절대값 미표시" 유지). 전체 기간 분포는 화면에서 쓰지 않는다.

## 요청 — 계약

`weekly_listening`(4.1) 오브젝트와 `GET /users/me/profile/weekly-listening`(4.2) 응답에 **`topic_distribution`** 을 추가한다. 모양은 4.1 최상위 `topic_distribution` 과 **같다**.

```json
{
  "week_start": "2026-09-21",
  "daily_listened_sec": [0, 0, 0, 0, 0, 900, 1440],
  "previous_week_start": "2026-09-14",
  "next_week_start": null,
  "topic_distribution": {
    "topics": [
      { "topic_id": "uuid", "name": "뇌과학·인지", "ratio": 62 },
      { "topic_id": "uuid", "name": "경제", "ratio": 38 }
    ],
    "others_ratio": 0
  }
}
```

- **집계 기간 = 그 주**(월요일 04:00 ~ 다음 월요일 04:00, `daily_listened_sec` 와 같은 경계). 나머지 규칙은 4.1 `topic_distribution` 그대로 — 상위 5개 비율 내림차순 · 6위 이하 `others_ratio` · 여러 주제 콘텐츠는 각 주제에 그대로 더한 뒤 정규화 · 합 100 반올림 조정은 서버 · 숨김 주제도 포함 · 비율만(시간 미포함).
- 그 주 기록이 없으면 `topics: []`, `others_ratio: 0`.
- 4.1 최상위 `topic_distribution`(전체 기간)은 FE 가 주별로 옮긴 뒤 폐기 예정 — 이번 티켓에서는 **남겨 둔다**(구버전 앱 호환).
- FE 는 이웃 주를 미리 받는다(`changes/pending/profile-weekly-swipe-pager.md`) — 4.2 호출이 프로필 진입마다 1~2회 늘어난다. 주 단위 집계 쿼리 비용을 확인해 달라.

## 완료 조건

- Given 이번 주 기록이 있는 사용자, When `GET /users/me/profile`, Then `weekly_listening.topic_distribution` 이 그 주 청취만으로 집계된 상위 5 + 기타 비율(합 100)이다
- Given 과거 주, When `GET /users/me/profile/weekly-listening?week_start=…`, Then 같은 모양의 그 주 분포가 온다
- Given 기록 없는 주, When 조회, Then `topics: []` · `others_ratio: 0`
- Given 문서, When `spec/api/profile-api.md` 4.1·4.2 를 읽으면, Then 새 필드와 집계 기간이 적혀 있다

## 처리 기록

(담당자가 채운다)
