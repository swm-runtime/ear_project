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
| 선행 | 사람 손: FE와 KR 주제 slug 값 합의(상태: 미정) · 법무 영어 약관·처리방침(상태: 미정) |
| 관련 | [KAN-189](https://runtime364.atlassian.net/browse/KAN-189)에서 분리(코드 완료로 닫음) · FE [KAN-195](https://runtime364.atlassian.net/browse/KAN-195)(주제 이미지 slug 매핑) · [KAN-193](https://runtime364.atlassian.net/browse/KAN-193)(약관 대체안) |
| 근거 문서 | `spec/api/global-api.md` 4.1·4.5 · 9장 #5 |
| 중요도 | Medium |
| 상태 | 대기 |

## 1. KR 주제 slug 채우기 — 운영 데이터 (FE KAN-195 선행)

- 기존 KR 주제는 `slug`가 NULL이다. FE KAN-195가 주제 이미지 매핑 키를 한국어 이름에서 `slug`로 바꾸면, **slug가 비어 있는 동안 KR 화면의 주제 이미지가 전부 기본 이미지로 바뀐다.**
- 그래서 FE가 slug 매핑을 배포하기 전에 KR 주제 slug를 채워야 한다. 대안은 FE가 slug가 null이면 종전 이름 키로 폴백하는 것이다.
- 방법: 관리자 API `PATCH /admin/topics/:id { slug }`(#1537), 개발계와 운영 각각. 값은 FE 이미지 키와 1:1로 FE와 합의한다.

## 2. GLOBAL 약관 버전 네임스페이스 — 영어 약관 확정 뒤

- 지금 동의 버전은 시장과 무관한 한 벌이다(`terms 0.1` · `privacy 0.1` · `age_confirmation null`). GLOBAL용 버전은 영어 약관·처리방침 문서가 있어야 둘 수 있다.
- **열린 설계 질문**: 신규 가입자는 소셜 로그인 응답(`consent_required`)에서 동의할 버전을 받는데, 이 시점에는 시장이 정해지지 않았다(시장은 가입 요청의 `preferred_language`로 정한다). 언어 선택 화면을 동의 화면보다 앞에 두고 로그인 요청에도 `locale`을 실을지 FE와 정한다.
- 영어 약관이 늦으면 Apple 표준 EULA + 영어 처리방침 초안으로 제출한다(KAN-193). 그때는 GLOBAL도 지금 버전 체계를 그대로 써도 된다.

## 완료 조건

- Given 운영·개발계의 KR 주제 / Then 전부 slug가 있고 FE 이미지 키와 일치한다(FE KAN-195 배포 전)
- Given GLOBAL 가입 / When 동의 화면 / Then `pending_consents[].version`이 GLOBAL 약관 버전이다(영어 약관 확정 뒤)

## 처리 기록
- 2026-10-15 발행(마크다운 + Jira). KAN-189의 남은 일 두 가지를 옮겨 왔다.
