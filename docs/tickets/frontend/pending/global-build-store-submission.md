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
| 상태 | 대기 |

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
