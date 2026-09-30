# 앱 안에 제3자 저작물(오픈소스·아이콘) 고지 자리 만들기

| 항목 | 값 |
|---|---|
| 대상 문서 | `features/settings.md` · `spec/uiux/settings-uiux.md`(행 · 카피) · `wireframe/settings.html` |
| 요청 파트 | 프론트엔드 |
| 발행 날짜 | 2026-09-30 |
| 시작 날짜 | 2026-09-30 |
| 기한 | 2026-10-02 (Low — 이번 주 안) |
| 선행 | 없음 |
| 중요도 | Low — 라이선스 준수 항목이라 스토어 출시(main) 전에는 반영해야 한다 |

## 배경

PM 2026-09-30 00:56 — Android 하단 탭 "라이브러리" 아이콘을 **Solar Icon Set `library`(CC BY 4.0)** 로 바꿨다(획 1.5 → 1.25 변경). CC BY 4.0 은 **저작자 표기 · 라이선스 링크 · 변경 여부 표시**를 "매체에 맞는 합리적인 방법"으로 요구한다. 앱에는 오픈소스·저작물 고지 화면이 아직 없다. 저장소에는 `frontend/THIRD_PARTY_NOTICES.md` 로 남겼지만 사용자에게 보이지 않는다.

## 제안

- 설정 허브 맨 아래 "앱 정보" 묶음에 **[오픈소스 라이선스]** 행을 둔다. 누르면 고지 목록(첫 항목: "아이콘 — Solar Icon Set by 480 Design, CC BY 4.0, 획 굵기 변경")을 보여주는 푸시 화면이거나, 같은 내용의 웹 페이지(랜딩)를 연다.
- npm 패키지 라이선스 목록도 같은 화면에 모을지는 별도로 정한다(스토어 심사상 필수는 아님).

### 결정 (PM 2026-09-30 01:09 "랜딩 웹페이지 링크로 ㄱㄱ")

1. **랜딩 웹 페이지** `https://earcast.co.kr/licenses/` — 앱 안 화면은 두지 않는다
2. 카피 **"오픈소스 라이선스"**(제안 그대로)

## 완료 조건

- Given 설정 화면, When 오픈소스 라이선스(가칭) 행을 누르면, Then Solar Icon Set 의 저작자 · CC BY 4.0 링크 · 변경 사항이 보인다
- Given 문서, When settings-uiux.md 를 읽으면, Then 해당 행의 위치와 카피가 적혀 있다

## 처리 기록

- 반영 날짜: 2026-09-30
- 랜딩 `landing-page/src/app/licenses/` + `src/content/licenses.ts`(Solar 저작자 · CC BY 4.0 링크 · 획 굵기 변경), `routes.ts` 에 `licenses`(바닥글 legal 묶음).
- 앱 설정 "정보" 묶음에 [오픈소스 라이선스] 행 — `LICENSES_URL`(env `EXPO_PUBLIC_LICENSES_URL`, 기본 `https://earcast.co.kr/licenses/`).
- 문서: `features/settings.md` · `spec/uiux/settings-uiux.md` 정보 행 목록에 추가.
- **운영 반영은 랜딩이 main 으로 나가야 링크가 산다**(Vercel 프로덕션 = main).
