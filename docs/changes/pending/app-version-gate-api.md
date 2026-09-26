# [문서] 스플래시 강제 업데이트 관문 API — `GET /app/version` (BE 구현 2026-09-26)

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/settings-api.md` 3장 엔드포인트 목록 · **4.6 신설** · 5장 에러 코드 표 · `features/common-error-handling.md` 9.1(또는 9.3) 표 · `features/splash.md` 7장(엔드포인트 참조) · `backend/architecture.md` 9.6(공개 라우트) |
| 요청 파트 | 문서(구현은 백엔드 `feat(be)/app-version-gate`) |
| 발행 날짜 | 2026-09-26 |
| 발견 시점 | 2026-09-26 백엔드 전수 감사(중6) — `splash.md` 4.1과 `common-error-handling.md` 2장은 "서버가 최소 지원 버전을 판정해 강제 업데이트 코드를 반환한다"고 했지만, 서버에는 로그인 전에 부를 엔드포인트도 에러 코드도 없었고 앱도 부르지 않았다 |
| 심각도 | 중 — 옛 앱을 끊어야 할 때 수단이 없다. FE 반영은 별도 티켓(스토어 빌드에 실려야 효과) |

## 계약 (FE가 이 절을 그대로 쓴다)

### `GET /app/version` — 스플래시 버전 관문

- **인증 없음.** 스플래시가 로그인 전에 부른다. 레이트 리밋은 전역 기본 한도.
- 쿼리: `app_version`(semver, 필수) · `platform`(`ios` | `android`, 필수) — 4.1과 같은 검증. 형식이 틀리면 400 `VALIDATION_FAILED`.
- **판정은 서버가 한다.** 클라이언트는 버전을 비교하지 않는다.

**200** — `app_version >= min_supported_version`

```json
{
  "latest_version": "1.1.0",
  "min_supported_version": "1.0.0",
  "update_available": false
}
```
4.1의 `version` 블록과 같은 형태. `update_available = app_version < latest_version`(권장 안내, 닫기 가능).

**426 `APP_UPDATE_REQUIRED`** — `app_version < min_supported_version`

```json
{
  "error_code": "APP_UPDATE_REQUIRED",
  "message": "새 버전으로 업데이트해 주세요",
  "retryable": false,
  "retry_after_sec": null,
  "details": { "min_supported_version": "1.0.0", "latest_version": "1.1.0" },
  "trace_id": "…"
}
```
클라이언트 동작: 강제 업데이트 화면(닫기 불가, 스토어 이동만 — `splash.md` 4.1). 이후 로직 진행 안 함.

**fail-open**: 요청 실패(네트워크·5xx·타임아웃)에 앱을 막지 않는다(`splash.md` 7장, README 결정 39). 서버 쪽도 최소 지원 버전 설정값이 semver 형식이 아니면 차단하지 않는다(잘못된 설정으로 전원을 막지 않는다).

원천: 배포 설정 env `MIN_SUPPORTED_APP_VERSION_IOS/ANDROID` · `LATEST_APP_VERSION_IOS/ANDROID`(`domain.md` 13.3 — 테이블 아님). 운영 2026-09-26 현재 min 1.0.0 · latest 1.1.0.

### 에러 코드 표 한 행
| `APP_UPDATE_REQUIRED` | 426 | false | 강제 업데이트 화면(`splash.md`). `details.min_supported_version`·`latest_version` 동봉 |

### splash.md 7장
"버전 조회 API는 `platform` 필수" 문장에 엔드포인트 이름 `GET /app/version`(settings-api.md 4.6)을 붙인다. "30분 이상 백그라운드 뒤 복귀 시 버전 체크 재수행"도 같은 엔드포인트.

## 완료 조건
- Given settings-api.md 4.6 / When 읽는다 / Then 위 200·426 계약과 fail-open 규칙이 있다
- Given 에러 코드 표 / When 읽는다 / Then `APP_UPDATE_REQUIRED` 426 행이 있다
