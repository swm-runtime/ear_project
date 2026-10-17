# [FE] 글로벌 6 — 랜딩 영어 필수 4페이지(소개·약관·개인정보·계정 삭제)·`/en`·`hreflang`

| 항목 | 값 |
|---|---|
| 대상 | `landing-page/src/content/site.ts` 영어판 · `/en` 경로 · `hreflang` · 스토어 리스팅의 지원 URL·개인정보 URL |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박준현(테크리드) |
| 담당 | 이주호 |
| Jira | [KAN-199](https://runtime364.atlassian.net/browse/KAN-199) · 에픽 [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) |
| 발행 날짜 | 2026-10-14 |
| 시작 날짜 | 2026-10-14 |
| 기한 | 2026-10-24 (Low — 선택 범위·후순위. 날짜는 글로벌 빌드 제출일) |
| 선행 | 사람 손: 법무 영어 약관·개인정보처리방침(없으면 Apple 표준 EULA 링크 + 영어 처리방침 초안으로 제출) · [KAN-197](https://runtime364.atlassian.net/browse/KAN-197)(`legal-urls.ts` 경로 합의) |
| 관련 | 스토어 심사(FE 5번)가 영어 지원 URL을 요구하면 선택 범위가 아니라 필수가 된다 |
| 근거 문서 | **`spec/api/global-api.md` 해당 없음(랜딩)** — 구현은 이 문서를 따르고, 계약이 바뀌면 티켓이 아니라 이 문서를 고친다 · 2026-10-14 글로벌화 조사 |
| 중요도 | Low |
| 상태 | 대기 |

> 2026-10-14 발행한 묶음 티켓(BE KAN-185 · FE KAN-183 · AI KAN-184)을 처리 단위로 나눈 것. 결정 사항(같은 앱·기기 언어로 가입 시 1회 시장 판정·한국 트랙 불변·에러 번역은 클라이언트·가격은 스토어·영어 진행자 새 2인·K-컬처 주제 신설·GLOBAL 연령 16세)과 결정 대기(시장 전환 불허)는 `spec/api/global-api.md` 2.1·9장이 원본이다.

## 무엇을 한다

- 소개·약관·개인정보·계정 삭제 4페이지 영어판. `/en` 경로, `hreflang` ko/en.
- 스토어 리스팅의 지원 URL·개인정보 URL을 영어 페이지로(글로벌 심사용).
- 전면 영어화는 범위 밖.

## 범위 밖

랜딩 전면 영어화 · 블로그·FAQ

## 완료 조건

- Given `/en` 4페이지 / Then 한국어 리터럴 0건, `hreflang` 양방향
- Given 스토어 심사 노트 / Then 영어 지원·개인정보 URL이 200 응답

## 처리 기록
- 2026-10-14 발행(마크다운 + Jira). 묶음 티켓 분할.
- 2026-10-15 구현(커밋 전 — 브랜치 `feat(fe)/landing-english-pages`, origin/dev 128d6ced 위). `npm run build`·`npm run lint` 통과.
  - **`/en` 4페이지** — `/en/`(소개) · `/en/terms/` · `/en/privacy/` · `/en/account-deletion/`. 영어 루트 레이아웃(`src/app/en/layout.tsx`, `<html lang="en">`)과 영어 헤더·바닥글을 따로 두고, 한국어 페이지는 라우트 그룹 `src/app/(ko)/`로 옮겼다(주소·내용 불변 — dev의 현행 파일 그대로 이동). 맨 위 레이아웃이 없어져 404는 `src/app/global-not-found.tsx`(`experimental.globalNotFound`)가 한국어로 그린다.
  - **약관·처리방침은 PR #1584(`src/content/legal-en.ts`)의 글로벌용 영어 문서**를 영어 레이아웃 안에 그린다 — 한국어 번역본이 아니라 동남아 개인정보법·CCPA/CPRA·Apple 3.1.2를 더해 따로 쓴 초안이다. 법무 검토 전이라 #1584 결정대로 **noindex·nofollow, 사이트맵 제외**(`content/en/routes.ts` `indexable: false`). 한국어 `/privacy/` 상단의 영어 링크(#1584)는 그대로 둔다.
  - **소개** — 한국어 홈 번역이 아니라 두 시장에 공통으로 참인 것만(AI 생성·매일 적립·즉시 재생·이어듣기·원문 대조·출처·합성 음성 고지). 편수·길이·가격은 글로벌 미확정이라 뺐다. 영어 앱 이름은 임시값 `Ear`(KAN-198).
  - **계정 삭제** — 한국어 원문 번역 + 앱 영어 메뉴명(Profile · Settings · Account · Delete account), "충돌 시 한국어판 우선" 안내와 한국어 원문 링크.
  - **`hreflang`** — 4쌍 모두 양쪽 `<head>`에 ko · en · x-default(=ko). 사이트맵에는 색인 대상(`/en/`·`/en/account-deletion/`)만 같은 묶음으로 넣었다. 공유 이미지 `og/en.png`·`og/en-legal.png` 추가.
  - **언어 전환 링크** — 한국어 바닥글에 "English"(→ `/en/`), 영어 바닥글에 "한국어"(→ 그 페이지의 한국어 짝).
  - **점검** — `out/en/**`의 한글: `/en/`·`/en/account-deletion/`은 "한국어" 링크 이름뿐. **`/en/terms/`·`/en/privacy/`에 "이어"가 남는다** — `legal-en.ts` 51·292행이 `site.name`(한국어 브랜드 "이어")을 쓴다. 완료 조건 1을 닫으려면 그 두 곳을 영어 앱 이름(`Ear`)으로 바꿔야 한다(#1584 작성자 확인 후 반영).
  - **남은 것**
    - `legal-en.ts`의 `site.name` 2곳(위) 수정.
    - 법무 검토 — 영어 약관·처리방침(#1584)·계정 삭제 번역. 검토가 끝나면 `indexable: true`로 색인·사이트맵에 넣는다.
    - 운영 반영 — 랜딩 운영은 main을 따른다(dev → main PR). 그 뒤 완료 조건 2(영어 URL 200 응답) 확인.
    - 사람 손 — 글로벌 스토어 리스팅의 지원 URL `https://earcast.co.kr/en/`, 개인정보 URL `https://earcast.co.kr/en/privacy/`, Google Play 계정 삭제 URL `https://earcast.co.kr/en/account-deletion/` 입력.
- 2026-10-18 영어 앱 이름 **Earcast** 로 PM 확정(KAN-198 — 종전 임시값 `Ear`). 앱은 PR `feat(fe)/release-1-3-0` 에서 반영했고, **랜딩은 아직 `Ear` 다** — `src/content/en/site.ts` `enSite.name` · `routes.ts` 제목·설명 · `legal-en.ts` 본문의 "Ear" 별칭 · `scripts/og-pages.mjs` 영어 워드마크. 랜딩 릴리즈(dev→main)와 함께 바꾼다.
