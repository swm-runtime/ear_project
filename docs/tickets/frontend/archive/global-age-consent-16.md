# [FE] 글로벌 7 — GLOBAL 연령 동의 16세 확정 적용: 동의 화면·문구·약관 버전 연동 (KR 18세 불변)

| 항목 | 값 |
|---|---|
| 대상 | 약관·연령 동의 화면(A 계열) 연령 문구와 차단 흐름 · `user.market` 분기 · 약관 버전 네임스페이스 연동 · en/ko 리소스 |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현(테크리드) |
| 담당 | 이주호 |
| Jira | [KAN-206](https://runtime364.atlassian.net/browse/KAN-206) · 에픽 [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) |
| 발행 날짜 | 2026-10-14 |
| 시작 날짜 | 2026-10-14 |
| 기한 | 2026-10-19 (Medium 환산은 10-17이나 KAN-194 i18n 기반 뒤 착수라 마일스톤 날짜로 적음) |
| 선행 | [KAN-194](https://runtime364.atlassian.net/browse/KAN-194) `global-i18n-foundation.md` · BE [KAN-189](https://runtime364.atlassian.net/browse/KAN-189) `global-onboarding-steps-topics.md`(약관 네임스페이스 `terms_global_v1` — 배포 전엔 문구만 먼저) |
| 관련 | [KAN-195](https://runtime364.atlassian.net/browse/KAN-195)의 "연령 16세 문구" 항목을 이 티켓으로 이관 · 스토어 설정은 BE [KAN-207](https://runtime364.atlassian.net/browse/KAN-207) |
| 근거 문서 | **`spec/api/global-api.md` 2.1(연령 행 ✅) · 4.1** — 구현은 이 문서를 따르고, 계약이 바뀌면 티켓이 아니라 이 문서를 고친다 |
| 중요도 | Medium |
| 상태 | 완료(2026-10-19) — 나라별 연령 실기기 확인 |

## 확정 — GLOBAL 16세 (2026-10-14 박준현)

> **2026-10-16 나라별로 대체됨**(PM 이주호 — 아래 처리 기록). 이 절은 10-14 조사 기록으로 남긴다. 현행 규칙: KR 시장 18 · GLOBAL 중 싱가포르·홍콩·한국 16, 그 밖·지역 모름 18 · 판정은 서버 `min_age`.

**법정대리인 동의 없이 본인이 동의할 수 있는 최저 연령**을 공개 후보 국가별로 확인한 결과, 16이면 어디서도 부모 동의 흐름이 필요 없다.

| 관할 | 본인 동의 가능 연령 | 근거 |
|---|---|---|
| EU(GDPR 8조) | 기본 **16**, 회원국이 13까지 하향 가능 — 독일·네덜란드·아일랜드·폴란드 등 16 유지, 프랑스 15, 스페인·이탈리아 14, 벨기에·덴마크·스웨덴 등 13 | GDPR Art. 8(1) |
| 영국 | 13 | DPA 2018 s.9 |
| 미국 | 13 | COPPA |
| 한국 | 14 | 개인정보 보호법 22조의2 |

- 16은 GDPR 최고치이자 모든 후보 국가의 상한이다. 15 이하로 내리면 독일·네덜란드 등 16 유지국에 부모 동의 흐름이 필요해진다.
- KR 시장은 현행 **18세** 그대로(별도 정책 결정 사항, 이 티켓 범위 밖).
- 미국 일부 주(텍사스 SB2420 등)·브라질·호주·싱가포르의 스토어 단 연령 확인 의무는 스토어 설정 티켓(KAN-207)에서 본다. 1단계는 **자기 선언**이다.

## 무엇을 한다

- 연령 동의 문구를 `user.market`으로 분기 — GLOBAL "I confirm that I am 16 or older", KR 종전 18세 문구. 언어가 아니라 **시장**으로 분기한다(영어 설정 KR 사용자는 18). → **2026-10-16 대체**: 숫자는 서버가 동의 항목의 `min_age`로 준다(나라별 — 완료 조건 참조). 클라이언트는 그 숫자를 끼울 뿐 시장·지역으로 판정하지 않는다.
- 연령 미충족 선택 시의 차단 화면·문구 영어 리소스(KAN-194 리소스 체계).
- 약관 동의 전송은 서버가 `pending_consents[].version`으로 내려주는 시장별 버전을 그대로 쓴다(`terms_global_v1` 등, BE KAN-189). 클라이언트가 버전을 하드코딩하지 않는다.
- 접근성 라벨·스크린샷 QA 체크리스트에 연령 화면 추가.

## 범위 밖

KR 연령 기준 변경 · 부모 동의 흐름 · OS 연령 신호(Declared Age Range API) 연동(KAN-207 검토 결과에 따라 후속)

## 완료 조건

> 2026-10-18 갱신 — 종전 "GLOBAL이면 16" 두 줄을 10-16 PM 결정(나라별, 서버 `min_age` 판정)으로 바꿨다(처리 기록 10-18).

- Given GLOBAL 가입 · 기기 지역 `SG`·`HK`·`KR` / When 서버가 연령 항목 `min_age = 16`을 준다 / Then 16세 문구("I confirm that I am 16 or older"), 선택 시 가입 진행
- Given GLOBAL 가입 · 그 밖의 지역(`MY`·`PH`·`ID`·`TH` 등) 또는 지역 모름 / When 서버가 `min_age = 18`을 준다 / Then 18세 문구
- Given `user.market = kr` / Then 18세 문구 종전과 동일(회귀) — 기기 언어가 en이어도 18
- Given 서버가 `min_age`를 주지 않는다(BE 배포 전·옛 서버) / Then 시장과 무관하게 18(보수값) — 클라이언트가 시장·지역으로 16을 고르지 않는다
- Given 서버 `pending_consents`의 버전 / When 동의 전송 / Then 그 버전 값 그대로, 클라이언트 상수 0건
- Given 연령 미충족 선택 / Then 영어 차단 화면, 한국어 리터럴 0건

## 처리 기록
- 2026-10-14 발행(마크다운 + Jira). 연령 기준 조사 후 16세 확정, `global-api.md` 2.1 ⚪ → ✅, 9장 미결 #2 삭제.
- 2026-10-15 코드·문서 반영(브랜치 `feat(fe)/global-formats-plans-age`, 미커밋). **기기 확인 전이라 pending 유지.**
  - 연령 문구 시장 분기 — `auth.copy.ts` `ageConfirmationLabel(market)`(KR 18: ko "만 18세 이상입니다"·en "I’m 18 or older" 종전 그대로 / GLOBAL 16: en "I confirm that I am 16 or older"·ko "만 16세 이상입니다"). 한국어 스냅숏 모양을 바꾸지 않으려고 `AUTH_COPY` 밖에 두었다(`copy-ko.snapshot.test.ts` 통과, 스냅숏 갱신 없음).
  - 시장 출처 — A4(가입)는 계정이 없어 A21 선택값 대응(`auth.constants.ts` `CONTENT_LANGUAGE_MARKET`: ko→kr · en→global, 표시용), A20(재동의)은 세션 `selectMarket`(없으면 kr).
  - 차단 화면 — A4에 "미충족" 선택지·차단 화면이 **원래 없다**(체크 안 하면 [동의하고 시작하기] 비활성 = 계정 미생성). 새 화면은 만들지 않았고, en 경로의 연령 행·접근성 라벨에 한국어 리터럴 0건(`auth.copy.test.ts`). 문서에 "별도 차단 화면 없음"으로 명시(auth-uiux 4.3 · auth.md).
  - 약관 버전 — 클라이언트 상수 0건 확인(목업 `auth.mock.ts` 의 `'1.0'` 은 서버 대역). A4·A20 모두 서버 `version` 그대로 전송함을 테스트로 고정(`useTermsConsentScreen.test.tsx`·`useReconsentScreen.test.tsx` — `terms_global_v1`). 서버가 연령 행을 안 주면 채우는 `version: null` 은 계약값(auth-api 4.2)이라 유지.
  - 접근성 — 연령 행 라벨이 시장 문구라 낭독도 기준 연령을 따른다(ConsentItem `${label} ${tag}`).
  - 고정 폭(KAN-197 중 auth 파일분) — A1 `StartScreen`: 구분선 문구 `flexShrink: 1`+가운데 정렬, 태그라인·설명 `textAlign: 'center'`, 정책 링크 행 `flexWrap: 'wrap'`. A4 `TermsConsentScreen`: [전체 동의] 라벨 `flexShrink: 1`. A21 `ContentLanguageScreen`·`LanguageOptionCard`: 고정 폭 문구 상자 없음(이미 flex) — 변경 없음.
  - 문서 — `spec/uiux/auth-uiux.md` 4.3(연령 행·시장별 확정 카피 표)·4.3-1·7장(고정 폭 금지), `features/auth.md` 4.1, `spec/api/auth-api.md` 4.2(연령 시장별).
  - 남은 것: ① 실기기 확인 — en 기기 + English 선택 → A4 16세 문구, ko 기기 + 한국어 선택 → 18세(회귀), en 기기 + 한국어 선택 → "I’m 18 or older", VoiceOver/TalkBack 낭독, 작은 기기(SE급)·글자 크기 200%에서 A1·A4 영어 문구 잘림 없음. ② 스크린샷 QA 체크리스트에 연령 화면 추가 — 저장소에 해당 체크리스트 문서가 아직 없어 KAN-197/198 QA 문서가 생길 때 넣는다. ③ BE KAN-189 배포 뒤 실서버 `pending_consents` 의 `terms_global_v1` 로 A20 왕복 확인.
- 2026-10-15 **보류 — GLOBAL 연령 숫자 재검토**(Jira 댓글 19:29 박준현). 동남아 위주 공개로 16세를 다시 본다(인도네시아 18세 미만 부모 동의 · 태국 성년 20세 — 18로 올리면 KR과 같아진다). 이 댓글을 보기 전에 위 구현이 PR #1591로 dev에 머지됐다(개발계 OTA `01a13f4a`, 운영 main 미포함). **시장 분기 구조·서버 버전 그대로 전송은 숫자와 무관하게 유지**하고, 숫자만 결정을 따른다. 남은 결정: GLOBAL 연령 16 vs 18. 18로 정해지면 같은 날 ① `frontend/src/features/auth/auth.copy.ts` `ageConfirmationLabel` GLOBAL 문구 ② `spec/uiux/auth-uiux.md` 4.3 · `spec/api/auth-api.md` 4.2 · `spec/api/global-api.md` 2.1(changes 경유) ③ 랜딩 `landing-page/src/content/legal-en.ts` 약관 2조 · 처리방침 7조를 함께 고친다. dev → main 릴리즈 전에 확정한다.
- 2026-10-16 **결정 — 나라별(3안, PM 이주호)**. 박준현이 정리한 선택지 3개(18 일괄 · 16 일괄 · 나라별, Jira 댓글 2026-10-16 13:38) 중 나라별로 정했다. 규칙: KR 시장 18(불변) · GLOBAL은 기기 지역(`locale.region_code`)으로 싱가포르·홍콩·한국 **16**, 말레이시아·필리핀·인도네시아·태국·지역 모름 **18**. **판정은 서버**가 하고 `age_confirmation` 항목의 `min_age`로 내려준다(제안 계약 `changes/archive/auth-age-by-region.md`, BE 티켓 `tickets/backend/archive/global-age-by-region.md`).
  - FE 반영(브랜치 `feat(fe)/age-by-region`): `RequiredConsent.minAge`(DTO `min_age`) 추가 · `ageConfirmationLabel(minAge)` 숫자 끼우기(ko "만 {n}세 이상입니다" · en "I confirm that I am {n} or older" — 영어 KR 문구도 이 형식으로 통일) · `resolveMinAge` — 서버 값이 없으면 **시장과 무관하게 18**(`FALLBACK_MIN_AGE`, 보수값). 그래서 BE 배포 전에는 GLOBAL도 18로 보이고, 16은 서버가 지역을 보고서만 준다. A4·A20 둘 다. mock 은 sign-up 동의 재조회에서 지역으로 16/18 연령 행을 돌려준다.
  - 문서: `auth-uiux.md` 4.3 · `auth-api.md` 4.1(`region_code` 용도)·4.2 · `global-api.md` 2.1·4.1 · `features/auth.md` 4장. 랜딩 `legal-en.ts` 약관 2조 · 처리방침 7조를 "18, 싱가포르·홍콩·한국은 16"으로.
  - 남은 것: BE `min_age` 판정 구현 → 실서버에서 지역별(SG 16 · MY 18 · 지역 없음 18) 확인. 태국 18~19세(성년 20)는 법률 멘토 미팅(KAN-126) 질문으로 넘긴다. 스토어 등급(KAN-207, Apple 16+ · Play 16–17/18+)은 최저 16이 남아 그대로 맞다.
- 2026-10-18 **문서 갱신** — 완료 조건의 "GLOBAL이면 16" 두 줄을 10-16 결정(나라별: GLOBAL 중 SG·HK·KR 16 · 그 밖·지역 모름 18 · KR 시장 18 · 서버 `min_age` 판정, 값이 없으면 18)으로 바꾸고, "확정 — GLOBAL 16세" 절과 "무엇을 한다" 첫 줄에 대체 표시를 달았다(영어 화면 QA 반영 PR `fix(fe)/global-en-layout-qa`). 같은 PR에서 A4·A20 본문을 스크롤 가능하게 했다 — 영어 국외 이전 동의 행이 하단 버튼 밑에 깔렸다. 실기기 확인이 남아 pending 유지.
- 2026-10-19 **완료 — archive**(반영 날짜 2026-10-19, PM 실기기 · 개발계 · iPhone). BE `min_age` 판정(KAN-220)은 개발계 배포 상태.
  - 조건 1 ✅ GLOBAL · 지역 KR → 16 — 개발계 GLOBAL 가입 계정의 연령 동의가 `age-16`으로 저장(DB 집계 확인, 10-19).
  - 조건 2 ✅ GLOBAL · 지역 **Malaysia** → 약관 화면 "I confirm that I am 18 or older"(실기기).
  - 조건 3 ✅ 영어 기기(지역 대한민국) + A21 한국어 → "만 18세 이상입니다"(실기기, 화면 언어도 한국어 — KAN-195 화면 언어 통일).
  - 조건 4 ✅ 서버가 `min_age`를 안 주면 18 — `resolveMinAge` 폴백(`FALLBACK_MIN_AGE` 18·18) 코드·테스트.
  - 조건 5 ✅ 동의 버전은 서버 값 그대로 — `useTermsConsentScreen.test.tsx`·`useReconsentScreen.test.tsx`(`terms_global_v1`).
  - 조건 6 ✅ 별도 차단 화면 없음(미체크 = [동의하고 시작하기] 비활성, 처리 기록 10-15) · 영어 경로 한국어 리터럴 0건(KAN-194 9화면 실기기).
  - 개발계 GLOBAL 주제는 PM 지시로 열어 둔 상태에서 확인했다(원래 노출 0 — BE 상태).
  - **이관(KAN-198)**: 연령 행 VoiceOver 낭독 · SE급·글자 200%에서 A1·A4 영어 문구 잘림(완료 조건 밖의 추가 확인).
