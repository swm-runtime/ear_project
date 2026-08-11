# [FE] frontend/architecture.md — 오디오 스택 expo-audio 변경 + player→settings 의존 추가

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/frontend/architecture.md` 2장(Tech Stack 오디오 행) · 4.4(의존 방향 표) · 5.1(PlaybackService 서술) |
| 요청 파트 | 프론트엔드 |
| 발행 날짜 | 2026-08-11 |
| 관련 작업 | player feature 구현(`feat(fe)/player`) — PL1~PL11, PlaybackService, 미니플레이어 공용 승격 |
| 파급 | 코드는 이미 이 내용대로 구현됨. features/spec 문서에는 영향 없음(동작 규칙 무변경 — 구현 수단·의존 표만 개정) |

## 왜 기록하는가

### 1. 오디오 라이브러리: react-native-track-player → expo-audio

architecture.md 2장은 오디오를 **react-native-track-player**로 확정해 두었다. player 구현
시점(2026-08-11)에 확인한 결과 **Expo SDK 57의 expo-audio가 당시 track-player를 선택했던
요구를 전부 자체 지원**하게 되었다(백그라운드 재생 `shouldPlayInBackground`, 잠금화면·알림센터
컨트롤 `setActiveForLockScreen` — ±탐색 버튼 포함, 오디오 포커스 `interruptionMode: doNotMix`).

- **Expo Go에서 포그라운드 재생이 동작한다** — mock 기반 개발 워크플로를 dev build 전환 없이
  유지할 수 있다. track-player는 Expo Go에서 아예 동작하지 않는다.
- Expo 공식 라이브러리라 SDK 업그레이드 추적 비용이 없고, RN 신아키텍처 호환을 Expo가 보증한다.
- 백그라운드·잠금화면은 config plugin(`app.json`에 등록됨) + dev build에서 활성된다 — 이 제약은
  track-player도 동일하다(네이티브 구성 필요).
- 사용자 승인: 2026-08-11 player 개발 세션에서 expo-audio 채택을 확인받음.

### 2. 의존 방향 표(4.4)에 player → settings 추가

배속의 저장소는 `user_settings.default_playback_rate` 하나다(`settings-api.md` 4.2 소관).
플레이어 배속 시트(PL4)의 "전역 저장"과 초기 배속 하이드레이션이 settings의 공개
API(`updateUserSettings` · `useSettingsQuery`)를 호출한다 — 계약을 player가 재선언하면 같은
엔드포인트의 DTO가 두 벌이 된다.

참고: player ↔ library의 역방향 동작(플레이어 더보기의 삭제·완청 폴백)은 표를 바꾸지 않고
TokenProvider와 같은 브리지 인터페이스(`registerPlayerLibraryBridge`)로 app/bootstrap이
주입한다 — 의존 방향(library → player)은 그대로다.

## 기록할 내용

1. **2장 Tech Stack 오디오 행** — "react-native-track-player | 백그라운드 재생, 잠금화면·알림센터
   컨트롤, 오디오 포커스"를 **"expo-audio | SDK 57부터 백그라운드 재생·잠금화면 컨트롤·오디오
   포커스 자체 지원. config plugin 필요(잠금화면·백그라운드는 dev build에서 활성)"** 로 교체한다.
2. **5.1 PlaybackService 서술** — "track-player를 감싸는 유일한 재생 제어 지점"의 track-player를
   expo-audio로 교체한다.
3. **4.4 의존 방향 표**에 행 추가 — `player | paywall, subscription, settings | ... / 배속
   저장·조회(user_settings — settings-api.md 4.2 계약 재사용)`.

## 완료 조건

- Given 이 요청이 통합 과정에서 반영된다 / When `frontend/architecture.md` 2장·5.1을 읽는다 /
  Then 오디오 스택이 expo-audio로 기재되어 있고 track-player 서술이 남아 있지 않다
- Given 반영된 4.4 표를 본다 / When player 행을 읽는다 / Then settings 의존과 사유(배속 저장)가
  기재되어 있어 코드의 `@/features/settings` import가 표와 어긋나지 않는다
