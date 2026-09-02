# frontend/architecture.md — 소셜 로그인 SDK 확정(미결 해소) 반영

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/frontend/architecture.md` 2장(기술 스택 표) · 미결 사항 목록 |
| 발행 날짜 | 2026-08-26 |
| 발견 시점 | 소셜 로그인 4종 SDK 연동(`feat(fe)/social-login`) — 미결이던 SDK 선정이 구현으로 확정됨 |
| 요청 파트 | 프론트엔드 |

## 수정 내용

### 1. 미결 사항 목록에서 "소셜 로그인 SDK 확정" 항목 제거

미결 사항의 "소셜 로그인 SDK 확정(카카오·네이버 커뮤니티 모듈 버전·유지보수 상태 확인)"은 아래 확정으로 해소됐다.

### 2. 2장 기술 스택 표 — 소셜 로그인 행 추가(또는 플랫폼 연동 행 구체화)

| 영역 | 선택 | 비고 |
|---|---|---|
| 소셜 로그인 | `@react-native-google-signin/google-signin` 16.x · `@react-native-kakao/core`+`user` 2.4.x · `@react-native-seoul/naver-login` 5.x · `expo-apple-authentication` | 전부 config plugin 기반(prebuild 주입). Expo Go에는 네이티브 모듈이 없어 **dev client에서만 실동작** — Expo Go 개발은 provider mock(`EXPO_PUBLIC_PROVIDER_AUTH` 미설정)으로 진행한다 |

추가 기록 사항:

- **앱 키 관리 위치 확정**: 구글 웹/iOS 클라이언트 ID·카카오 네이티브 앱 키·네이버 클라이언트 키/시크릿/URL scheme은 `app.json` `extra.socialAuth`(런타임, expo-constants로 읽음)와 각 config plugin 옵션(빌드타임)에 둔다 — 9.1 "배포 불가피한 앱 키만 app config" 원칙의 적용 사례.
- **네이버 클라이언트 시크릿은 SDK 구조상 앱 탑재가 불가피하다**(SDK `initialize()` 필수 인자). 9.1의 "서버 시크릿은 클라이언트로 내리지 않는다"의 예외가 아니라, 네이버가 앱 배포를 전제로 발급하는 키라는 성격을 백엔드와 합의해 기록한다.
- **애플 로그인은 iOS 전용 모듈이다.** Android의 애플 로그인(웹 OAuth 폴백)은 미결로 남긴다 — 시작 화면의 애플 버튼 노출 정책과 함께 결정 필요.

## 사유

architecture.md 미결 사항이던 SDK 선정이 `feat(fe)/social-login` 구현으로 확정됐다. 미결 목록이 해소된 항목을 계속 들고 있으면 목록의 신뢰가 깨진다. 키 관리 위치·네이버 시크릿 성격은 9.1 원칙의 해석이 걸린 사안이라 문서에 남겨야 다음 사람이 같은 판단을 반복하지 않는다.

## 완료 조건

- Given `docs/frontend/architecture.md` 미결 사항 목록을 읽는다 / When 소셜 로그인 SDK 항목을 찾는다 / Then 존재하지 않는다(해소됨)
- Given 2장 기술 스택 표를 읽는다 / When 소셜 로그인 영역을 확인한다 / Then 4종 패키지와 "Expo Go에서는 mock, dev client에서 실동작" 제약이 기재되어 있다
- Given 9.1 또는 소셜 로그인 기록을 읽는다 / When 키 관리 위치를 확인한다 / Then `app.json extra.socialAuth` + config plugin이 명시되어 있고 네이버 시크릿의 앱 탑재 합의가 기록되어 있다

---

## 처리 기록 (반영 날짜 2026-08-26 — 브랜치 `feat(fe)/social-login`, 사용자 요청으로 통합 전 반영)

- `frontend/architecture.md` 미결 사항에서 "소셜 로그인 SDK 확정" 제거 — 자리에 "Android 애플 로그인(웹 OAuth)" 미결 항목 신설(콘솔 준비 완료·콜백 방식 백엔드 협의 대기, `changes/pending/auth-api-apple-android-web-flow(fe).md` 링크)
- 2장 기술 스택 표에 소셜 로그인 행 추가 — 4종 패키지, config plugin 기반, "Expo Go=mock·dev client=실동작" 제약, 키 관리 위치, 개정 표기
- 9.1에 적용 사례 항목 추가 — `extra.socialAuth`(런타임)+plugin 옵션(빌드타임) 관리, 네이버 시크릿의 앱 탑재 불가피 성격 기록
