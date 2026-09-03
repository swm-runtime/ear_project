# [BE] API 서버 배포 — 공개 도메인·운영 환경변수 (전 파트 통합 검증의 선행)

| 항목 | 값 |
|---|---|
| 대상 | NestJS(`backend/`) 배포 환경·공개 도메인·운영 환경변수 주입 경로. 코드 변경은 거의 없고 **인프라 결정이 본체**다 |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-08-26 |
| 발견 시점 | 2026-08-26 FE 소셜 로그인 연동 완료 통지 — "백엔드 API 개발이 끝나면 남은 작업 진행" 요청을 검토하다, **API 구현이 아니라 닿을 수 있는 서버가 없는 것**이 실제 블로커임을 확인 |
| 근거 문서 | `backend/architecture.md` 9.5(환경변수 검증·CORS) · `backend/domain.md` 11.2(pepper 보관) · `spec/api/auth-api.md` 4.1 |
| 심각도 | **높음** — **프론트가 실기기에서 아무 API도 부를 수 없다.** 소셜 로그인 4종을 포함해 지금까지 구현된 전 기능의 종단 검증이 이 하나에 막혀 있다 |
| 상태 | pending |

## 문제

`backend/`에 배포 설정이 없다. `docker-compose.yml`이 전부고 `.env.example`은 전 항목이 localhost다.

```
AUDIO_URL_BASE_URL=http://localhost:3000/api/v1/audio
```

FE는 소셜 로그인 4종 SDK 연동을 마쳐 dev에 병합했고(2026-08-26, PR #63), 서버의 토큰 검증도 맞춰 끝났다(`feat(be)/social-login` — 구글 ID 토큰·카카오 `app_id`·애플 nonce hex). **양쪽 코드가 다 있는데 붙일 데가 없다.**

## 왜 지금 급한가

- **FE의 실기기 검증이 전부 막힌다.** 시뮬레이터·개발 서버로는 소셜 SDK 왕복과 실제 토큰 검증을 확인할 수 없다
- **애플 nonce 인코딩 수정의 마지막 확인이 여기 걸려 있다**(`tickets/backend/archive/apple-nonce-hash-encoding-mismatch.md` — 실기기 확인만 남겨두고 archive로 옮겼다). 서버가 없으면 그 확인을 못 한다
- 뒤로 갈수록 **검증되지 않은 채 쌓인 기능이 늘어난다**

**안드로이드 애플 로그인은 이 티켓에 막히지 않는다** — 콜백을 랜딩(Vercel)이 받도록 설계해 API 도메인 의존을 없앴다(`apple-android-web-oauth-callback.md`). 다만 그 플로우도 마지막에는 `POST /auth/social-login`을 부르므로, **종단 검증은 결국 이 티켓 뒤다.**

## 요청 내용

1. **배포 환경을 정하고 올린다** — 컨테이너 실행 환경과 관리형 PostgreSQL. 무엇을 고르든 **HTTPS 공개 도메인**이 나와야 한다.
2. **공개 도메인을 확정한다** — `earcast.co.kr`은 랜딩(Vercel)이 쓰고 있으므로 **서브도메인**(예: `api.earcast.co.kr`)이 자연스럽다. 확정 후 FE의 API base URL과 맞춘다.
3. **운영 환경변수를 주입한다.** `env.validation.ts`가 기동 시 전수 검증하므로 하나라도 빠지면 뜨지 않는다(`architecture.md` 9.5).
   - 소셜 로그인 3종: `APPLE_CLIENT_ID` · `GOOGLE_WEB_CLIENT_ID` · `KAKAO_APP_ID` (**비밀값이 아니지만 검증에 필수** — 없으면 해당 제공자 로그인이 전부 실패한다)
   - **`JWT_SECRET` · `ARCHIVE_HASH_PEPPER` · `WITHDRAWAL_HASH_PEPPER`는 시크릿 매니저에만 둔다** — 코드·설정 파일·DB·로그 어디에도 남기지 않는다(`domain.md` 11.2). 두 pepper는 **서로 다른 값**이어야 한다
   - `CORS_ORIGINS`에 `*`를 쓰지 않는다(`architecture.md` 9.5)
4. **마이그레이션 실행 경로를 정한다** — 배포 시 `migration:run`을 어느 시점에 돌릴지.
5. **범위 밖** — 랜딩(Vercel) 인프라(`share-universal-links-hosting.md`·`apple-android-web-oauth-callback.md` 소유), 오브젝트 스토리지·CDN 확정(`AUDIO_URL_BASE_URL` 주석의 미결과 함께 별건).

## 완료 조건

- Given 임의의 네트워크 / When 확정된 공개 도메인의 헬스 경로를 조회한다 / Then HTTPS로 200이 반환된다
- Given 배포된 서버 / When 기동 로그를 확인한다 / Then 환경변수 검증을 통과해 정상 기동했다
- Given FE 스탠드얼론 빌드 / When 구글·카카오·네이버로 로그인한다 / Then 세 제공자 모두 실기기에서 로그인이 성립한다
- Given FE 스탠드얼론 빌드(iOS) / When 애플로 로그인한다 / Then nonce 대조를 통과해 로그인이 성립한다 — **archive로 옮긴 nonce 티켓의 마지막 미확인 항목이 여기서 닫힌다**
- Given 배포 설정·저장소 / When pepper와 `JWT_SECRET`을 찾는다 / Then 코드·설정 파일·로그 어디에도 없고 시크릿 매니저에만 있다
- Given 운영 서버 / When `CORS_ORIGINS`를 확인한다 / Then `*`가 아니다

## 진행 기록 (2026-09-03 — 완료 조건 3개 확인, 3개 남음)

스토어 배포본으로 실기기 검증이 가능해지면서 이 티켓의 핵심 조건들이 확인됐다. **발행 당시의 블로커("프론트가 실기기에서 아무 API도 부를 수 없다")는 해소됐다.**

| 완료 조건 | 상태 |
|---|---|
| 공개 도메인 헬스 HTTPS 200 | ✅ `https://api.earcast.co.kr` 가동 |
| 환경변수 검증 통과 기동 | ✅ 정상 기동 중이며 `GOOGLE_WEB_CLIENT_ID`·`KAKAO_APP_ID` 실값 대조까지 마쳤다 |
| **구글·카카오·네이버 3종 실기기 로그인** | ✅ **2026-09-03 스토어 빌드에서 3종 모두 성립** |
| iOS 애플 로그인 nonce 대조 | ❌ 미확인 — iOS 빌드가 아직 없다 |
| pepper·`JWT_SECRET`이 시크릿 매니저에만 있다 | ⚠️ **부분** — 아래 참고 |
| `CORS_ORIGINS`가 `*`가 아니다 | ❌ 미확인 — 서버에서 확인 필요 |

**소셜 로그인 3종은 한 번 크게 막혔다가 풀렸다.** Play App Signing 재서명으로 기기의 서명 지문이 EAS 업로드 키와 달라져 구글·카카오가 실패했고(네이버는 지문을 안 봐서 정상), Play의 앱 서명 키 지문을 콘솔에 등록해 복구했다. 경위는 `tickets/frontend/pending/prod-build-env-and-eas.md` 2026-09-03 진행 기록에 있다. **서버 쪽 원인은 아니었다.**

### 시크릿 조건이 "부분"인 이유

저장소 기준으로는 통과다 — `backend/src` 전체에 `JWT_SECRET`·`ARCHIVE_HASH_PEPPER`·`WITHDRAWAL_HASH_PEPPER`의 **하드코딩된 값이 없고**, 전부 `configService.get(...)`으로만 읽는다.

다만 조건문의 *"시크릿 매니저에만 있다"* 는 아직 아니다. 실값은 EC2의 `/opt/ear/backend/.env.prod` 파일에 있다(`docs/infra/inventory.md` 32행, `runbook.md` 3장). **이것을 그대로 합격으로 볼지, AWS Secrets Manager 등으로 옮긴 뒤 닫을지는 결정이 필요하다** — 결정 전에는 이 티켓을 `archive/`로 옮기지 않는다.

### 남은 두 가지를 닫는 방법

```bash
# CORS — `*`가 아닌지
cd /opt/ear/backend && docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec -T api printenv CORS_ORIGINS
```

애플(iOS)은 iOS 빌드가 나온 뒤에만 확인할 수 있다. **다음에 집는 사람이 조사할 것은 없다 — 위 명령 하나와, 시크릿 보관 위치에 대한 결정, 그리고 iOS 빌드다.**

## 보류·미결

- **배포 대상 선택** — 팀 여건(비용·운영 부담)에 달렸다. 이 티켓은 "무엇을 고를지"를 정하지 않고 **결과 요건**(HTTPS 공개 도메인·환경변수 주입·마이그레이션 경로)만 둔다
- **오브젝트 스토리지 확정 전까지 `AUDIO_URL_BASE_URL`은 임시값**으로 둔다(`.env.example` 주석)
