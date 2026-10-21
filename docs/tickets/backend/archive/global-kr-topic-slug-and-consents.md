# [BE] 글로벌 3-2 — KR 주제 slug 채우기(운영 데이터) · GLOBAL 약관 버전 네임스페이스(영어 약관 뒤)

| 항목 | 값 |
|---|---|
| 대상 | 운영·개발계 `topics.slug`(KR 행) · `CURRENT_CONSENT_VERSIONS`의 시장 분리 · 소셜 로그인 `consent_required` 응답의 동의 버전 |
| 요청 파트 | 백엔드 |
| 요청자 | 박준현(테크리드) |
| 담당 | 박준현 |
| Jira | [KAN-212](https://runtime364.atlassian.net/browse/KAN-212) · 에픽 [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) |
| 발행 날짜 | 2026-10-15 |
| 시작 날짜 | 2026-10-15 |
| 기한 | 2026-10-18 (Medium) — 1번은 FE KAN-195 배포 전이어야 한다 |
| 선행 | 사람 손: KR 주제 slug 값 확정(완료 2026-10-15) · 관리자 토큰으로 입력(상태: 대기) · 법무 영어 약관·처리방침(상태: 미정) |
| 관련 | [KAN-189](https://runtime364.atlassian.net/browse/KAN-189)에서 분리(코드 완료로 닫음) · FE [KAN-195](https://runtime364.atlassian.net/browse/KAN-195)(주제 이미지 slug 매핑) · [KAN-193](https://runtime364.atlassian.net/browse/KAN-193)(약관 대체안) |
| 근거 문서 | `spec/api/global-api.md` 4.1·4.5 · 9장 #5 |
| 중요도 | Medium |
| 상태 | 완료 (2026-10-16 — BE 범위. 재테크·투자 이미지 스크린샷 대조는 FE KAN-195 배포 때) |

## 1. KR 주제 slug 채우기 — 운영 데이터 (FE KAN-195 선행)

- 기존 KR 주제는 `slug`가 NULL이다. FE KAN-195가 주제 이미지 매핑 키를 한국어 이름에서 `slug`로 바꾸면, **slug가 비어 있는 동안 KR 화면의 주제 이미지가 전부 기본 이미지로 바뀐다.**
- 그래서 FE가 slug 매핑을 배포하기 전에 KR 주제 slug를 채워야 한다. 대안은 FE가 slug가 null이면 종전 이름 키로 폴백하는 것이다.
- 방법: 관리자 API `PATCH /admin/topics/:id { slug }`(#1537), 개발계와 운영 각각. 값은 아래 표로 확정했다(2026-10-15).

### 확정 slug (2026-10-15 박준현)

| 주제 | slug | 주제 | slug |
|---|---|---|---|
| 재테크 | `personal-finance` | 커리어 | `career` |
| 경제 상식 | `economics-basics` | 생산성 | `productivity` |
| 투자 | `investing` | 리더십 | `leadership` |
| 부동산 | `real-estate` | 조직 | `organization` |
| 경제 | `economy` | 디자인 | `design` |
| 인문·교양 | `humanities` | 스타트업 | `startup` |
| 철학 | `philosophy` | 트렌드 | `trends` |
| 사회·문화 | `society-culture` | 경영 | `management` |
| 예술 | `art` | 역사 | `history` |
| 커뮤니케이션 | `communication` | 세계사 | `world-history` |
| 산업안전 | `industrial-safety` | 한능검 | `korean-history-exam` |
| 마케팅 | `marketing` | 공인중개사 | `real-estate-agent-exam` |
| 데이터·AI | `data-ai` | 산업안전기사 | `industrial-safety-exam` |
| IT·개발 | `it-dev` | 커리어 성장 | `career-growth` |
| 자연과학 | `natural-science` | 이직·면접 | `job-change-interview` |
| 심리학 | `psychology` | AI·테크 트렌드 | `ai-tech-trends` |
| 뇌과학·인지 | `neuroscience` | | |
| 습관·동기 | `habits-motivation` | | |
| 인간관계 | `relationships` | | |
| 글쓰기 | `writing` | | |

- 왼쪽 20개는 지금 노출 중인 주제(공개 API 기준), 오른쪽은 FE에 이미지가 있지만 노출 목록에 없는 주제다. 운영 DB에 이 밖의 숨김 주제가 있으면 같은 규칙(영어 소문자·하이픈)으로 추가한다.
- 입력은 관리자 API `PATCH /admin/topics/:id { slug }`로 개발계 → 운영 순서. 이름이 표와 정확히 같은 행에만 넣는다.

> ⚠️ **주의 — 재테크·투자 이미지 파일명이 slug와 엇갈린다 (FE KAN-195)**
>
> | 주제 | 지금 이미지 파일 | slug |
> |---|---|---|
> | 재테크 | `topic-investing.jpg` | `personal-finance` |
> | 투자 | `topic-invest.jpg` | `investing` |
>
> FE가 매핑을 "slug → `topic-{slug}.jpg`"로 바꾸면 **투자 칩에 재테크 이미지(`topic-investing.jpg`)가 붙는다.** 매핑을 바꿀 때 파일명을 slug에 맞춰 정리한다: 재테크 `topic-investing.jpg` → `topic-personal-finance.jpg`, 투자 `topic-invest.jpg` → `topic-investing.jpg`(순서 주의 — 먼저 재테크 파일을 옮긴 뒤 투자 파일을 옮긴다). 파일명을 안 바꾸고 slug → 파일 표를 따로 두는 방식이면 이 문제는 없다.
> 확인: 정리 뒤 재테크·투자 칩의 이미지가 지금(1.2.0)과 같은지 스크린샷으로 대조한다.

## 2. GLOBAL 약관 버전 네임스페이스 — 영어 약관 확정 뒤

- 지금 동의 버전은 시장과 무관한 한 벌이다(`terms 0.1` · `privacy 0.1` · `age_confirmation null`). GLOBAL용 버전은 영어 약관·처리방침 문서가 있어야 둘 수 있다.
- **열린 설계 질문**: 신규 가입자는 소셜 로그인 응답(`consent_required`)에서 동의할 버전을 받는데, 이 시점에는 시장이 정해지지 않았다(시장은 가입 요청의 `preferred_language`로 정한다). 언어 선택 화면을 동의 화면보다 앞에 두고 로그인 요청에도 `locale`을 실을지 FE와 정한다.
- 영어 약관이 늦으면 Apple 표준 EULA + 영어 처리방침 초안으로 제출한다(KAN-193). 그때는 GLOBAL도 지금 버전 체계를 그대로 써도 된다.

## 완료 조건

- Given 운영·개발계의 KR 주제 / Then 전부 slug가 있고 FE 이미지 키와 일치한다(FE KAN-195 배포 전)
- Given FE slug 매핑 배포 / Then 재테크·투자 칩 이미지가 1.2.0과 같다(위 ⚠️ 주의)
- Given GLOBAL 가입 / When 동의 화면 / Then `pending_consents[].version`이 GLOBAL 약관 버전이다(영어 약관 확정 뒤)

## 처리 기록
- 2026-10-15 발행(마크다운 + Jira). KAN-189의 남은 일 두 가지를 옮겨 왔다.
- 2026-10-15 KR 주제 slug 확정(36개). 재테크·투자 이미지 파일명 엇갈림 주의를 이 문서·FE 티켓·Jira(KAN-212·KAN-195)에 남겼다.
- 2026-10-16 2번 구현 — PR `feat(be)/global-consent-versions`(KAN-215 PR #1609 위에 쌓음, dev 대상).
  - 현행 버전을 시장별로 나눴다(`CURRENT_CONSENT_VERSIONS_BY_MARKET`) — KR `0.1` 그대로, GLOBAL `terms`·`privacy` `global-0.1`(영어판 문서 0.1). 열린 설계 질문은 FE 결정(로그인 → A21 → 동의 목록 재조회 → A4)으로 해소됐다.
  - 가입·재동의·`POST /users/me/consents`가 그 사용자 시장 버전과 비교한다. GLOBAL 가입이 KR 버전을 보내면 409 `CONSENT_VERSION_STALE`.
  - 문서 `changes/archive/global-consent-version-namespace.md`(`global-api.md` 9장 #5 결정 포함).
  - 1번(KR slug 운영 입력)은 그대로 대기 — 이 티켓은 1번이 끝날 때 archive로 옮긴다.
- 2026-10-16 1번 완료 — 운영 KR 주제 36개에 slug 입력(SQL 한 트랜잭션, 36행이 아니면 되돌림 — 결과 `OK 36`, 36/36·중복 없음). 운영 DB에는 표의 "세계사"가 없고 "TOPCIT"이 있어 규칙대로 `topcit`을 넣었다. 개발계는 운영 → 개발계 동기화로 들어왔다(이 과정에서 10-15부터 막혀 있던 동기화를 발견·복구 — GLOBAL 주제 ID 불일치, #1618).
- 2026-10-16 완료 — 반영 날짜 2026-10-16. 완료 조건 확인:
  - KR slug ↔ FE 사진 표(`interest.images.ts` `TOPIC_IMAGE_BY_SLUG`): 36개 중 35개 정확히 일치, 재테크 `personal-finance` → `topic-investing`·투자 `investing` → `topic-invest`로 1.2.0과 같은 사진. `topcit`은 FE slug 표에 없지만 이름 폴백("TOPCIT")으로 같은 사진이다(FE가 slug 행을 더하면 폴백이 필요 없다).
  - GLOBAL 동의 버전 `global-0.1`(#1610, e2e로 확인).
  - 남은 것은 FE 쪽 확인뿐이다 — FE slug 매핑이 운영에 나갈 때 재테크·투자 칩 스크린샷 대조(FE KAN-195). `archive/`로 이동, Jira 완료.
