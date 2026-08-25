# [BE] 공유 링크 인프라 — 운영 중인 랜딩(Vercel)에 유니버설 링크 경로 추가

| 항목 | 값 |
|---|---|
| 대상 | **운영 중인 랜딩 페이지 Vercel 프로젝트**(`earcast.co.kr`) — `.well-known` 검증 파일 2종 + `/contents/:id` 스토어 리다이렉트 추가. NestJS(`backend/`)는 무변경 |
| 요청 파트 | 백엔드 (공유 설계 세션에서 발행) |
| 발행 날짜 | 2026-08-25 |
| 발견 시점 | 2026-08-25 공유 명세 작성(`docs/share-feature` — `share.md` 신설, 도메인 `earcast.co.kr` 확보 확인) |
| 근거 문서 | `features/share.md` 4.2·미결(링크 기술 방식 — 유니버설 링크/App Links로 확정 방향) · `spec/uiux/share-uiux.md` 2장(미설치 리다이렉트는 앱 화면이 아니다) · PRD FR-27·4.2(개정 2026-08-25) · README 결정 48 |
| 심각도 | **하** — P1 전제 작업. MVP에는 공유가 미노출이라 지금 막히는 것이 없다. 다만 **P1에서 공유를 켜는 시점에는 이 티켓이 선행 완료**되어 있어야 한다(링크가 성립해야 공유 텍스트를 조립할 수 있다) |
| 상태 | pending |

## 배경

공유(FR-27, P1)의 링크는 콘텐츠 상세로 연결되는 `https://earcast.co.kr/contents/:id` 형태로 확정 방향이 잡혔다(`share.md` 4.2 — 도메인 확보 확인 2026-08-25). 이 링크가 동작하려면 도메인에서 **정적 파일 3개(경로 3개)** 가 서빙되어야 한다:

1. `/.well-known/apple-app-site-association` — iOS에 "이 도메인의 링크는 이 앱이 연다"를 증명 (JSON, 확장자 없음, `Content-Type: application/json`)
2. `/.well-known/assetlinks.json` — 같은 역할의 Android App Links 검증 파일
3. `/contents/:id` — **앱 미설치 수신자**를 스토어로 보내는 리다이렉트 페이지 1장 (콘텐츠 미리보기가 있는 웹 랜딩이 아니다 — PRD 4.2 비범위 유지)

### 담당을 BE로 정한 근거 (2026-08-25 — FE 발행분에서 이동)

당초 FE로 발행했으나, **`earcast.co.kr`에 랜딩 페이지가 이미 운영 중이고 그 Vercel 프로젝트·도메인을 백엔드 담당이 관리한다**는 사실이 확인되어 이동했다. 호스팅을 새로 구축하는 일이 아니라 **기존 프로젝트에 경로 3개를 추가하는 일**이 되었고, 프로젝트 접근 권한이 곧 담당이다. 별도 Vercel 프로젝트를 만들지 않는다 — 검증 파일은 링크와 같은 도메인에서 서빙되어야 하므로 랜딩 프로젝트가 유일한 자리다.

단, **파일 안에 들어갈 값과 검증은 FE 협조가 필수**다:

- ①은 **Apple Team ID + 번들 ID**, ②는 **Android 패키지명 + 앱 서명 인증서의 SHA-256 지문** — 전부 앱 빌드·서명 설정에서만 나오는 값이라 FE가 제공한다
- 파일과 짝이 되는 앱 설정(`app.json`의 `associatedDomains`(iOS)·`intentFilters`(Android))은 FE 코드베이스다 — **파일과 앱 설정이 어긋나면 링크 검증이 실패**하므로 값 변경 시 서로 통지한다
- 동작 검증(링크 탭 → 브라우저가 아니라 앱이 열림)은 FE의 스탠드얼론 빌드로만 가능하다

## 요청 내용

1. **운영 중인 랜딩 Vercel 프로젝트에 `public/.well-known/` 파일 2종을 추가한다.** 값(Team ID·번들 ID·패키지명·서명 지문)은 FE에게 받는다. `apple-app-site-association`은 확장자가 없으므로 `vercel.json` `headers`로 `Content-Type: application/json`을 명시한다.
2. **`/contents/:id` 리다이렉트를 추가한다** — `vercel.json` `rewrites`로 `/contents/*`를 정적 페이지 하나로 보내고, 그 페이지의 JS가 iOS/Android를 판별해 각 스토어로 보낸다. 스토어 URL 확정 전(스토어 미등록)에는 임시 안내로 두고, URL 확정 시 교체한다(`share.md` 미결 "스토어 링크 확정값"). 랜딩의 기존 라우트와 경로 충돌이 없는지 확인한다.
3. **`assetlinks.json`의 서명 지문은 배포(스탠드얼론) 빌드 기준**임을 FE와 확인한다 — 개발(Expo Go)과 서명이 다르다.
4. *(FE 협조)* 앱 설정(`associatedDomains` · `intentFilters`)을 위 파일과 일치하게 등록하고, 설치 기기에서 링크 동작을 검증한다.
5. **범위 밖** — [공유] UI(시트 행·아이콘)·딥링크 수신 라우팅(상세 화면 이동)·공유 텍스트 조립은 P1 공유 구현 본체(FE)의 몫이다. 이 티켓은 **링크가 성립하는 인프라까지**다. NestJS(`backend/`)에는 아무것도 추가하지 않는다 — API 서버에 정적 서빙을 붙이면 앱 링크 인프라가 API 배포에 묶인다.

## 완료 조건

- Given 임의의 네트워크 / When `https://earcast.co.kr/.well-known/apple-app-site-association`을 조회한다 / Then 200과 JSON이 반환되고 번들 ID·`/contents/*` 경로가 포함되어 있다
- Given 임의의 네트워크 / When `https://earcast.co.kr/.well-known/assetlinks.json`을 조회한다 / Then 200과 JSON이 반환되고 패키지명·서명 지문이 포함되어 있다
- Given 앱이 설치되지 않은 기기(또는 데스크톱 브라우저) / When `https://earcast.co.kr/contents/<아무 id>`에 접속한다 / Then 스토어(확정 전에는 임시 안내 페이지)로 리다이렉트된다
- Given 기존 랜딩 페이지 / When 랜딩의 기존 경로들에 접속한다 / Then 이 티켓의 추가분으로 인한 동작 변화가 없다
- Given 스탠드얼론 빌드가 설치된 기기 *(FE 협조)* / When 위 링크를 탭한다 / Then 브라우저가 아니라 앱이 열린다(수신 라우팅 완성 전에는 앱 실행까지가 판정 범위)
- Given `backend/`(NestJS) 코드 전체 / When 이 티켓의 반영분을 확인한다 / Then 변경이 없다

## 보류·미결

- **스토어 URL 확정값** — 스토어 등록 후 리다이렉트 목적지를 실제 URL로 교체한다(`share.md` 미결과 공유)
- ~~호스팅 선택~~ → **해소(2026-08-25)**: 운영 중인 랜딩 Vercel 프로젝트에 추가한다. 별도 프로젝트를 만들지 않는다
