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
| 상태 | **완료(2026-10-19 PM 결정 — 법무 검토 생략)**. 운영 `/en/` 4페이지 200. 스토어 URL 입력은 KAN-198 로 넘김 |
| 반영 날짜 | 2026-10-19 |

> 2026-10-14 발행한 묶음 티켓(BE KAN-185 · FE KAN-183 · AI KAN-184)을 처리 단위로 나눈 것. 결정 사항(같은 앱·기기 언어로 가입 시 1회 시장 판정·한국 트랙 불변·에러 번역은 클라이언트·가격은 스토어·영어 진행자 새 2인·K-컬처 주제 신설·GLOBAL 연령 16세)과 결정 대기(시장 전환 불허)는 `spec/api/global-api.md` 2.1·9장이 원본이다.

## 무엇을 한다

- 소개·약관·개인정보·계정 삭제 4페이지 영어판. `/en` 경로, `hreflang` ko/en.
- 스토어 리스팅의 지원 URL·개인정보 URL을 영어 페이지로(글로벌 심사용).
- 전면 영어화는 범위 밖.

## 범위 밖

랜딩 전면 영어화 · 블로그·FAQ

## 완료 조건

- Given `/en` 4페이지 / Then 한국어 리터럴 0건(예외 — 바닥글의 한국어 전환 링크 이름 "한국어"와 약관·처리방침의 서비스 정의 `"Earcast (이어)"` 괄호 안 원명 1회. 2026-10-19 PM 확정, 처리 기록 참조), `hreflang` 양방향
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
- 2026-10-19 **랜딩 영어 앱 이름 `Ear` → `Earcast`**(브랜치 `docs(fe)/landing-earcast-name`). 단어 경계(`Ear`)로만 바꿔 `Earn`·`early`·`hear`·`year` 류는 건드리지 않았다 — 29곳: `src/content/en/site.ts` 7(`enSite.name` 포함 — 헤더·바닥글·`<title>` template·`applicationName`·저작권 줄이 이 값을 따른다) · `src/content/en/routes.ts` 5(제목·설명·주석) · `src/content/legal-en.ts` 13 · `scripts/og-pages.mjs` 4(영어 워드마크·문구·주석). 한국어 "이어"는 그대로다. OG 이미지 `public/og/en.png`·`en-legal.png`는 `npm run og`로 다시 구웠다(글자가 전부 ASCII라 폰트 서브셋은 다시 만들 필요 없음, 한국어 OG는 바이트 동일). lint·build 통과, `out/en/**`에 단독 `Ear` 0건. **법무 검토 대상 주의** — 영어 이용약관·개인정보 처리방침(`legal-en.ts`)의 서비스 별칭 정의가 `("**Earcast**" or the "**Service**")`로 바뀌었다. 이름만 바꾼 것이고 조항 내용은 그대로다. 법무 검토는 `Earcast` 표기로 본다. **남은 것**: 위 10-15 항목 그대로 — 특히 `legal-en.ts`의 `site.name`("이어") 2곳은 이번에도 손대지 않았다(#1584 작성자 확인 대기). 운영 반영은 랜딩 배포(dev→main + 수동 배포) 뒤.
- 2026-10-19 **영어 약관·처리방침의 서비스 이름 정의를 `"Earcast (이어)"`로**(PM 확정 — 브랜치 `docs(fe)/legal-en-service-name`). `legal-en.ts` 51·293행이 `"${site.name}"`(한국어 "이어" 단독)이었다 → `"Earcast (${site.name})"`. 한국 법인 서비스의 원래 이름을 괄호로 함께 적어 같은 서비스임을 분명히 한다. 별칭 정의 `("**Earcast**" or the "**Service**")`는 그대로. 위 "남은 것"의 `site.name` 2곳 항목은 이것으로 닫힌다 — `out/en/terms/`·`/en/privacy/`의 "이어"는 이 괄호 안 한 번씩만 남는다(의도). 법무 검토는 이 표기로 본다.
- 2026-10-19 **운영 반영 — `/en/` 4페이지 전부 200**(팀원 배포, 19:59 KST 빌드. 방식은 10-15와 같은 `vercel.json` `git.deploymentEnabled` 잠깐 켜기 → 끄기, dev `230951a9`). 확인(curl, 캐시 우회): `/en/`·`/en/terms/`·`/en/privacy/`·`/en/account-deletion/` 200 · `<html lang="en">` · `<title>` "… | Earcast"(종전 운영은 10-15 빌드라 "Ear | 이어"였다) · hreflang ko/en/x-default 3종 · 약관·처리방침 `noindex, nofollow` 유지 · 본문의 "이어"는 `"Earcast (이어)"` 정의 안에서만. **완료 조건 2 충족.** 완료 조건 1의 "한국어 리터럴 0건"은 PM이 10-19 확정한 `"Earcast (이어)"` 표기와 충돌해 예외 두 가지(전환 링크 이름 · 괄호 안 원명)를 조건에 적었다.
  - **배포 경로는 아직 임시다** — repo secret `LANDING_VERCEL_DEPLOY_HOOK`이 여전히 없어 `landing-daily-rebuild.yml`은 매일 "미설정 — 건너뜁니다"로 끝난다(2026-10-08 이후 계속. 주제 데이터 변경이 랜딩에 반영되지 않는다). Vercel 프로젝트 → Settings → Git → Deploy Hooks 생성 → `gh secret set LANDING_VERCEL_DEPLOY_HOOK`이 사람 손으로 남는다 — 이 티켓 범위 밖이라 여기엔 기록만.
  - **남은 것**: 법무 검토(KAN-126) 뒤 `content/en/routes.ts` `indexable: true` · 글로벌 스토어 리스팅 URL 입력(지원 `https://earcast.co.kr/en/` · 개인정보 `/en/privacy/` · Play 계정 삭제 `/en/account-deletion/`, KAN-198·214). 둘 다 사람 손·외부 일정이라 pending 유지.
- 2026-10-19 **완료 처리(PM 결정 — "법무 검토 못 할 것 같아, 그냥 완료")**. 완료 조건 2(영어 URL 200)는 충족, 조건 1은 위 예외를 적은 기준으로 충족(`out/en/**`의 한글은 전환 링크 이름과 `"Earcast (이어)"` 괄호 안 원명뿐). **법무 검토는 하지 않은 채 닫는다** — 영어 약관·처리방침은 #1584 결정대로 `noindex, nofollow`·사이트맵 제외(`content/en/routes.ts` `indexable: false`) **그대로 둔다**. 검토 없이 색인까지 열지는 않는다 — 검토 없이 공개된 법적 문서가 검색에 잡히면 되돌리기 어렵고, 심사·앱 안 링크에는 noindex가 영향이 없다. 나중에 검토가 생기면 그때 `indexable: true` 한 줄이다(새 티켓). 스토어 리스팅 URL 3개 입력은 제출 작업이라 KAN-198 `global-build-store-submission.md` 사람 손 목록으로 옮겼다. 배포 훅 secret 미설정은 이 티켓 밖(위 기록 참조). 이 PR 에서 `archive/`로 옮기고 Jira KAN-199 완료.
