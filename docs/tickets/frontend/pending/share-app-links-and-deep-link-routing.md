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

---

## 진행 기록 (2026-08-25 — 브랜치 `feat(fe)/share`, pending 유지)

- **요청 2 구현 완료** — `app.json`에 `ios.bundleIdentifier`/`android.package`(`com.runtime.ear`), `associatedDomains: ["applinks:earcast.co.kr"]`, `intentFilters`(autoVerify · https · earcast.co.kr · pathPrefix `/contents`) 등록.
- **요청 3 구현 완료** — `features/share` feature의 `useShareLinkGate`(RootNavigator 배치)가 `/contents/:id` 파싱 → 온보딩 완료 사용자만 상세(entryPoint `share`)로, 아니면 목적지 폐기(share.md 4.3 — 디퍼드 금지). 공유 링크 진입 상세의 뒤로가기·회수 복귀는 라이브러리다(share-uiux.md 4.4). SplashGate 미구현 상태라 콜드 스타트 판정을 관문 뒤로 옮기는 TODO를 게이트에 남김. entry_point `share`는 가정 계약 — `changes/pending/play-entry-point-share-value(fe).md`.
- **요청 1·4 미완으로 pending 유지** — ① 값 4종 중 Apple Team ID·배포 서명 SHA-256 미확보(애플 개발자 계정 등록 대기. 번들 ID·패키지명은 `com.runtime.ear` 확정), ④ 스탠드얼론 빌드 검증은 값 전달·`.well-known` 배포 후에 가능하다.

## 진행 기록 (2026-08-26 — iOS만 검증 가능해짐)

- **Apple Team ID `3RJ4N5XLN9` 확보 → BE가 `apple-app-site-association`을 작성했다**(짝 티켓 진행 기록 2026-08-26). `appIDs`가 `3RJ4N5XLN9.com.runtime.ear`라 `app.json`의 `ios.bundleIdentifier`와 일치한다 — **요청 2의 iOS 짝이 맞았다.**
- **요청 4를 iOS 한정으로 지금 할 수 있다** — 배포 승격 후 스탠드얼론(또는 development build) 설치 기기에서 `https://earcast.co.kr/contents/<id>` 탭 → 브라우저가 아니라 앱이 열리는지 확인한다. 안드로이드는 `assetlinks.json`이 아직 404라 **검증해도 실패한다**(정상).
- **여전히 미확보는 배포 서명 SHA-256 하나뿐이다.** 애플 개발자 계정이 아니라 **안드로이드 서명 인증서**에서 나온다 — Play Console → 앱 서명 → **앱 서명 키**(업로드 키 아님)의 SHA-256, 또는 Play 등록 전이면 `eas credentials -p android`.
- **AASA 프로덕션 배포·검증 완료(2026-08-26)** — `https://earcast.co.kr/.well-known/apple-app-site-association` 200 + `application/json`, **애플 CDN도 200으로 파일을 인식**했다(짝 티켓 진행 기록 2026-08-26). **요청 4를 iOS 한정으로 지금 실행할 수 있다.**
  - 검증 방법: 스탠드얼론(또는 development) 빌드를 설치한 iOS 기기에서 `https://earcast.co.kr/contents/<아무 id>`를 **메모·메시지 등 다른 앱에서 탭**한다 → 브라우저가 아니라 앱이 열려야 한다. **사파리 주소창에 직접 입력하면 유니버설 링크가 동작하지 않는다** — 검증 실패로 오인하기 쉬운 지점이다.
  - **안드로이드는 지금 검증하면 실패가 정상이다** — `assetlinks.json`이 404라 OS가 도메인 소유를 확인할 수 없다.

## 진행 기록 (2026-09-03 — 요청 1 완료: 값 4종 전부 확보)

Play 스토어 배포가 이뤄지면서 마지막으로 남아 있던 **배포 서명 SHA-256**을 확보했다. **요청 1이 닫혔다.**

| 값 | 내용 |
|---|---|
| ① Apple Team ID | `3RJ4N5XLN9` (2026-08-26 확보) |
| ② iOS 번들 ID | `com.runtime.ear` |
| ③ Android 패키지명 | `com.runtime.ear` |
| ④ **배포 서명 SHA-256** | `58:81:A3:6A:0F:7C:A3:24:24:E8:AC:12:60:ED:86:B7:ED:D3:B9:9A:AE:B9:3F:C8:D8:37:C7:AD:E4:4F:D6:6C` |

④는 Play Console → 앱 서명 페이지가 **디지털 애셋 링크 JSON을 완성된 형태로** 만들어 주므로 그대로 짝 티켓에 넘겼다(BE 티켓 2026-09-03 진행 기록에 전문 기재).

- **`eas credentials`가 아니라 Play Console이 출처다.** 발행 당시 지시(*"EAS 관리 서명이면 `eas credentials`에서 확인"*)는 Play 등록 **전**에만 유효하다. Play App Signing이 AAB를 재서명하므로, 스토어에 올라간 뒤에는 **EAS 업로드 키가 아니라 Play의 앱 서명 키**가 기기에서 검증되는 지문이다.
- **이 지문은 고정값이 아니다.** 앱 서명 키가 2026-09-02에 업그레이드됐고, 현재 배포본은 *이전 앱 서명 키*로 서명돼 있다(새 키의 설치 비율 0.0%). 전환이 진행되면 `assetlinks.json`의 `sha256_cert_fingerprints` 배열에 새 키의 SHA-256을 **추가**해야 한다 — 티켓 상단 원칙대로 **값이 바뀌면 BE에 통지**한다.

**요청 2·3은 2026-08-25에 완료**됐고, `app.json`의 `intentFilters`(`autoVerify` · `https` · `earcast.co.kr` · `pathPrefix: "/contents"`)는 위 패키지명과 일치한다 — **무변경으로 그대로 맞는다.**

### pending 유지 사유 — 요청 4(안드로이드 검증)만 남았다

`assetlinks.json`이 아직 배포되지 않아(BE 짝 티켓 요청 1) 안드로이드 App Links 검증은 **지금 해도 실패가 정상**이다. 순서는 이렇다.

1. BE가 위 JSON으로 `assetlinks.json` 배포 + **프로덕션 수동 승격**
2. `https://earcast.co.kr/.well-known/assetlinks.json` 200 확인
3. 스토어 빌드 설치 기기에서 `https://earcast.co.kr/contents/<발행 콘텐츠 id>`를 **다른 앱(메모·메시지)에서 탭** → 브라우저가 아니라 앱이 열리는지
4. iOS 검증은 2026-08-26부터 이미 가능한 상태다(애플 CDN 200 확인됨)

**다음에 집는 사람이 조사할 것은 없다 — BE 배포를 기다렸다가 기기에서 3번을 해보면 된다.**

**추가(2026-09-03)** — 위 1번의 `assetlinks.json` 파일 작성은 같은 PR에서 함께 처리했다(`landing-page/public/.well-known/assetlinks.json`). **프로덕션 수동 승격만 남았고**, 승격되는 즉시 3번을 실행할 수 있다.
