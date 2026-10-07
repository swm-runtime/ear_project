# [BE] 구간에 구역(`kind`)·요약(`summary`) 필드 추가 — 적재 검증·저장·재생 발급 응답

| 항목 | 값 |
|---|---|
| 대상 | `modules/admin`(대본 파일 검증 — `admin-api.md` 4.6·4.10) · `content_scripts.sections`(`domain.md` 5.3) · 재생 발급 응답(`player-api.md` 4.1) · 테스트 |
| 요청 파트 | 백엔드 |
| 요청자 | 이주호(PM) |
| 담당 | 박준현 |
| Jira | [KAN-151](https://runtime364.atlassian.net/browse/KAN-151) |
| 발행 날짜 | 2026-10-07 |
| 시작 날짜 | 2026-10-07 |
| 기한 | 2026-10-09 (Low — 이번 주 안) |
| 선행 | 없음. 이 티켓이 파이프라인 티켓(`tickets/ai/pending/section-kind-emit.md` — KAN-152)의 선행이다 — 지금 검증이 **모르는 키를 거부**해서, 서버가 먼저 받아야 파이프라인이 보낼 수 있다 |
| 근거 문서 | PM 결정(2026-10-07 — 플레이어 구간 카드에 "개요·본론·결론") · `player.md` 4.6-1 · `admin-api.md` 4.6 · `domain.md` 5.3 · KAN-144(`tickets/backend/archive/content-script-sections.md`) |
| 중요도 | Low — PM 발행(2026-10-07). 중요도 미지정이라 이번 주 마감으로 잡았다 |
| 상태 | 대기 |

## 배경

플레이어 구간 카드(KAN-127)가 **"개요 · 본론 · 결론"** 라벨을 띄운다(PM 2026-10-07). 지금 `sections`는 `{ start_sec, title }`뿐이라 어느 구간이 본문인지 알 수 없다 — 운영 실측(2026-10-07): 대본 46편 중 40편에 구간이 있고, 36편은 `인트로 · 도입 · {단락 제목…} · 마무리`, 4편은 `인트로 · 도입 · 본문 · 마무리`. 앱이 제목 글자로 추측하지 않도록 구역을 값으로 싣는다.

## 할 일

1. **적재 검증**(`admin-api.md` 4.6·4.10) — `sections[]` 항목에 선택 키 둘:
   - `kind`: `intro` | `lead` | `body` | `outro`. 그 밖의 값은 거부
   - `summary`(추가 2026-10-07 PM "무조건 두 줄로"): 비어 있지 않은 문자열 **≤ 60자**(파이프라인은 25~44자로 만든다 — 상한은 여유). 앱 카드 아래 두 줄에 그린다
   - 둘 다 생략 허용(종전 파일 그대로 통과 — 이미 발행된 편·파트너 콘텐츠)
2. **저장**(`domain.md` 5.3) — `content_scripts.sections` jsonb 항목에 `kind` 그대로. 스키마 변경 없음(jsonb), 문서의 형식 표기만 `[{ start_sec, title, kind? }]`
3. **재생 발급 응답**(`player-api.md` 4.1) — `sections[].kind`·`summary` 그대로 내려준다. 없으면 키 생략. 앱은 이미 받을 준비가 돼 있다(PR — `feat(fe)/section-kind-label`): 모르는 값·생략은 "지금 듣는 구간" + 제목으로 그린다
4. `player-api.md` 4.1 `sections` 설명의 "미니 플레이어 위" → "전체 플레이어 시크바 위 카드"도 같이 고친다(`changes/pending/player-api-sections-display-location(fe).md`)

## 완료 조건

- Given `kind: "body"`·`summary`가 실린 대본 파일 / When 발행·대본 PATCH 한다 / Then 적재되고 `content_scripts.sections`에 둘 다 남는다
- Given `summary`가 61자 / When 적재한다 / Then 대본이 거부된다
- Given `kind: "chapter"`(모르는 값) / When 적재한다 / Then 대본이 거부된다(`script_rejected_reason`)
- Given `kind`가 없는 종전 파일 / When 적재한다 / Then 종전처럼 통과한다
- Given `kind`·`summary`가 있는 콘텐츠 / When 재생 발급 / Then 응답 `sections[].kind`·`summary`가 내려간다
- Given `admin-api.md`·`player-api.md`·`domain.md` / When 읽는다 / Then `kind` 값 집합과 생략 규칙이 적혀 있다
