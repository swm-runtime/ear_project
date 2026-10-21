# 서비스 지표 "최근 24시간 인기 콘텐츠" — `recent_top_contents` (BE)

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/admin-api.md` 4.22(`recent_top_contents` · `recent_since`) |
| 요청 파트 | 백엔드 — 박준현(요청: FE 이주호, 2026-10-18 "최근 하루 어떤 콘텐츠가 인기 있었는지 어드민에서") |
| 발행 날짜 | 2026-10-18 |
| 관련 | 브랜치 `feat(be)/insights-recent-contents` · 파이프라인 웹 서비스 지표 탭 · 스키마 변경 없음 |

## 배경

서비스 지표의 콘텐츠 순위(`top_contents`)는 **전 기간** 청취 시간 순이다. 초기에 발행돼 오래 쌓인 편이 늘 위에 있어, "어제·오늘 무엇이 잘 나갔나"가 보이지 않는다.

## 수정 내용

`admin-api.md` 4.22 Response에 두 필드를 더한다.

```json
{
  "recent_since": "2026-10-17T03:00:00.000Z",
  "recent_top_contents": [
    { "content_id": "…", "title": "…", "duration_sec": 612, "listen_sec": 4380, "plays": 11, "listeners": 9, "completes": 4, "complete_rate": 0.364, "saves": 2 }
  ]
}
```

- `recent_since`: 창 시작 시각으로, **지금 - 24시간**이다. 굴러가는 창이라 KST 달력일과 다르다. 자정 직후에 열어도 비지 않고, 언제 열든 같은 길이로 본다.
- `recent_top_contents`
  - 항목 모양은 `top_contents`와 같다.
  - 세는 범위
    - 재생·청취 시간·청취자: `recent_since` 이후 **시작된** 재생(`play_records.played_at`)
    - 완청: 그 뒤에 생긴 완청 신호(`user_signals.created_at`)
    - 담기: 그 뒤에 생긴 담기(`library_items.added_at`, `source = 'save'`)
  - **정렬은 청취자(서로 다른 사람) 수 순**이다. 같으면 청취 시간, 그다음 재생 수 순이다. 전 기간 순위(청취 시간 순)와 다른 이유는 한 사람이 오래 들은 편이 "인기"로 올라오지 않게 하기 위해서다.
  - 최대 15편이다(`top_contents`와 같은 길이). 창 안에 재생이 없으면 빈 배열이다.
  - 현재 계정 기준이다. 탈퇴자의 재생은 빠진다(`top_contents`와 같다).
  - 담기는 나중에 지운 것(`deleted_at`)도 센다. 전 기간 순위와 같은 관례다.
  - **`complete_rate`는 드물게 높게 나올 수 있다.** 재생은 `play_records`(사용자·콘텐츠·서비스 날짜당 1행)의 첫 시작 시각으로, 완청은 신호 시각으로 창에 넣기 때문이다. 서비스 날짜 경계(05:00)를 걸쳐 들은 편은 재생은 창 밖이고 완청만 창 안일 수 있다.
- `top_contents`(전 기간)는 바꾸지 않는다.

## 완료 조건

- Given `admin-api.md` 4.22 / When Response와 설명을 읽는다 / Then `recent_since`(지금 - 24시간)·`recent_top_contents`(창 안만, 청취자 수 순, 최대 15, 항목 모양 = `top_contents`)가 위와 같다

## 처리 기록

- 2026-10-18 발행. E2E로 확인했다: 지금 3명이 들은 콘텐츠는 `plays 3 · listeners 3 · completes 1`로 실린다. 이틀 전에만 재생된 콘텐츠는 빠진다. 정렬은 청취자 수 내림차순이다.
- 2026-10-19 **반영**(PR `docs(be)/apply-pending-changes-1019`). 반영 날짜 2026-10-19. `admin-api.md` 4.22(`recent_top_contents` · `recent_since`, Query 줄의 "창과 무관")에 반영했다.
