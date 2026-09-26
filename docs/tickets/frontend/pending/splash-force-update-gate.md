# [FE] 스플래시 강제 업데이트 관문 — `GET /app/version` 연결, 426이면 닫기 불가 업데이트 화면

| 항목 | 값 |
|---|---|
| 대상 | 스플래시 진입 흐름(`useStartScreen` 계열) · 강제 업데이트 화면(신규) · 권장 안내 · `shared/api` 버전 조회 함수 |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현(백엔드·인프라) |
| 발행 날짜 | 2026-09-26 |
| 시작 날짜 | 2026-09-26 |
| 기한 | 2026-09-29 (Medium — 3일) |
| 선행 | 티켓 선행 없음. BE API는 PR #769로 dev 머지 완료. **운영 반영은 다음 `dev → main` 릴리즈** — 그 전에는 개발계(api-dev)에서만 붙여 볼 수 있다. **티켓이 아닌 선행**: runtime 13 스토어 빌드(담당 이주호 / 상태 미확인) — 이 빌드에 실려야 그 뒤 버전부터 관문이 먹는다. OTA로는 닿지 않는다 |
| Jira | [KAN-99](https://runtime364.atlassian.net/browse/KAN-99) (담당: 이주호) |
| 발견 시점 | 2026-09-26 백엔드 전수 감사(중6) — `splash.md` 4.1·`common-error-handling.md` 2장이 정한 "서버가 판정해 강제 업데이트 코드 반환"이 서버·앱 어디에도 없었다. 이전 티켓 처리 기록에 "따로 다룬다"고만 있고 티켓이 없었다 |
| 근거 문서 | `features/splash.md` 4.1(처리 1단계)·2장(30분 복귀 재수행)·7장(fail-open) · `features/common-error-handling.md` 2장 · `features/README.md` 결정 39 · `changes/pending/app-version-gate-api.md`(서버 계약 원문) |
| 중요도 | **Medium** — 옛 앱을 끊어야 할 때 쓰는 유일한 수단. 다음 스토어 빌드를 놓치면 그다음 빌드까지 밀린다 |

## 배경

옛 앱 버전을 강제로 올리게 할 방법이 지금은 없다. 서버 API 호환을 깨야 하는 날이 오면 옛 앱이 깨진 채 도는 것을 막을 수 없다. 서버 쪽은 2026-09-26에 준비했고, 이 티켓은 앱 쪽이다.

## 서버 계약 (원문 `changes/pending/app-version-gate-api.md`)

`GET /app/version?app_version=<semver>&platform=ios|android` — **인증 없음**, 전역 레이트 리밋만

| 응답 | 의미 | 앱 동작 |
|---|---|---|
| **200** `{ latest_version, min_supported_version, update_available }` | 통과. 설정 4.1의 `version` 블록과 같은 형태 | `update_available`이면 권장 안내(닫기 가능), 닫으면 다음 단계 |
| **426** `APP_UPDATE_REQUIRED` — `{ error_code, message, retryable:false, details:{ min_supported_version, latest_version } }` | 최소 지원 버전 미만 | 강제 업데이트 화면. 닫기 불가·뒤로가기 무효, 버튼은 스토어 이동만. **이후 로직 진행 안 함** |
| 실패(네트워크·5xx·타임아웃) | 판정 불가 | **막지 않는다**(fail-open — README 결정 39). 마지막 성공 응답 캐시가 있으면 그것으로 판정, 없으면 통과 |

- **비교는 서버가 한다.** 앱에 semver 비교 코드를 두지 않는다(공통 원칙 "판정은 서버").
- 운영 현재 값: 최소 1.0.0 · 최신 1.1.0 — 지금은 아무 앱도 막히지 않는다.

## 할 일

1. 스플래시 **첫 단계**에서 호출 — 세션 복원·온보딩 분기보다 먼저(`splash.md` 4.1 순서). 입력은 `APP_VERSION`(`shared/lib/app-version.ts`)과 플랫폼.
2. 426 → 강제 업데이트 화면. 카피 확정값이 uiux에 없으면 제목 "새 버전으로 업데이트해 주세요" · 보조 "이 버전은 더 이상 지원되지 않아요" · 버튼 "업데이트" (iOS App Store / Play 스토어 링크). 접근성: 화면 진입 시 제목 낭독, 버튼 44pt.
3. 200 + `update_available` → 권장 안내(닫기 가능). 이미 설정 화면에 배지가 있으니 안내 형태는 가볍게(시트 또는 배너).
4. 타임아웃 3초. 실패는 통과. `warn` 로그만.
5. 백그라운드 30분 이상 뒤 포그라운드 복귀 시 버전 체크만 재수행(`splash.md` 2장).
6. 설정 화면 배지는 종전대로 `GET /users/me/settings`의 `version`을 쓴다 — 건드리지 않는다.
7. 개발계 확인: 박준현이 개발계 `MIN_SUPPORTED_APP_VERSION_*`을 앱보다 높게 잠깐 올려 주면 관문이 뜨는지 본 뒤 되돌린다.

## 범위 밖
- 점검 공지(maintenance) 화면 — 계약 없음, 별건.
- 서버 코드 — #769로 끝.

## 완료 조건
- Given 서버 최소 지원 버전이 앱 버전보다 높다 / When 앱을 켠다 / Then 업데이트 화면이 뜨고 뒤로가기로 빠져나갈 수 없으며 스토어로만 이동한다
- Given 최소 이상·최신 미만 / When 앱을 켠다 / Then 권장 안내가 뜨고 닫으면 정상 진입한다
- Given 최신 버전 / When 앱을 켠다 / Then 아무 안내 없이 진입한다
- Given API 응답 없음 또는 5xx / When 앱을 켠다 / Then 차단 없이 정상 진입한다
- Given 개발계에서 최소 버전을 잠깐 올림 / When 개발계 앱 실행 / Then 관문이 뜬다(확인 뒤 되돌림)
- Given runtime 13 스토어 빌드 / When 빌드 내용을 본다 / Then 이 화면이 포함돼 있다

## 처리 기록

- 2026-09-26 발행. Jira KAN-99(담당 이주호·FE, Medium, 기한 09-29). BE는 같은 날 #769.
