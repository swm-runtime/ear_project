# [FE] 플랫폼별 runtimeVersion이 갈라져 있어 발행 한 번으로 양쪽에 닿지 않는다

| 항목 | 값 |
|---|---|
| 대상 | `frontend/app.json`(`runtimeVersion`) · `.github/workflows/eas-update.yml` |
| 요청 파트 | 프론트엔드 |
| 발행 날짜 | 2026-09-08 |
| 발견 시점 | 회수·재발행 수정(`withdrawn-republish-playback-sync`)을 실기기로 검증하다 — 고친 코드가 iOS에 **한 번도 도달하지 않았는데** 도달한 줄 알고 30분을 태웠다 |
| 근거 문서 | `frontend/architecture.md` 2.1(runtimeVersion 고정 규칙) |
| 심각도 | **중** — 기능 결함은 아니지만 **모든 릴리즈의 검증을 오염시킨다.** 안 고치면 매번 같은 함정을 밟는다 |
| 상태 | 대기 |

## 문제

`runtimeVersion`은 고정 문자열 `cc07cb6e497796c40be4778873fb8502e9e1f827`인데,
**이미 배포된 iOS 빌드(vc=3)는 정책 전환 이전에 만들어져 `1.0.0`을 embed하고 있다.**

| 플랫폼 | 배포된 빌드 | embed된 runtimeVersion |
|---|---|---|
| Android | vc=7 (스토어) | `cc07cb6e…` — 발행값과 일치 ✅ |
| iOS | vc=3 | `1.0.0` — **발행값과 불일치** ❌ |

지문이 다르면 EAS는 그 빌드에 업데이트를 주지 않는다. CI(`eas-update.yml`)는 `app.json`의
값 하나로만 발행하므로 **iOS는 CI 발행을 영원히 못 받는다.** 받으려면 사람이 매번:

```
app.json의 runtimeVersion을 로컬에서만 "1.0.0"으로 바꾸고
eas update --channel production --platform ios --environment production
그리고 되돌린다
```

2026-09-08 하루에만 이 백필을 세 번 했다.

## 왜 위험한가 — 조용히 틀린다

**실패가 실패처럼 보이지 않는다.** iOS는 에러 없이 그냥 옛 번들로 계속 돈다. 그날 검증한
사람은 "고쳤다는데 안 된다"를 보고, 고친 사람은 "발행했다"를 본다. 둘 다 맞는 말이라
원인을 찾는 데 로그 포렌식이 필요했다(회수 시각 대비 저장 요청 시각, `platform=` 쿼리,
새 코드에만 있는 라우트 호출 여부).

## 요청 내용

1. **다음 iOS 빌드에서 양 플랫폼의 `runtimeVersion`을 앱 버전과 무관한 문자열로 통일한다**
   (`"1"` 같은 것). 앱 버전(`1.0.0`)을 쓰면 버전을 올릴 때마다 같은 분기가 다시 생긴다.
   **새 문자열을 지으면 이미 배포된 빌드가 전부 버려진다** — 반드시 새 빌드와 함께 바꾼다.
2. **통일 전까지는 CI가 iOS 백필까지 하게 한다.** `eas-update.yml`에 `1.0.0` 지문으로
   iOS를 한 번 더 발행하는 단계를 추가하고, 통일 시점에 그 단계를 지운다.
3. **`architecture.md` 2.1에 "플랫폼별 값이 갈라진 동안의 발행 절차"를 명시한다.**
   지금은 이 지식이 커밋 메시지와 개인 메모에만 있다.

## 완료 조건

- Given `frontend/` 변경이 main에 머지된다 / When CI가 끝난다 / Then **iOS·Android 양쪽이** 그 업데이트를 받을 수 있다(사람이 백필하지 않는다)
- Given 새 빌드가 나간다 / When 두 플랫폼의 `Runtime Version`을 `eas build:view`로 본다 / Then 같은 값이다
- Given `architecture.md` 2.1 / When 발행 절차를 찾는다 / Then 플랫폼 분기 상황의 절차가 적혀 있다

## 진행 기록 (2026-09-08 — 요청 2·3 완료, 요청 1은 새 빌드 대기)

| 요청 | 상태 | 내용 |
|---|---|---|
| 1. 양 플랫폼 runtimeVersion 통일 | **대기** | **새 빌드가 있어야 한다.** 지금 문자열을 바꾸면 배포된 빌드가 전부 버려진다 |
| 2. 통일 전까지 CI가 iOS 백필 | ✅ | `eas-update.yml`에 "iOS 백필 발행 (레거시 지문)" 단계 추가 |
| 3. `architecture.md` 2.1에 절차 명시 | ✅ | CI 백필 동작·삭제 조건·번들 확인 방법 추가 |

### 요청 2 구현 방식

`eas update`에 `runtimeVersion`을 넘기는 플래그가 없다(CLI 확인 2026-09-08). 그래서
`app.json`을 레거시 지문(`1.0.0`)으로 바꿔 `--platform ios`로 한 번 더 발행하고
`git checkout -- app.json`으로 되돌린다. 러너가 일회용이라 되돌림 실패의 파급도 없다.

- 채널은 앞 단계와 같은 값을 쓴다(`dev`→`preview`, `main`→`production`)
- `EXPO_PUBLIC_API_BASE_URL`을 앞 단계와 **같은 값으로** 다시 준다 — 어긋나면 iOS
  번들만 다른 서버를 본다
- `--environment`는 앞 단계와 마찬가지로 넘기지 않는다. 현재 CI에서 그 형태가
  동작하는 것이 확인돼 있고(2026-09-08 실행 성공), 넘기면 EAS 호스팅 환경변수가
  로드되어 위에서 명시한 값과 어긋날 여지가 생긴다

**살아 있는 iOS 빌드는 production 채널의 vc=3 하나뿐이다**(`build:list` 확인). iOS
preview 빌드는 없으므로 `dev` merge의 백필은 현재 수신자가 없지만, 나중에 iOS 내부
테스트 빌드가 생겨도 같은 함정을 안 밟도록 채널을 가리지 않고 발행한다.

### 요청 1이 남은 이유와 처리 시점

**runtimeVersion 문자열을 바꾸는 순간 이미 배포된 빌드는 업데이트를 못 받는다.**
그래서 새 빌드와 반드시 같이 가야 한다. 다음 빌드에서 함께 처리한다.

- 양 플랫폼 `runtimeVersion`을 **앱 버전과 무관한 문자열**로 통일(`"1"` 같은)
- 같은 빌드에서 `share-p1-activation-next-build`(빌드 타임 상수)도 함께 켠다
- 통일이 확인되면 `eas-update.yml`의 "iOS 백필" 단계와
  `LEGACY_IOS_RUNTIME_VERSION`을 지우고, 이 티켓을 archive로 옮긴다
