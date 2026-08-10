# [FE 발행] 스킵 신호 제거 — 백엔드 문서(PRD·domain·드립 스코어링) 반영 요청

| 항목 | 값 |
|---|---|
| 발행 날짜 | 2026-08-10 |
| 대상 문서 | `docs/prd/ear_root_prd.md` 10장(지표)·FR-15, `docs/backend/domain.md` 6.4(`user_signals` action enum), `docs/features/drip-scheduling.md` 4.3(스코어링) |
| 요청 파트 | 프론트엔드 (와이어프레임 검토 결정 2026-08-10 — player V4) — **반영은 백엔드/통합** |
| 파급 | 드립 스코어링의 부정 신호 구성 · PRD 10 지표 정의 · enum 마이그레이션 |

## 결정 내용

**스킵 신호를 기록하지 않는다.** 종전 "재생 시작 후 20% 미만 지점 이탈 = `skip`" 잠정
규칙(README 결정 36번)을 폐기한다.

## FE 소유분은 반영 완료 (2026-08-10)

- `player.md` 1장·4.4(스킵 불릿 제거)·6장(`user_signals` 기록값)·8장(완료 조건을 부정형으로 교체)·미결
- `common-error-handling.md` 4.5 오프라인 큐 표(소비 신호 목록에서 skip 제거)
- `README.md` 결정 36번 갱신

## 백엔드 반영 요청 (이 문서가 pending에 있는 이유)

1. **`domain.md` 6.4** — `user_signals` action enum에서 `skip` 제거 (플레이어 기록값은
   `play`·`complete`·`replay`가 된다).
2. **`drip-scheduling.md` 4.3** — 스코어링의 스킵 감점 항목("스킵 회피", "play 후 skip = 부정")
   제거 또는 대체. **부정 신호가 `delete`·`unsave`만 남으므로, 초반 이탈을 감점에 계속 쓸지
   (쓴다면 어떤 원천으로) 편성 알고리즘 소유자가 판단 필요.** 7장 예외·완료 조건의 스킵 서술도
   함께 정리.
3. **PRD 10장** — 완청·스킵 지표의 조작적 정의에서 스킵 제거, 완청은 "90% 도달 순간 판정"으로
   정합화 (README 결정 23·36번 참조).

## 완료 조건

- Given 이 요청이 통합 과정에서 반영된다 / When `domain.md` 6.4를 읽는다 / Then `user_signals`
  action enum에 `skip`이 없다
- Given `drip-scheduling.md` 4.3을 읽는다 / When 스코어링 입력을 확인한다 / Then 스킵 신호가
  입력에 없고, 초반 이탈 감점의 대체 여부가 결정·서술되어 있다
- Given PRD 10장을 읽는다 / When 소비 신호 지표 정의를 확인한다 / Then 스킵 지표가 없다

---

## 처리 기록

| 항목 | 값 |
|---|---|
| 반영 날짜 | **2026-08-10** — 발행 당일 반영(사용자 지시로 백엔드 문서까지 직접 반영) |

1. **`domain.md` 6.4** — enum에서 `skip` 제거, 제거 사유·이탈 감점 재도입 시 원천
   (`playback_progresses.max_reached_sec`) 명시. "별도 테이블인 이유"의 skip 예시도 정리.
2. **`drip-scheduling.md`** — 1장 FR-15 표기 · 3장 signals[] · 4.2 스코어링 표("스킵 회피" →
   "부정 신호 회피") · 4.3 해석 표(skip·중간 이탈 행 제거 + 경위 불릿) · 7장 예외 · 8장 완료
   조건을 정리. **초반·중간 이탈 감점의 재도입 여부는 미결 사항으로 등재** — 편성 알고리즘
   소유자(백엔드)가 판단한다.
3. **PRD** — 10장 조작적 정의(완청 90% 도달 순간 판정 · 스킵 지표 폐기), FR-15, 4.1 시스템
   범위, 5.2 사용자 흐름의 스킵 표기 정리.

FE 소유분(player.md·common-error-handling.md·README 결정 36)은 발행 시점에 이미 반영됨.
