# [BE] contents.source_name 상한 100자 → 500자 — 참고 자료 발행처를 전부 적어야 한다

| 항목 | 값 |
|---|---|
| 대상 | `upload-content-request.dto.ts` · `republish-content-request.dto.ts` (`@MaxLength(100)`) · `content.entity.ts` + 마이그레이션 (`source_name varchar(100)`) · `docs/spec/api/admin-api.md` · `docs/backend/domain.md` |
| 요청 파트 | 백엔드 |
| 요청자 | 박수헌 |
| 발행 날짜 | 2026-09-10 |
| Jira | [KAN-52](https://runtime364.atlassian.net/browse/KAN-52) |
| 발견 시점 | 2026-09-10 파이프라인 콘솔에서 AI 생성 에피소드를 제품에 발행하다가 — `source_name must be shorter than or equal to 100 characters (필드: source_name)` |
| 심각도 | **중** — 소스가 5~6건인 에피소드는 발행이 막힌다. 발행자가 손으로 줄이면 우회되지만, 줄이면 "참고한 자료를 전부 적는다"는 결정과 어긋난다 |
| 상태 | 대기 |

## 요지 (Jira 본문용)

AI 생성 콘텐츠의 `source_name`은 "참고한 자료: 발행처1, 발행처2, …"로 참고 소스의 발행처를 **전부** 적기로 했다(`features/admin.md` 3.1 — "복수 가능", 줄여 쓰지 않기로 한 결정). 그런데 업로드·재발행 DTO의 `@MaxLength(100)`과 `contents.source_name varchar(100)`이 그보다 짧아, 소스 5~6건짜리 에피소드는 발행이 거부된다. 이 상한은 `admin-api.md`·`domain.md` 어디에도 적혀 있지 않아 부딪혀야 알게 된다.

요청: **상한을 500자로 올린다.** DTO 두 곳(업로드·재발행)의 `@MaxLength`를 500으로, 컬럼을 `varchar(500)`으로 넓히는 마이그레이션을 추가하고, `admin-api.md` 4.6 payload 표와 `domain.md` 5.1 contents 표에 상한을 명시한다. 파트너 콘텐츠의 `source_name`(파트너명)도 같은 컬럼이라 함께 넓어진다 — 문제 없다.

## 문제

- 파이프라인 콘솔(업로드 화면)은 에피소드 소스의 발행처를 중복 제거해 `참고한 자료: A, B, C, …`로 미리 채운다. 발행처 이름이 영문 매체명이면 한 곳에 15~25자라, 6건이면 100자를 넘는다.
- 서버는 DTO 검증에서 400으로 거부한다. 컬럼도 100자라 DTO만 올리면 DB에서 다시 막힌다.
- 소스 전수는 `content_sources` 테이블에 따로 올라가므로 고지 문구는 표시용이다. 그래도 문구를 줄이면 "참고한 자료를 다 적는다"는 결정(2026-09-10 박수헌 재확인)과 어긋난다.

## 요청 내용

1. `UploadContentRequestDto`·`RepublishContentRequestDto`의 `source_name` `@MaxLength(100)` → `@MaxLength(500)`.
2. `contents.source_name` `varchar(100)` → `varchar(500)` 마이그레이션 (`ALTER COLUMN … TYPE character varying(500)`, 데이터 이동 없음).
3. `docs/spec/api/admin-api.md` 4.6 payload 필드 표에 `source_name` 상한 500자 명시. `docs/backend/domain.md` 5.1 contents 표의 `source_name`에 `varchar(500)` 명시.
4. 플레이어 상세의 출처 고지 표시는 길어질 수 있으니 줄바꿈으로 흘려도 되는지만 FE 가 확인한다(FE 몫 — 이 티켓 범위 밖, 참고).

## 완료 조건

- Given `origin = ai_generated`이고 `source_name`이 101~500자인 업로드 요청, When `POST /admin/contents`를 호출하면, Then 201로 발행되고 `contents.source_name`에 전문이 저장된다.
- Given 같은 길이의 `source_name`을 담은 재발행 요청, When `PATCH /admin/contents/:id`를 호출하면, Then 200이고 값이 갱신된다.
- Given 501자 이상의 `source_name`, When 업로드하면, Then 400 `source_name must be shorter than or equal to 500 characters`.
- Given `admin-api.md` 4.6과 `domain.md` 5.1, When 읽으면, Then `source_name`의 상한 500자가 적혀 있다.

## 처리 기록 (반영 날짜: 2026-09-10)

요청 1~3 전부 반영했다.

- DTO 두 곳(`UploadContentRequestDto`·`RepublishContentRequestDto`) `@MaxLength(500)`, `content.entity.ts` `length: 500`,
  마이그레이션 `1787100000000-WidenContentsSourceName`(`ALTER COLUMN … TYPE varchar(500)`, 데이터 이동 없음 — down은 100자 초과 행이 있으면 실패, 의도).
- `domain.md` 5.1 `source_name varchar(500)` 명시, `admin-api.md` 4.6 payload 주석에 "500자 이내" 명시.
- 검증: DTO 스펙 3건(500 통과·501 거부·재발행) + 로컬 DB 마이그레이션 100→500 확인 + 로컬 서버 실측 — 306자 업로드 201·DB 저장 306자,
  395자 재발행 200·갱신, 501자 업로드 400 `source_name must be shorter than or equal to 500 characters`.
- 요청 4(플레이어 출처 고지 줄바꿈)는 FE 몫 — 이 티켓 범위 밖.
