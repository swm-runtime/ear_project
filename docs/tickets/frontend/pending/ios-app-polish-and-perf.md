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
| 상태 | 진단 코드 정리 반영 — 묶음 빌드 대기 (2026-10-06) |

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

### 2026-10-06 — 줌 전환 진단 코드 정리 ([#1144](https://github.com/swm-runtime/ear_project/pull/1144))

- **RNS 패치**(`frontend/patches/react-native-screens+4.26.2.patch`) — 줌 번쩍임 추적(2026-09-26~27, runtime 15·16·20·23)에서 넣은 진단 훅을 걷어냈다.
  - `RNSScreen.h`의 `+ earNoteZoomDiagnostic:` 선언(이 파일 헌크가 통째로 빠졌다)과 `RNSScreen.mm`의 구현(`ZoomTransitionRegistry noteDiagnostic:` 를 performSelector 로 부르던 것).
  - 호출부 전부 — `RNSScreen.mm`: `settled:` · `willDisappear:interactive|other` · `coordinator:cancelled` · `snapshot:window=… detached=…` · `snapshot:scheduled-removal` · `snapshot:removed`. `RNSScreenStack.mm`: `setModalViewControllers` 의 `modals:n=… pm=… pvc=…` 블록(runtime 16 "모달 갱신 경로 진단") · 줌 소스 provider 의 `provider:… over=…` · `present:… anim=…` · `dismiss:… beingDismissed=…` · `stale-modals:…`.
  - 진단에만 쓰이던 `earSettleInteractiveDismissFrom:(NSString *)origin` 의 인자를 없애 `earSettleInteractiveDismiss` 로 바꿨다(호출부 2곳 함께).
  - **기능 헌크는 그대로다**: 인터랙티브 닫힘 정리(모달 장부 `modalWasDismissedNatively:` + preferredTransition 해제 + JS 통지 1회, rt 14·15·17), viewDidDisappear 지연 재확인, `setViewToSnapshot` 의 분리 모달 처리·스냅샷 전환 완료 제거(rt 18·19), 줌 소스 provider 의 `isZoomOver` nil 반환(rt 23), `earDropStaleModals`(rt 27), 큰 제목 `.inline`/`.always`(rt 28·29), `setContentScrollView` 지정·0.5초 재확인(rt 30·31), `interactiveDismissShouldBegin`(rt 13).
  - 검증: 이전 패치와 새 패치를 diff 해 진단 줄, 기록을 설명하던 provider 주석 한 구절, 헌크 줄 번호, 인자 이름 외에 바뀐 줄이 없음을 확인했다. `npm ci` 의 postinstall(patch-package)로 두 패치 모두 적용됨을 확인했다.
- **`modules/zoom-transition/ios/ZoomTransitionModule.swift`** — `diagnosticsKey`·`diagnostics`(UserDefaults 보존, rt 20)·`noteDiagnostic`·`diagnosticsText`·`getDiagnostics` 모듈 함수, `dismissPresentedScreen`·`discardLeftoverContainers` 의 `native-dismiss:*`·`cleaned:*` 기록을 지웠다. 이미 설치된 앱에 남은 기록은 모듈 `OnCreate` 에서 `ear.zoomTransition.diagnostics` 키를 `removeObject` 로 지운다(없는 키면 아무 일도 안 한다). 네이티브 진단 카운터(rt 15)는 현재 코드에 남아 있지 않았다.
- **JS** — `modules/zoom-transition/src/index.ts` 의 `getDiagnostics` 선언·`getZoomTransitionDiagnostics`, `shared/navigation/zoom-transition.ts` 의 `getPlayerZoomNativeDiagnostics`, 설정 개발계 "스택 라우트" 행의 `네이티브 …` 부분을 지웠다(개발계 전용 행이었고 옵셔널 호출이라 31 빌드에서도 안전).
- **runtimeVersion 은 31 유지** — JS 가 `getDiagnostics` 를 더 부르지 않아 31 빌드 위에서 깨지지 않는다. 네이티브 변경은 묶음 빌드(32, KAN-118·KAN-124·KAN-120 과 함께)에 실린다. `app.json` `_runtimeVersionNote` 에 기록했다.
- 검증: `tsc --noEmit` · `eslint src` · jest 275개 통과. **iOS 네이티브(Obj-C++·Swift)는 Windows 에서 컴파일하지 못했다** — 지운 식별자(`earNoteZoomDiagnostic`·`noteDiagnostic`·`diagnosticsText`·`getDiagnostics`·`earSettleInteractiveDismissFrom`)를 패치 적용된 RNS 소스·`modules/` 전체에서 grep 해 남은 참조가 없음과 괄호 짝을 눈으로 확인했을 뿐이다. 묶음 빌드가 첫 컴파일이다.
- 남은 완료 조건: 묶음 빌드 후 iOS 실기기에서 플레이어 여닫기·탭 전환·스크롤 반복(번쩍임·굳음·버벅임 없음). 그때까지 pending 유지.
