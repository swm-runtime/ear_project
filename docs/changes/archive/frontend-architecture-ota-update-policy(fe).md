# frontend/architecture.md — OTA 업데이트(EAS Update) 운용 정책 확정(미결 해소)

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/frontend/architecture.md` 미결 사항 목록 · 2장(기술 스택 표) |
| 발행 날짜 | 2026-09-06 |
| 발견 시점 | 내부 테스트 배포 시작 후 OTA 도입(`feat(fe)/eas-update`) — 미결이던 운용 정책이 구현으로 확정됨 |
| 요청 파트 | 프론트엔드 |

## 수정 내용

### 1. 미결 사항 목록에서 "OTA 업데이트(EAS Update) 운용 정책" 항목 제거

아래 확정으로 해소됐다. (스토어 정책 확인 결과: JS·에셋 한정 OTA는 애플·구글 모두 허용 — 앱 목적을 바꾸는 변경은 금지.)

### 2. 확정 정책 기록 (2장 기술 스택 표에 행 추가 또는 배포 절)

| 영역 | 선택 | 비고 |
|---|---|---|
| OTA 업데이트 | **EAS Update** (`expo-updates`) | JS·스타일·정적 에셋만 OTA. 네이티브 변경(모듈 추가·config plugin·app.json 네이티브 설정)은 재빌드+스토어 배포 |

- **채널 = 빌드 프로파일 1:1** (`eas.json`): `development` / `preview`(내부 테스트) / `production`(스토어). dev-client는 Updates API가 돌지 않으므로 실질 수신 채널은 preview·production 둘이다.
- **배포는 CI가 한다** — `.github/workflows/eas-update.yml`: `dev` merge → preview 채널, `main` merge → production 채널 자동 발행. 팀원은 로컬 EAS CLI 없이 merge만 하면 된다. 수동 발행은 workflow_dispatch 또는 조직 멤버의 `eas update`.
- **runtimeVersion은 `fingerprint` 정책** — 네이티브 지문이 다른(비호환) 빌드에는 업데이트가 전달되지 않는다. "이 변경이 네이티브인가"를 사람이 판단하지 않아도 안전하며, 네이티브가 바뀐 merge는 OTA가 기존 빌드에 닿지 않으므로 새 빌드가 필요하다는 신호가 된다.
- **OTA 번들 env**: `EXPO_PUBLIC_API_BASE_URL`은 워크플로 env에 명시하며 `eas.json` preview/production env와 같은 값을 유지해야 한다(드리프트 시 OTA 번들이 다른 서버를 본다). mock 플래그들은 `__DEV__` 가드라 릴리스 번들에서 무관.
- 업데이트 적용 시점은 expo-updates 기본값(앱 재시작 시) — 사용자 동의 UX(`useUpdates` 훅 + 안내)는 P1 미결로 남긴다.

## 사유

내부 테스트 배포가 시작되어 "수정마다 재빌드"의 비용이 실제로 발생하기 시작했다. 특히 구글 비공개 테스트(12명×14일) 기간에는 빌드 교체 없이 수정을 전달할 수단이 필요하다. 운용 정책이 문서에 없으면 팀원이 네이티브 변경·env 드리프트의 함정을 각자 다시 배우게 된다.

## 완료 조건

- Given `docs/frontend/architecture.md` 미결 사항 목록 / When OTA 항목을 찾는다 / Then 존재하지 않는다(해소됨)
- Given 2장(또는 배포 절) / When OTA 기록을 읽는다 / Then 채널 매핑·fingerprint 정책·CI 자동 발행·재빌드 조건이 기재되어 있다
- Given `frontend` 변경이 dev에 merge된다 / When Actions를 확인한다 / Then eas-update 워크플로가 preview 채널로 발행한다

---

## 처리 기록

| 항목 | 값 |
|---|---|
| 반영 날짜 | 2026-09-07 |
| 반영 문서 | `docs/frontend/architecture.md` 2장 표 · **2.1 OTA 업데이트 운용**(신설) · 미결 사항 목록 |

- 기술 스택 표에 `OTA 업데이트 | EAS Update (expo-updates)` 행을 넣고 2.1로 연결했다.
- **2.1 절을 새로 만들었다** — 요청은 "표에 행 추가 또는 배포 절"이었는데, 채널 매핑·CI 발행·
  fingerprint·env 드리프트가 표 비고 한 칸에 들어갈 분량이 아니었다.
- 미결 사항 목록에서 "OTA 업데이트(EAS Update) 운용 정책" 줄을 제거했다.

반영 전에 문서가 주장하는 내용을 코드로 확인했다: `.github/workflows/eas-update.yml`이
`branches: [dev, main]` + `workflow_dispatch`로 채널을 가르고 `EXPO_PUBLIC_API_BASE_URL`을
번들에 박는다(78~81행). `app.json:119`의 `runtimeVersion.policy = "fingerprint"`도 실재한다.

완료 조건 3개 중 1·2 충족. 3(`dev` merge 시 워크플로가 preview 채널로 발행)은 다음 merge에서
Actions 로그로 확인한다 — 문서 반영과 무관한 동작 확인이라 이 문서를 붙잡아 두지 않는다.
