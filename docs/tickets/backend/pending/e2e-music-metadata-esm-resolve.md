# [BE] E2E 스위트 2개 실행 불가 — `music-metadata`(ESM 전용)를 Jest가 해석하지 못함

| 항목 | 값 |
|---|---|
| 대상 | `backend/test/jest-e2e.json`(또는 `src/modules/admin/audio-probe.ts`) — E2E 환경에서의 `music-metadata` 해석 |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-09-01 |
| 발견 시점 | 2026-09-01 dev 통합 테스트(PR #77 머지 후 `npm run test:e2e`) — `onboarding`·`library` E2E가 "Test suite failed to run" |
| 근거 문서 | `backend/convention.md` 7.2(E2E는 PRD 9.2 핵심 시나리오 우선) · `architecture.md` 2장(라이브러리 도입 원칙) |
| 심각도 | **중** — 단위 테스트 460건·빌드·실기동은 정상이고 운영 동작에는 영향이 없다. 다만 **E2E 2/3 스위트가 통째로 안 돌아** 온보딩·라이브러리 시나리오의 회귀 검증이 빠져 있다 |
| 상태 | pending |

## 문제

```
Cannot find module 'music-metadata' from '../src/modules/admin/audio-probe.ts'
  admin/audio-probe.ts → admin-content.service.ts → admin.controller.ts → admin.module.ts → app.module.ts → *.e2e-spec.ts
```

- `music-metadata@11.15.0`은 `"type": "module"`이고 `exports`에 `import`·`module-sync` 조건만 있다(`require` 진입점 없음).
- **런타임은 문제없다** — Node 24의 `require(esm)`이 `module-sync`로 읽어 `nest build`·`start:dev` 모두 정상.
- **Jest(CommonJS + ts-jest)는 `require` 조건이 없어 해석에 실패한다.** `AppModule`을 통째로 올리는 E2E는 admin 모듈을 거치므로 전부 걸린다(`error-response` E2E는 AppModule을 올리지 않아 무관).
- 기원: `cbf9e2a feat(be): add admin upload api and audit logs`(2026-08-30, infra 브랜치). 추천 고도화 PR(#70·#77)과 무관하며 그 이전부터 dev에 있었다.

## 수정안 (테스트 종료 후 반영)

1. **(권장) E2E 전용 모듈 매핑** — `test/jest-e2e.json`의 `moduleNameMapper`에 `"^music-metadata$": "<rootDir>/__mocks__/music-metadata.ts"`를 추가하고, `parseBuffer`가 고정 `duration`을 돌려주는 수동 mock을 둔다. E2E는 관리자 업로드(오디오 길이 추출)를 검증하지 않으므로 mock이 검증 범위를 줄이지 않는다. 운영 코드 무변경.
2. (대안) `audio-probe.ts`에서 `await import('music-metadata')`로 동적 로드 — 운영 코드가 바뀌고 ts-jest의 ESM 동적 import 처리를 별도로 맞춰야 해 1안보다 비용이 크다.
3. (대안) `ts-jest` ESM 모드 전환 — 전 테스트 설정에 파급. 이 한 패키지 때문에 할 일이 아니다.

관리자 업로드의 길이 추출 자체를 검증하려면 E2E가 아니라 `audio-probe.ts`의 단위 테스트(실 mp3 버퍼 고정 fixture)를 따로 두는 것이 맞다 — 그건 이 티켓 범위 밖.

## 완료 조건

- Given dev 최신 / When `npm run test:e2e`를 실행한다 / Then `onboarding`·`library`·`error-response` 3개 스위트가 전부 실행되어 통과한다("failed to run" 없음)
- Given 같은 상태 / When `npm run build` · `npm run start:dev`를 실행한다 / Then 관리자 업로드의 오디오 길이 추출이 이전과 동일하게 동작한다(운영 코드 무변경이면 자동 충족)
- Given `npm test`(단위) / When 실행한다 / Then 기존 460건이 그대로 통과한다

## 진행 기록

- 2026-09-01 — 발행. dev 통합 테스트 중 발견, 규칙대로 즉시 고치지 않고 기록(`CLAUDE.md` — 티켓은 테스트 종료 후 반영).
