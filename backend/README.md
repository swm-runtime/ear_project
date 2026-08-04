# 이어 Backend

NestJS + TypeScript + PostgreSQL(TypeORM) 기반 API 서버.

기준 문서 — 코드보다 문서가 우선이다. 충돌하면 문서를 먼저 고친다.

- [`docs/backend/architecture.md`](../docs/backend/architecture.md) — 구조·계층 책임·트랜잭션·보안
- [`docs/backend/convention.md`](../docs/backend/convention.md) — 네이밍·파일 구성·DTO·API·테스트·로깅 규칙
- [`docs/backend/domain.md`](../docs/backend/domain.md) — 스키마의 유일한 기준 (Entity 작성 전 필독)

## 시작하기

```bash
cp .env.example .env      # 로컬 값 채우기. .env는 커밋하지 않는다
docker compose up -d      # 로컬 PostgreSQL
npm install
npm run start:dev
```

환경 변수는 부팅 시 검증한다. 누락되면 기본값으로 넘어가지 않고 **기동에 실패한다**(architecture.md 9.5).

확인: `GET http://localhost:3000/api/v1/health` → `{"status":"ok"}`

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run start:dev` | 개발 서버(watch) |
| `npm run build` | 빌드 |
| `npm test` | 단위 테스트 (대상 파일 옆 `*.spec.ts`) |
| `npm run test:e2e` | E2E 테스트 (`test/*.e2e-spec.ts`) |
| `npm run lint` | ESLint + 자동 수정 |
| `npm run migration:generate -- src/database/migrations/<이름>` | Entity 변경분으로 마이그레이션 생성 |
| `npm run migration:run` / `migration:revert` / `migration:show` | 마이그레이션 적용·되돌리기·확인 |

`synchronize`는 어떤 환경에서도 쓰지 않는다. 스키마 변경은 마이그레이션 파일로만 관리한다.

## 구조

```
src/
├── main.ts                  # helmet·CORS·전역 prefix(/api/v1)·ValidationPipe
├── app.module.ts            # 최상위 조립만 (Controller·Service 금지)
├── config/                  # 환경 변수 스키마 검증
├── common/                  # 도메인 지식 없는 횡단 코드
│   ├── exceptions/          # BusinessException 계층 · ErrorCode enum
│   ├── filters/             # 전역 Exception Filter (에러 응답 규격 변환)
│   ├── interceptors/        # 요청 로깅
│   ├── middlewares/         # trace_id 발급
│   └── utils/               # 순수 함수
├── database/                # DataSource · 마이그레이션
└── modules/                 # 도메인 모듈 (Entity 소유권 단위)
```

- 절대 경로 alias `@/*` → `src/*`. `../../../`은 쓰지 않는다.
- 모듈 간에는 `exports`된 것만 import 한다.
- 이 저장소에서 백엔드 작업은 `backend/` 안의 파일만 수정한다(convention.md 2.4).
