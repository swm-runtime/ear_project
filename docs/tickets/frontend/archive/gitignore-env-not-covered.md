# [FE] `.gitignore`가 `.env`를 막지 않는다 — 공개 저장소

| 항목 | 값 |
|---|---|
| 대상 | `frontend/.gitignore` 33~34행 |
| 요청 파트 | 프론트엔드 |
| 발행 날짜 | 2026-08-26 |
| 발견 시점 | 2026-08-26 `backend/.env.example`에 실값이 올라가 있는 것을 점검하다 저장소 전체의 비밀값 취급을 훑어보며 발견 |
| 근거 문서 | `backend/architecture.md` 9.5(비밀값은 환경 변수로 주입, `.env`는 커밋하지 않는다) |
| 심각도 | **중** — 지금 새는 값은 없다(`git ls-files`에 `.env` 없음). 다만 **저장소가 public이라 한 번 올라가면 되돌릴 수 없다.** 예방 비용이 한 줄이다 |
| 상태 | pending |

## 문제

`frontend/.gitignore`가 `.env*.local`만 무시한다.

```
# local env files
.env*.local
```

**`frontend/.env`, `frontend/.env.development`은 걸리지 않는다.** Expo/RN 프로젝트에서 `.env`는 흔한 이름이라, 누군가 로컬 설정을 그 이름으로 만들면 `git add .` 한 번에 올라간다.

`backend/.gitignore`는 `.env`를 포함해 다섯 줄로 막고 있다 — **두 파트의 기준이 다르다.**

## 요청 내용

1. **`frontend/.gitignore`에 `.env`를 추가한다.** `backend/.gitignore` 37~42행과 같은 수준으로 맞추는 것이 낫다.
2. **이미 올라간 것이 없는지 확인한다** — `git ls-files | grep -i "\.env"`. 발행 시점 확인으로는 `.env.example` 외에 없다.
3. **범위 밖** — `app.json`의 `kakaoNativeAppKey`. 카카오 네이티브 앱 키는 **앱 바이너리에 실려 배포되는 클라이언트 키**라 저장소에서 감춘다고 비밀이 되지 않는다(어드민 키·REST API 키와 다르다). 지금 자리에 두는 것이 맞다.

## 완료 조건

- Given `frontend/.gitignore` / When 확인한다 / Then `.env`가 무시 목록에 있다
- Given `frontend/` 아래에 `.env` 파일을 만든다 / When `git status`를 본다 / Then 추적 대상으로 뜨지 않는다
- Given 저장소 전체 / When `git ls-files | grep -i "\.env"`를 실행한다 / Then `.env.example` 계열만 나온다

---

## 처리 기록 (반영 날짜 2026-08-27 — 브랜치 `feat(fe)/apple-web-oauth`)

- `frontend/.gitignore`의 env 블록을 backend와 같은 기준으로 확장 — `.env` · `.env*.local` · `.env.development` · `.env.test` · `.env.production`.
- 완료 조건 검증: `git ls-files | grep -i "\.env"` → `backend/.env.example`뿐 / `frontend/.env`를 만들어 `git status` → 추적 대상으로 뜨지 않음(확인 후 삭제).
