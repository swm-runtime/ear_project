# Backend 작업 규칙

'이어' 백엔드(NestJS + TypeScript + PostgreSQL/TypeORM). 이 파일은 **무엇을 보고 어디까지 고칠 수 있는지**를 정한다.

## 1. 수정 범위 — 가장 먼저 지킬 것

- **수정할 수 있는 파일은 `backend/` 안의 파일뿐이다.** 프론트엔드 코드, AI 서버, 저장소 루트의 공용 설정은 어떤 경우에도 수정하지 않는다.
- `backend/` 밖은 **읽기만 한다.** 명세 확인·에러 코드 대조·스키마 확인 등 참조 목적에 한한다.
- 밖에 있는 코드·문서를 고쳐야 한다고 판단되면 **직접 고치지 않고 해당 파트 담당에게 전달한다.** 어긋남을 발견한 쪽이 아니라 소유한 쪽이 고친다.
- 근거: `docs/backend/convention.md` 2.4

## 2. 문서 수정은 반드시 먼저 물어본다

- **어떤 문서든 고치기 전에 사용자에게 확인을 받는다.** `docs/backend/` 안(`architecture.md`·`convention.md`·`domain.md`)도 예외가 아니다.
- 문서와 코드가 어긋난 것을 발견하면 **말없이 코드를 맞추지 말고 먼저 보고한다.** 어느 쪽이 맞는지는 사람이 정한다.
- 규칙이 틀렸다고 판단되면 **코드가 아니라 문서를 먼저 고친다** — 단, 위 확인을 거친 뒤에.
- `docs/spec/api/`, `docs/pages/`, `docs/prd/`는 **다른 파트가 소유한 계약 문서다.** 수정 대상이 아니라 전달 대상이다.

## 3. 커밋·push는 매번 확인을 받는다

- **커밋 전에 반드시 확인을 받는다.** 물어볼 때는 **어느 브랜치에 커밋할지**와 **무엇을 커밋할지(변경 요약)** 를 함께 제시한다. 승인 없이 커밋하지 않는다.
- **커밋 승인은 push 승인이 아니다.** 커밋을 수락받은 뒤 push에 대해 **다시 한번 확인을 받는다.**
- **지시받은 브랜치에서만 작업한다.** 다른 브랜치로 옮기거나, 다른 브랜치에 커밋·push하지 않는다. 현재 브랜치가 맞는지 커밋 전에 확인한다.
- **PR은 요청받았을 때만 만든다.** 커밋·push 승인이 PR 승인을 뜻하지 않는다.
- 커밋 자체의 형식은 `docs/backend/convention.md` 6장을 따른다 — 하나의 커밋은 하나의 목적만 담고, 본문에는 무엇이 아니라 **왜** 바꿨는지를 쓴다.

## 4. 작업별로 봐야 할 문서

| 작업 | 봐야 할 문서 |
|---|---|
| **기능 구현 (공통)** | `docs/prd/ear_root_prd.md`(왜 만드는지·FR 번호) + `docs/pages/<기능>.md`(그 기능의 동작 규칙·완료 조건) |
| **API 설계·구현** | `docs/spec/api/<기능>-api.md` — 경로·요청·응답·에러 코드의 계약 |
| **Entity·스키마** | `docs/backend/domain.md` — **스키마의 유일한 기준.** 여기에 없는 테이블·컬럼을 코드에 만들지 않는다 |
| **구조·계층·트랜잭션·보안** | `docs/backend/architecture.md` |
| **네이밍·파일 구성·DTO·테스트·로깅** | `docs/backend/convention.md` |
| **에러 처리·재시도** | `docs/pages/common-error-handling.md`(클라이언트 계약) + `architecture.md` 7장(서버가 만드는 방법) |

`docs/pages/`의 기능 문서: `auth` `onboarding` `library` `explore` `player` `paywall` `subscription` `profile` `settings` `notification` `drip-scheduling` `content-pipeline` `partner-control` `admin` `splash` `offline-download` `common-error-handling`

## 5. 규칙이 충돌할 때 우선순위

```
클라이언트 계약(docs/pages/*, docs/spec/api/*) > architecture.md > convention.md
```

**스키마만은 예외로 `domain.md`가 항상 최상위다.** 다른 문서의 데이터 모델 서술과 어긋나면 `domain.md`를 따른다.

## 6. 기능 하나를 만드는 순서

1. PRD에서 해당 **FR 번호**와 목적을 확인한다
2. `docs/pages/<기능>.md`에서 동작 규칙·예외 상황·완료 조건을 읽는다
3. `docs/spec/api/<기능>-api.md`에서 엔드포인트 계약을 확인한다 (없으면 만들지 말고 물어본다)
4. `domain.md`에서 쓸 테이블을 확인한다 — **정의가 없으면 코드를 먼저 쓰지 않고 보고한다**
5. Entity → 마이그레이션 → Repository → Service → Controller 순으로 작성한다
6. 정책 로직에는 단위 테스트를 반드시 붙인다(`convention.md` 7.2)
7. **실행해서 확인한 뒤에** 완료라고 말한다 — 빌드·테스트 통과만으로 끝내지 않는다

## 7. 개발 명령

```bash
docker compose up -d          # 로컬 PostgreSQL (5433, DB: runtime)
npm run start:dev             # 개발 서버
npm run lint / build          # 정적 검증
npm test                      # 단위 테스트
npm run test:e2e              # E2E
npm run migration:generate -- src/database/migrations/<이름>
npm run migration:run
```

`synchronize`는 어떤 환경에서도 쓰지 않는다. 스키마 변경은 마이그레이션 파일로만 한다.

## 8. 자주 틀리는 것

- 다른 모듈의 **Repository를 주입받지 않는다.** 그 모듈이 `exports`한 Service만 쓴다
- Controller는 **try/catch 하지 않는다.** 전역 Exception Filter가 변환한다
- 새 `error_code`를 만들면 `docs/pages/common-error-handling.md` 갱신이 필요하다 — 그 문서는 수정 범위 밖이므로 **기존 코드로 해결되는지 먼저 검토하고, 안 되면 보고한다**
- 응답에 Entity를 그대로 내보내지 않는다. API JSON은 **snake_case**, 내부 코드는 camelCase
- 토큰·인증 코드·이메일 원문·요청 바디를 **로그에 남기지 않는다**
