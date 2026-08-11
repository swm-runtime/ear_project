# [FE] interest-management-uiux.md 4.6 — 스와이프 이탈의 표현: 팝업 대신 제스처 차단

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/spec/uiux/interest-management-uiux.md` 4.6(IM7) · `docs/features/interest-management.md` 5장(뒤로가기 행) |
| 요청 파트 | 프론트엔드 |
| 발행 날짜 | 2026-08-11 |
| 관련 작업 | interest feature 구현(`feat(fe)/interest-management`) — 시뮬레이터 검증 중 발견 |
| 파급 | 동작 규칙("변경이 있으면 확인 없이 이탈되지 않는다")은 유지. 스와이프에 한해 표현만 다르다 |
| 상태 | **반영 완료** (2026-08-11, 관심사 관리 통합 시점) |

> **2026-08-11 반영 결과** — `interest-management-uiux.md` 4.6에 구현 제약 각주를 추가했다: 스와이프는 native-stack 제약으로 팝업 대신 `gestureEnabled: false` 비활성화(변경 없으면 정상 dismiss), 팝업은 뒤로가기 버튼·하드웨어 백. 동작 규칙의 목적 유지 문구까지 원안대로다. `features/interest-management.md` 5장은 요청대로 무변경.

## 왜 기록하는가

uiux 4.6은 "변경이 있는 상태의 **뒤로가기·스와이프 제스처**에만 [IM7 팝업이] 뜬다"로 두
이탈 수단을 같은 표현(팝업)으로 묶었다. 그러나 구현 스택(React Navigation **native-stack**)에서는
스와이프 백 제스처가 **네이티브에서 확정된 뒤에야 JS에 통지**되어 `beforeRemove`의
`preventDefault`로 막을 수 없다 — 시뮬레이터 검증(2026-08-11)에서 팝업 없이 화면이 닫히고
"The screen was removed natively" 경고가 발생하는 것을 확인했다.

React Navigation 공식 가이드의 해법대로 **변경·저장 중에는 `gestureEnabled: false`로 제스처
자체를 비활성화**하는 것으로 구현했다. 결과:

- 뒤로가기 버튼·Android 하드웨어 백 → `beforeRemove` 가로채기 → **IM7 팝업**(uiux대로)
- 스와이프 제스처 → 변경이 있는 동안 **동작하지 않음**(팝업 없음). 변경이 없으면 정상 dismiss

동작 규칙의 목적("잃을 것이 있는 이탈은 확인 없이 일어나지 않는다")은 유지되고, 스와이프에
한해 "팝업 노출" 대신 "제스처 무효"로 표현이 달라진다.

## 기록할 내용

- uiux 4.6에 구현 제약 각주 추가: "스와이프 제스처는 native-stack 제약으로 팝업 대신
  비활성화로 처리한다(변경 없으면 정상 동작). 팝업은 뒤로가기 버튼·하드웨어 백에서 뜬다."
- features 5장 "뒤로가기(변경 있음)" 행은 그대로 유효(판정 규칙 무변경).

## 완료 조건

- Given 이 요청이 통합 과정에서 반영된다 / When uiux 4.6을 읽는다 / Then 스와이프 이탈의
  표현(제스처 비활성)이 기재되어 있고, 코드(`gestureEnabled` 토글)와 일치한다
