# 발행 콘솔 이중 로그인 제거 — 파이프라인 SSO 도입

| 항목 | 값 |
|---|---|
| 발행 날짜 | 2026-09-03 |
| 발행자 | BE (feat(be)/pipeline-sso 브랜치) |
| 대상 문서 | `features/admin.md` 2장 · `spec/api/auth-api.md`(또는 신설될 admin-api.md) |
| 관련 코드 | `backend/src/modules/auth/`(pipeline-login) · `pipeline/apps/web/app/api/ear/sso/` · `pipeline/apps/web/app/publish/ear-connect.tsx` |

## 배경

발행 섹션(`/publish`, 파이프라인 웹에 병합)은 Supabase 로그인(팀원) 후 제품 관리 API를 쓰기 위해
구글 GIS로 **한 번 더** 로그인해야 했다. 운영자가 매번 두 번 로그인하는 마찰을 없애기 위해
서버 간 신뢰로 통합했다: 파이프라인 웹 서버가 Supabase 세션의 이메일을 공유 비밀
(`EAR_SSO_SECRET` = 제품 `PIPELINE_SSO_SECRET`)로 서명한 60초짜리 HS256 어서션으로 만들어
제품 `/auth/pipeline-login`과 토큰을 교환한다. 브라우저는 비밀을 모르고 결과 토큰만 받는다.

## admin.md 2장과의 관계 — "인증 경로를 두 벌 만들지 않는다"

admin.md 2장은 "관리자 계정은 별도 인증 체계를 두지 않는다"고 규정한다. 이 SSO는 **계정
체계가 아니라 로그인 수단**이다: 계정은 여전히 일반 소셜 가입으로 만들어지고, 승격은 DB에서
사람이 하며(`users.role`), 판정도 그대로 제품 JWT가 한다. 어서션 교환은 "이미 존재하는
관리자 계정"에만 세션을 내주고(비관리자·미존재 이메일은 403), 아이디/비밀번호 같은 새 자격
증명을 만들지 않는다. 다만 로그인 경로가 하나 늘어난 것은 사실이므로 2장에 예외로 명시해 달라.

## 수정 요청

### 1. `features/admin.md` 2장

- "접근" 절에 추가: 발행 콘솔(파이프라인 웹 `/publish`)은 **파이프라인 SSO**로 접근한다 —
  Supabase 팀원 로그인 후, 같은 이메일의 제품 관리자 계정으로 자동 연결. 별도 로그인 없음.
- 전제: 운영자의 **Supabase 계정 이메일 == 제품 관리자 계정(users) 이메일**. 다르면 연결 실패
  카드가 뜬다(승격/이메일 정정 후 재시도).

### 2. auth 계약 — `POST /auth/pipeline-login`

- 요청: `{ assertion: string(HS256 JWT, typ=pipeline_sso, email, exp≤60s), device_id: string }`
- 200: `{ access_token, refresh_token, access_token_expires_at }` (일반 세션과 동일 — 갱신·로그아웃 공유)
- 401 `AUTH_PROVIDER_TOKEN_INVALID`: 서명·만료·typ 불일치
- 403 `FORBIDDEN`: 해당 이메일의 관리자 계정 없음 (비관리자 포함 — 최소 권한)
- 503 `AUTH_PROVIDER_UNAVAILABLE`: 서버에 `PIPELINE_SSO_SECRET` 미설정
- 키 운영: `PIPELINE_SSO_SECRET`(제품) == `EAR_SSO_SECRET`(파이프라인 웹), 32자 이상,
  `JWT_SECRET`과 다른 값. GIS 웹 클라이언트 ID는 발행 콘솔 용도로는 더 이상 쓰지 않는다
  (서버 `GOOGLE_WEB_CLIENT_ID`는 앱 구글 로그인용으로 유지).

## 완료 조건 (Given/When/Then)

- Given 문서 담당자가 admin.md 2장을 열었을 때, When 통합 반영이 끝나면,
  Then 발행 콘솔 접근 방법에 파이프라인 SSO(이메일 매칭 전제 포함)가 기술되어 있다.
- Given auth 계약 문서를 열었을 때, When 반영이 끝나면, Then `POST /auth/pipeline-login`의
  요청·응답·에러 코드 표가 위 내용과 일치한다.

---

## 처리 기록

| 항목 | 값 |
|---|---|
| 반영 날짜 | 2026-09-03 |
| 상태 | **완료 — archive** |

반영 위치:

- **`features/admin.md` 2장** — 파이프라인 SSO를 예외로 명시. "계정 체계가 아니라 로그인 수단"이라는 근거와 이메일 일치 전제 포함
- **`spec/api/auth-api.md`** — 3장 목록에 12번 추가, **4.12**에 상세(요청·응답·에러 3종·키 운영). 앱 클라이언트가 부르지 않는 경로임을 설계 메모에 명시

코드 대조 결과 요청서와 계약이 정확히 일치했다(`auth.controller.ts` · `pipeline-login-request.dto.ts` · `token.service.ts#verifyPipelineAssertion`). 보탠 것은 `assertion` 2000자 / `device_id` 200자 상한과, **`PIPELINE_SSO_SECRET`이 선택 환경변수라 미설정 시 서버는 정상 기동하고 이 경로만 503으로 닫힌다**는 사실이다(`env.validation.ts`).
