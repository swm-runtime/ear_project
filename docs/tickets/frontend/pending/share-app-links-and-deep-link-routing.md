# [FE] 공유 링크 — 앱 링크 설정·딥링크 수신 라우팅

| 항목 | 값 |
|---|---|
| 대상 | `frontend/app.json`(iOS `associatedDomains` · Android `intentFilters`) · 딥링크 수신 라우팅(내비게이션 — `/contents/:id` → 콘텐츠 상세) · 앱 식별 값 4종의 BE 전달 |
| 요청 파트 | 백엔드 (공유 설계 세션에서 발행) |
| 발행 날짜 | 2026-08-25 |
| 발견 시점 | 2026-08-25 공유 링크 인프라 반영(랜딩 Vercel에 `/contents/:id` 리다이렉트 배포 준비 완료 — `tickets/backend/pending/share-universal-links-hosting.md` 진행 기록) |
| 근거 문서 | `features/share.md` 4.2~4.3(링크·수신자 처리 규칙 소유) · `spec/uiux/share-uiux.md` 4.4(수신자 화면 표현 — CD 재사용, 복귀는 라이브러리) · `content-detail.md` 2(공유 링크 수신 진입) · README 결정 48 |
| 심각도 | **하** — P1 전제 작업. 단 **요청 1(값 전달)은 짝 티켓(BE)의 `.well-known` 파일 작성을 막고 있는 선행 항목**이라, 나머지와 분리해 먼저 처리할 수 있다 |
| 상태 | pending |

## 배경

공유(FR-27, P1) 링크의 URL 형태가 확정됐다 — **`https://earcast.co.kr/contents/:id`**. 웹 쪽은 준비가 끝났다: 랜딩(Vercel)에 `/contents/:id` → 안내 페이지 rewrite와 AASA `Content-Type` 헤더가 반영됐고(짝 티켓 진행 기록 2026-08-25), 미설치 수신자 처리(스토어 이동, 확정 전엔 안내)는 웹이 맡는다.

남은 것은 전부 앱 쪽이다 — **앱이 설치된 기기에서 이 URL이 브라우저 대신 앱을 열고, 앱이 해당 콘텐츠의 상세 화면으로 데려가는 것.** 이것이 되어야 OS 검증 파일(`.well-known` 2종, BE가 배포)도 의미를 갖는다.

**짝 티켓** — `tickets/backend/pending/share-universal-links-hosting.md`(BE: 랜딩 배포·`.well-known` 파일 작성). 파일의 값은 이 티켓의 요청 1이 공급한다. 파일과 앱 설정이 어긋나면 링크 검증이 실패하므로, 값 변경 시 서로 통지한다.

## 요청 내용

1. **앱 식별 값 4종을 BE에 전달한다** — ① Apple Team ID ② iOS 번들 ID ③ Android 패키지명 ④ **배포(스탠드얼론) 빌드 서명 인증서의 SHA-256 지문**(EAS 관리 서명이면 `eas credentials`에서 확인 — Expo Go의 서명이 아니다). BE가 이 값으로 `.well-known` 파일 2종을 작성·배포한다.
2. **`app.json`에 앱 링크를 등록한다** — iOS `associatedDomains: ["applinks:earcast.co.kr"]`, Android `intentFilters`(`autoVerify: true`, `https` · `earcast.co.kr` · `pathPrefix: "/contents"`). 값은 1에서 전달한 것과 반드시 일치시킨다.
3. **딥링크 수신 라우팅을 구현한다** — 링크로 앱이 열리면 `/contents/:id`를 파싱해 콘텐츠 상세 화면으로 이동한다. 규칙은 `share.md` 4.3 그대로:
   - **실행 관문(`splash.md`)을 우회하지 않는다** — 버전·로그인·온보딩 판정을 전부 거친다
   - **온보딩 완료 사용자만 상세로 이동**한다. 미로그인·온보딩 미완이면 **목적지를 버리고 정상 진입 분기**를 따른다(관문 통과 후 복원 없음 — 디퍼드 딥링크 금지)
   - 상세 도착 후는 `content-detail.md`·`content-detail-uiux.md` 그대로(단건 재조회 포함). 단 **복귀할 원 화면이 없으므로** 회수·만료 안내 후와 정상 상세의 뒤로가기 모두 **라이브러리로** 간다(`share-uiux.md` 4.4)
   - 수신자용 별도 화면·배너("OO님이 공유한 콘텐츠")를 만들지 않는다
4. **스탠드얼론 빌드로 검증한다** — Expo Go에서는 앱 링크(도메인 검증)가 동작하지 않는다. 링크 탭 → 브라우저가 아니라 앱이 열리고 → 해당 콘텐츠 상세에 도착하는 것까지.
5. **범위 밖** — [공유] 보내기 UI(시트 행·상단 바 아이콘)·공유 텍스트 조립은 P1 공유 구현 본체다(`share.md` · `share-uiux.md` 소유). 이 티켓은 **받는 쪽(링크 → 상세)까지**다.

## 완료 조건

- Given 요청 1의 값 4종 / When BE에 전달한다 / Then BE가 `.well-known` 파일 2종을 작성할 수 있고, `app.json` 설정(요청 2)과 값이 일치한다
- Given 스탠드얼론 빌드가 설치된 기기 / When `https://earcast.co.kr/contents/<발행 콘텐츠 id>` 링크를 탭한다 / Then 브라우저가 아니라 앱이 열리고, 실행 관문을 거쳐 그 콘텐츠의 상세 화면에 도착한다
- Given 온보딩을 마치지 않은(또는 미로그인) 상태 / When 공유 링크로 앱이 열린다 / Then 정상 진입 분기(로그인·온보딩)를 따르고, 완료 후에도 상세로 이동하지 않는다
- Given 회수된 콘텐츠의 공유 링크 / When 수신자가 탭해 앱이 열린다 / Then 상세 대신 "제공이 종료된 콘텐츠예요" 토스트 후 라이브러리로 이동한다
- Given 공유 링크로 도착한 정상 상세 / When 뒤로가기 한다 / Then 라이브러리로 이동한다
- Given 앱이 설치되지 않은 기기 / When 같은 링크를 연다 / Then 랜딩의 안내 페이지(스토어 확정 후 스토어 이동)가 뜬다 — 웹 쪽 동작이 앱 설정으로 깨지지 않았는지 확인

## 보류·미결

- **스토어 URL 확정값** — 짝 티켓(BE)과 공유하는 미결. 이 티켓의 범위에는 영향 없다
- 요청 3의 구현 위치(딥링크 리스너·내비게이션 연결 방식)는 `frontend/architecture.md`에 맞춰 FE가 정한다
