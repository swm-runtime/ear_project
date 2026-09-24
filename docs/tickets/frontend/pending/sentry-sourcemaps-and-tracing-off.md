# [FE] Sentry 구조 변경 반영 — 성능 추적 키 제거 + 소스맵 업로드 켜기(빌드·OTA)

| 항목 | 값 |
|---|---|
| 대상 | `frontend/src/shared/monitoring/sentry.ts` · `frontend/eas.json` · `.github/workflows/eas-update.yml` |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현(백엔드·인프라) |
| 발행 날짜 | 2026-09-24 |
| 시작 날짜 | 2026-09-24 |
| 기한 | 2026-09-27 (Medium — 3일) |
| 선행 | 없음. **이 티켓이 KAN-92(Sentry 도입)를 막는다** — 완료 조건 2(스택이 TS 원본으로 풀림)가 이것 때문에 열려 있다 |
| Jira | [KAN-95](https://runtime364.atlassian.net/browse/KAN-95) |
| 발견 시점 | 2026-09-23 개발계 부하 테스트(`backend/load-test/results/2026-09-23-dev-onboarding/REPORT.md` 2-3) + 같은 날 build 11 크래시 테스트 이벤트(`ab80549b`) |
| 심각도 | 중 — 앱 크래시가 오면 "SettingsScreen 어딘가"까지만 보인다. 성능 추적 키는 폰에서 불필요한 계측을 돌린다 |

## 배경 — Sentry 구조가 바뀌었다

2026-09-23 운영과 같은 사양의 개발계에서 부하를 재다가 **Sentry 성능 추적(tracing)이 API CPU 를 1.5~1.8배 쓰는 것**을 확인했다(온보딩 가입 분당 600명: Sentry 없음 45~54% ↔ `tracesSampleRate: 0` 70~93% ↔ `0.5` 100~140%). 원인은 `tracesSampleRate` 에 **0 을 넘기면 "끔"이 아니라 "켜되 표본 0"** 이라 SDK 가 계측을 전부 등록하는 것이다. 서버는 PR #666(KAN-93)으로 고쳤고, **팀 결정(2026-09-23): 성능 추적은 운영·개발계·앱 전부 끈다.** 성능은 어드민 서버 상태 그래프로 본다. Sentry 는 에러 수집 전용이다(`docs/backend/architecture.md` 7.6).

앱도 같은 SDK 계열(`@sentry/react-native`)이라 같은 함정이 있고, 별개로 build 11 크래시 테스트 이벤트에서 **스택이 `main.jsbundle:1:1640140` 로만 보였다 — 소스맵이 안 올라가고 있다.**

## 고칠 것 — 파일·줄 단위

### 1. `frontend/src/shared/monitoring/sentry.ts` — `tracesSampleRate: 0` 줄 삭제

```ts
    enableAutoPerformanceTracing: false,
    tracesSampleRate: 0,            // ← 이 줄 삭제
```

`enableAutoPerformanceTracing: false` 는 남긴다. 키가 있으면 SDK 가 트레이싱 켜짐으로 보고 트레이스 컨텍스트·전파를 돌린다(이벤트에 Trace ID 가 붙어 있던 이유). 서버와 같은 규칙 — **끄려면 키가 없어야 한다.** KAN-92 본문에 `tracesSampleRate: 0` 으로 적어 준 것은 발행자 실수다.

### 2. `frontend/eas.json` — `SENTRY_DISABLE_AUTO_UPLOAD` 두 줄 삭제 (36행 `preview` · 66행 `production`)

토큰 받기 전(PR #657)에 넣은 값이라 지금은 EAS 빌드 때 소스맵 업로드를 막고만 있다. `preview-store` 는 `preview` 를 상속하므로 iOS 개발계 빌드도 같이 막혀 있었다. 두 줄을 지우면 Expo 플러그인이 빌드 후 `SENTRY_AUTH_TOKEN`(EAS secret, 등록 완료)으로 올린다.

### 3. `.github/workflows/eas-update.yml` — OTA 발행 뒤 소스맵 업로드 단계 추가

이벤트는 OTA 번들에서 났다(`is_embedded_launch: false`, `update_id 01a0ce25…`). OTA 는 EAS 빌드가 아니라 이 워크플로가 내보내므로 2번만 고치면 dev 머지마다 나가는 번들은 계속 안 풀린다. "OTA 발행" 단계(82행) 뒤에:

```yaml
      - name: Sentry 소스맵 업로드
        working-directory: frontend
        env:
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
        run: npx sentry-expo-upload-sourcemaps dist
```

GitHub secret `SENTRY_AUTH_TOKEN` 은 EAS 에 넣은 것과 같은 값(juyear 에게 이미 받은 토큰). **Jira·저장소에 값을 적지 않는다.**

### 4. 확인

빌드 한 번(iOS 개발계) + dev 머지 OTA 한 번 → 설정 > 크래시 테스트 → sentry.io `runtime-gw/ear-app` 이슈 스택에 `DevDiagnosticsRows.tsx` 같은 **파일명·줄 번호**가 보이면 끝. 이벤트에 Trace ID 가 붙지 않는 것도 함께 본다.

## 완료 조건

- Given `sentry.ts` / When 읽는다 / Then `tracesSampleRate` 키가 없다
- Given `eas.json` / When 읽는다 / Then `SENTRY_DISABLE_AUTO_UPLOAD` 가 없다
- Given dev 머지로 OTA 가 나간다 / When 워크플로 로그를 본다 / Then 소스맵 업로드 단계가 성공한다
- Given 새 빌드·OTA 에서 크래시 테스트 / When Sentry 이슈를 연다 / Then 스택 프레임에 `.tsx` 파일명·줄 번호가 보이고 Trace ID 가 없다
- Given 위 통과 / When KAN-92 를 본다 / Then 완료 조건 2 가 해소돼 완료로 넘길 수 있다

끝나면 이 파일을 `archive/` 로 옮기고(처리 기록·반영 날짜) KAN-95 를 완료로. KAN-92 도 같은 시점에 닫힌다.

## 처리 기록

- 2026-09-24 22:00 (효헌이): 1·2·3 반영 — `sentry.ts` 의 `tracesSampleRate` 키 삭제, `eas.json` 의 `SENTRY_DISABLE_AUTO_UPLOAD` 두 줄 삭제, `eas-update.yml` 에 "Sentry 소스맵 업로드" 단계 추가(`npx sentry-expo-upload-sourcemaps dist`). **GitHub secret `SENTRY_AUTH_TOKEN` 이 아직 없어** 단계는 경고만 남기고 건너뛴다(발행은 막지 않는다) — 등록은 사람 손(EAS 와 같은 토큰). 등록 뒤 다음 dev 머지 OTA 부터 소스맵이 올라간다. EAS 빌드 쪽은 rt 8 빌드(KAN-94 와 같은 빌드, 2026-09-24 21:45 이후)부터 토큰으로 올라간다.
- 남은 것: secret 등록(사람 손) → 다음 OTA 로그에서 업로드 단계 성공 확인 → 크래시 테스트 스택에 `.tsx` 파일명·줄 번호 + Trace ID 없음 확인 → archive + KAN-95·KAN-92 완료.
