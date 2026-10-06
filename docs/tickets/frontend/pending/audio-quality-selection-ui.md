# [FE] 음질 선택 UI — 압축·AAC·WAV, 티어별 허용은 서버 값으로 표시

| 항목 | 값 |
|---|---|
| 대상 | `features/`(음질 선택 규칙 — 먼저) · `spec/uiux/settings-uiux.md`·`player-uiux.md` · `frontend/src/features/settings/` · `features/player/`(재생 URL 요청) · `frontend/design.md` |
| 요청 파트 | 프론트엔드 |
| 요청자 | 이주호(PM) |
| 담당 | 이주호 |
| Jira | [KAN-143](https://runtime364.atlassian.net/browse/KAN-143) |
| 발행 날짜 | 2026-10-06 |
| 시작 날짜 | 2026-10-06 |
| 기한 | 2026-10-09 (Low — 이번 주 안) |
| 선행 | KAN-141(`tickets/backend/pending/audio-quality-tiers.md` — 허용 음질 응답·재생 URL 음질 계약). 화면 규칙·카피 정리는 선행 없이 먼저 한다 |
| 근거 문서 | `features/paywall.md`(업셀 여는 지점) · `features/subscription.md` · KAN-124(`tickets/frontend/pending/audio-url-refresh-gapless.md` — 음원 교체 제거) |
| 중요도 | Low — PM 발행(2026-10-06). 중요도 미지정이라 이번 주 마감으로 잡았다 — 구현은 KAN-141 계약이 나온 뒤라 넘어가면 사유를 처리 기록에 적는다 |
| 상태 | 대기 |

## 무엇을 한다

사용자가 재생 음질을 **압축 · AAC · WAV** 중에서 고른다. PM 결정(2026-10-06): Light·Daily 는 압축·AAC, Pro 는 WAV 까지.

1. **규칙 먼저** — 선택 위치(설정의 기본 음질 · 플레이어에서 바로 바꾸기 여부), 기본값, 셀룰러에서 WAV 처리를 `features/`에 적고 카피·상태를 `spec/uiux/`에 적는다
2. **허용 여부는 서버 값으로만** — 서버가 준 허용 음질 목록·현재 선택값을 그대로 그린다. **티어명 하드코딩·클라이언트 판정 금지**(CLAUDE.md). 허용 안 된 음질은 잠금 표시 + 탭하면 구독 업셀(`paywall.md`의 여는 지점 규칙)
3. **재생 연동** — 재생 URL 요청에 선택 음질을 보낸다. 서버가 대체해서 다른 음질을 주면 실제 재생 음질을 표시한다
4. **바꿀 때 재생 중 처리** — 다음 재생부터 적용 vs 즉시 교체. 즉시 교체는 지금 구조에서 끊김이 생기므로 KAN-124(음원 교체 제거)와 함께 정한다
5. **데이터 안내** — WAV 는 편당 약 100~200MB 라 셀룰러에서 처음 고를 때 한 번 안내한다
6. 접근성: 선택지는 라디오 그룹으로 읽히고, 잠긴 항목은 "Pro 구독 필요"를 함께 읽는다

## 완료 조건

- Given `features/`·`spec/uiux/` / When 읽는다 / Then 선택 위치·기본값·잠금·업셀·셀룰러 안내 규칙과 확정 카피가 적혀 있다
- Given Light·Daily 계정 / When 음질 선택을 연다 / Then 압축·AAC 는 고를 수 있고 WAV 는 잠금으로 보이며 탭하면 업셀이 열린다
- Given Pro 계정 / When WAV 를 고르고 재생한다 / Then 재생 URL 요청에 WAV 가 실리고 WAV 로 재생된다
- Given 서버가 요청 음질을 대체해 응답 / When 재생 화면을 본다 / Then 실제 재생 음질이 표시된다
- Given 코드 / When 티어명을 grep 한다 / Then 음질 허용 판정에 티어명 분기가 없다
