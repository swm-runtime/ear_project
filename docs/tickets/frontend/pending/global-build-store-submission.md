# [FE] 글로벌 5 — `app.json` locales·앱 이름 현지화·runtimeVersion 네이티브 빌드(KAN-182 포함)·영어 리스팅·심사 제출

| 항목 | 값 |
|---|---|
| 대상 | `app.json`(`expo.locales` ko/en·`CFBundleLocalizations`·앱 이름) · runtimeVersion · EAS 빌드 · 스크린샷(영어 UI)·설명·키워드 · 심사 노트 |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현(테크리드) |
| 담당 | 이주호 |
| Jira | [KAN-198](https://runtime364.atlassian.net/browse/KAN-198) · 에픽 [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) |
| 발행 날짜 | 2026-10-14 |
| 시작 날짜 | 2026-10-14 |
| 기한 | 2026-10-24 (Medium 환산은 발행+3일(10-17)이나 선행 티켓 뒤 착수라 10일 계획의 마일스톤 날짜로 적음) |
| 선행 | [KAN-194](https://runtime364.atlassian.net/browse/KAN-194)~[KAN-197](https://runtime364.atlassian.net/browse/KAN-197) · KAN-182 `invite-code-event-ui.md`(**같은 빌드에 묶어 심사 한 번**) · 사람 손: 영문 앱 이름(PM 확정) · 영어 약관·처리방침(법무, 없으면 Apple 표준 EULA 링크) |
| 관련 | BE [KAN-193](https://runtime364.atlassian.net/browse/KAN-193) 개발계 통합 검증이 이 빌드(TestFlight)를 쓴다 |
| 근거 문서 | **`spec/api/global-api.md` 해당 없음(빌드·스토어)** — 구현은 이 문서를 따르고, 계약이 바뀌면 티켓이 아니라 이 문서를 고친다 · 2026-10-14 글로벌화 조사 |
| 중요도 | Medium |
| 상태 | 진행 중 — 1.3.0 빌드 업로드 완료(iOS (20) · Android vc 21). 남은 것: 심사 제출(iOS 는 (20) 지정) · 영어 리스팅 · 운영 Android aab 업로드(사람 손) · 공개 뒤 실기기 확인(아래 이관 항목) |

> 2026-10-14 발행한 묶음 티켓(BE KAN-185 · FE KAN-183 · AI KAN-184)을 처리 단위로 나눈 것. 결정 사항(같은 앱·기기 언어로 가입 시 1회 시장 판정·한국 트랙 불변·에러 번역은 클라이언트·가격은 스토어·영어 진행자 새 2인·K-컬처 주제 신설·GLOBAL 연령 16세)과 결정 대기(시장 전환 불허)는 `spec/api/global-api.md` 2.1·9장이 원본이다.

## 무엇을 한다

- `app.json` `expo.locales`(ko/en)·`CFBundleLocalizations`·앱 이름 현지화. runtimeVersion 올린 네이티브 빌드(OTA 불가 — 네이티브 모듈·locales 변경).
- 개발계 TestFlight·Play 내부 테스트 배포 → BE 통합 검증과 교차.
- 영어 리스팅 자료(스크린샷 영어 UI·설명·키워드) 작성 → 박준현에게 전달(콘솔 입력은 BE 7번).
- 글로벌 빌드 심사 제출(iOS·Android). 심사 노트에 영어 테스트 계정·K-컬처 저작물 미사용 명시. **이벤트 코드(KAN-182) 포함**.
- 제품 버전 올릴 때 `backend/package.json`도 같은 값(CLAUDE.md Git 절 — 유일한 예외).

## 범위 밖

심사 결과 대응(별도)

## 완료 조건

- Given 빌드 / Then runtimeVersion 올라감, `app.json` locales ko/en, KAN-182 변경 포함
- Given 개발계 TestFlight / When 영어 기기 / Then 시작~재생 영어(BE 7번과 교차 확인)
- Given 2026-10-24 / Then iOS·Android 심사 제출 완료, 처리 기록에 제출 시각
- Given 버전 PR / Then `frontend/app.json`과 `backend/package.json` 버전 동일

## 처리 기록
- 2026-10-14 발행(마크다운 + Jira). 묶음 티켓 분할.
- 2026-10-15 코드 반영(빌드 전): `frontend/locales/{ko,en}.json` + `app.json` `expo.locales` — 홈 화면 앱 이름 현지화(iOS `CFBundleDisplayName` · Android `app_name`, 영어는 PM 확정 전 임시값 **Ear**) · `ios.infoPlist.CFBundleLocalizations` ko/en. 개발계 변형(`APP_VARIANT=dev`)은 `locales` 를 빼 영어 기기에서도 "이어 - preview" 로 남긴다(`app.config.js`). `expo config` 로 운영·개발계 해석 결과 확인. **runtimeVersion 은 35 유지** — 네이티브 리소스 문자열뿐이고 JS 가 읽지 않아 옛 35 빌드에서 깨지지 않는다. 올리면 KAN-182 심사 빌드(35)에 OTA 가 끊긴다. `expo-localization` 교체는 하지 않았다(네이티브 모듈 — 지금 `Intl` 로 충분). 남은 것: 영문 앱 이름 PM 확정 · 네이티브 빌드("빌드 ㄱ" 지시 후) · 영어 기기 TestFlight 실측 · 영어 리스팅 자료(스크린샷은 실측 뒤) · 심사 제출(10-24). KAN-182 빌드는 이미 35 로 나가 있어 "같은 빌드에 묶어 심사 한 번"은 어긋났다 — 이 변경은 다음 빌드에 실린다
- 2026-10-17 **1.3.0 빌드·출시 때 최소 지원 버전을 1.3.0으로 올린다**(BE 요청, 박준현 — Jira 댓글). 탐색 시리즈 카드(BE KAN-134 2단계·FE KAN-225)가 1.3.0과 함께 서버에 들어가고 1.2.x는 새 탐색 응답(`type: "series"`)을 모른다. 값은 서버 env `MIN_SUPPORTED_APP_VERSION_IOS`·`_ANDROID` = `1.3.0`(BE가 바꾼다). 탐색 시리즈 카드는 서버 스위치 `SERIES_EXPLORE_CARDS_ENABLED`(기본 꺼짐) 뒤에 있다. 순서: ① dev→main 머지(스위치 꺼짐 — 1.2.1 정상) ② 1.3.0 스토어 빌드(`eas build --profile production`, main 머지와 무관)·심사·공개(두 OS) ③ 최소 지원 버전 1.3.0(②보다 먼저 하지 않는다) ④ 스위치 켬. FE 확인: **1.3.0이 `runtimeVersion`을 36으로 올리는지**(main 머지 때 production OTA가 자동 발행된다 — 35 그대로면 새 JS가 1.2.1에 닿는다) · 1.2.x 강제 업데이트 화면이 스토어로 보내는지.
- 2026-10-18 **1.3.0 출시 준비 반영**(PR `feat(fe)/release-1-3-0`). ① 영어 앱 이름 **Earcast**(PM 확정 2026-10-18 — 종전 임시값 Ear): `locales/en.json` CFBundleDisplayName·app_name, 앱 영어 문구 5곳(시작 화면 앱 이름 · 약관 동의 로고 낭독 · `BrandMark` · 업데이트 권장 본문 · `APP_UPDATE_REQUIRED` 에러 문구). "Ear Picks"·플레이어 "Main"은 PM 승인으로 그대로. ② 제품 버전 **1.3.0**(`app.json` · `frontend/package.json` · `backend/package.json`·lockfile — 같은 PR) · **runtimeVersion 36**(`app.json` 노트·`architecture.md` 2.1 이력). Android versionCode·iOS buildNumber 는 `eas.json` `appVersionSource: remote` + `autoIncrement` 라 손대지 않았다. ③ FE 확인 항목 — 1.2.x 강제 업데이트: 스플래시 1단계 `GET /app/version` 이 426 `APP_UPDATE_REQUIRED` 면 `ForceUpdateScreen` 하나만 그리고(닫기 불가·Android 뒤로가기 삼킴) [Update] 가 `STORE_URL`(iOS `apps.apple.com/app/id6807708636` = `submit.production.ascAppId` · Android `play.google.com/store/apps/details?id=com.runtime.ear`, `EXPO_PUBLIC_STORE_URL` 미설정)로 보낸다. main(1.2.1) 과 dev 의 관문 코드는 같다(차이는 영어 문구뿐). 판정 시점은 콜드 스타트와 백그라운드 30분 뒤 복귀다 — 실행 중 다른 API 의 426 은 에러 문구만 띄우고 강제 화면으로 바꾸지 않는다(종전 설계 그대로). 남은 사람 손·영문 이름 반영처: 서버 인증 메일 `EN_BRAND`(BE) · 랜딩 영어 페이지 `enSite.name`·OG 워드마크(`landing-page`) 는 아직 `Ear` 다
- 2026-10-19 **KAN-197에서 이관** — 1.3.0 Android 빌드(Play 내부 테스트) 실기기에서 같이 본다: ① 영어 화면 Android 폰트 폴백·버튼 2줄(탐색 인기 구간 토글 "Weekly / Monthly / All time" · 커리어 직군 칩) ② iPhone SE + 가장 큰 글자에서 O4 커리어 폼까지 스크롤·직무 입력칸이 키보드 위로(#1708). iPhone 영어 레이아웃은 KAN-197에서 끝났다(`archive/global-locale-formats-layout.md`).
- 2026-10-19 **KAN-206에서 이관** — 같은 1.3.0 실기기 확인 때: 약관 화면(A4) 연령 행 VoiceOver/TalkBack 낭독 · SE급·글자 200%에서 A1·A4 영어 문구 잘림 없음.
- 2026-10-19 **KAN-195에서 이관** — A21 콘텐츠 언어 화면 VoiceOver 낭독(한국어·English 글자별 낭독 언어).
- 2026-10-19 **KAN-199 에서 넘어온 사람 손 — 글로벌 스토어 리스팅 URL 3개 입력**(KAN-199 는 운영 반영 확인 뒤 완료 처리, `archive/landing-english-pages.md`). 제출 때 적는다: 지원 URL `https://earcast.co.kr/en/` · 개인정보처리방침 URL `https://earcast.co.kr/en/privacy/` · Google Play 계정 삭제 URL `https://earcast.co.kr/en/account-deletion/`. 셋 다 운영에서 200 확인(2026-10-19 19:59 KST 빌드). 영어 약관·처리방침은 법무 검토 없이 noindex 상태로 쓴다(PM 결정 2026-10-19) — 심사에는 영향 없다.
- 2026-10-24 **운영 iOS 1.3.0 (20) 빌드·ASC 업로드**(EAS `9a5f1077`, dev `bffdc094`, rt 36 그대로) — KAN-256 iOS 무손실 정확 시각(expo-audio 패치)을 1.3.0 에 싣기 위해 다시 뽑았다. **심사 제출 빌드는 (20)으로 지정한다**((19)에는 KAN-256 이 없다 — 사람 손, ASC). 개발계 iOS preview-store 도 같은 날 다시 뽑는다.
- 2026-10-24 **KAN-217 에서 이관** — 1.3.0 운영 공개(OTA 적용) 뒤: 설정 › 개인정보 › 광고 측정 허용 끔 → 앱 사용·재시작 → Meta 이벤트 관리자 0건, 다시 켬 → 재개(KAN-217 조건 1·2). 운영 이벤트 관리자에 다른 사용자 이벤트가 섞이므로 테스트 이벤트 코드·전용 기기로 가른다(`archive/ad-measurement-opt-out.md` 10-19 기록).
- 2026-10-24 **KAN-181 에서 이관** — 출시 순서 ④에서 BE 가 운영 `AUTO_EXPAND_ENABLED` 를 켠 뒤: 운영 앱 관심사 화면 빗금·"N/3"에서 자동 슬롯 제외·설정 자동 확장 토글 실측(KAN-181 마지막 조건, `archive/auto-expand-interest-ui.md`).
- 2026-10-24 10:20 **운영 iOS 1.3.0 (21)** EAS `47055931`(dev `6ce0c860`, rt 36) → ASC 업로드 완료(Submission `ef63d740`). (20)에 있던 무손실 시크 멈춤(Sentry EAR-APP-E — expo-audio 상태 틱의 `currentDate()` 동기 XPC, #2016)을 고친 빌드다. **심사 제출 빌드는 (21)로 지정**((20)은 쓰지 않는다 — 사람 손). 개발계 iOS 1.3.0 (49) EAS `17a58ecc` → TestFlight 제출 완료.
