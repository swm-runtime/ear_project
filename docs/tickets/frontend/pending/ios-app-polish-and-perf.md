# [FE] 프론트엔드 iOS 앱 자잘한 버그 제거·최적화

| 항목 | 값 |
|---|---|
| 요청 파트 | frontend |
| 요청자 | 이주호(PM) — 2026-09-27 주간 계획 |
| 담당 | 이주호 |
| 발행 날짜 | 2026-09-27 |
| 시작 날짜 | 2026-09-27 |
| 기한 | 2026-09-30 (Medium — 3일 안) |
| 선행 | 없음 |
| Jira | [KAN-103](https://runtime364.atlassian.net/browse/KAN-103) (담당: 이주호) |
| 중요도 | Medium — PM 이 중요도를 따로 정하지 않아 기본값. 마감이 안 맞으면 등급을 내리지 말고 사유를 적는다 |

## 요청

iOS 앱의 자잘한 버그를 모아 없애고 최적화한다 — 플레이어 줌 닫기 잔상(설계 결정: 열기 줌·닫기 슬라이드), 진단용 코드(설정의 개발계 트레이스 행·RNS earNoteZoomDiagnostic) 정리, JS 스레드를 잡는 애니메이션 점검(상시 루프는 네이티브 드라이버), 불필요 의존성(masked-view 사용처 재확인) 정리.

## 완료 조건

- Given iOS 실기기, When 여닫기·탭 전환·스크롤을 반복하면, Then 번쩍임·굳음·버벅임이 없다
- Given 운영 빌드, When 설정을 열면, Then 개발계 진단 행이 보이지 않는다

## 처리 기록

### 2026-10-02 — 코드 수정·검증 진행

- 운영에서도 `App.tsx`가 `loadJsTrace`·`installJsTraceErrorHook`를 호출하고 화면 전환·플레이어 수명주기가 `traceJs`를 호출해 매번 `diag.js_trace`를 저장하고 있었다. `js-trace.ts`에서 `IS_DEV_API`로 읽기·쓰기·오류 훅 등록을 개발계로 제한했다. 운영의 오류 처리는 기존 Sentry/RN 핸들러가 맡는다.
- 제목 마퀴와 온보딩 iOS 마퀴는 이미 네이티브 드라이버를 사용한다. 반복 `Animated.timing`에 `isInteraction: false`를 추가해 지속되는 마퀴가 목록의 후속 렌더 작업을 대기시키지 않도록 했다(RN Animated.loop 공식 안내).
- 설정 진단 행은 이미 `IS_DEV_API` 조건 아래에 있다. `masked-view`는 `shared/ui/MarqueeText.native.tsx`의 제목 페이드에 실제로 사용하므로 제거하지 않았다.
- 검증: TypeScript 및 변경 파일 ESLint 통과. JS 트레이스 환경 경계·기존 오류 핸들러 보존 테스트 4개, 주제 줄 분배·반복 벌 수 테스트 10개 통과. 마퀴 변경 근거: [React Native Animated.loop](https://reactnative.dev/docs/animated#loop).
- 남은 완료 조건: iOS 실기기에서 플레이어 여닫기·탭 전환·스크롤 반복 확인. 네이티브 RNS 진단 훅과 `ZoomTransitionRegistry`의 UserDefaults 기록 정리는 네이티브 빌드·실기기 검증이 필요해 이번 JS 수정에 포함하지 않았다. 이 검증 전에는 pending을 유지한다.
