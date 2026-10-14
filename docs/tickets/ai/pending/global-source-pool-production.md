# [AI] 글로벌 4 — 소스 풀 20~30곳·주제 기획 생산·영어 메타(`enrichment` language·태그·`target_audiences`)·`upload-meta` market/language · 파일럿 20~25편 검수

| 항목 | 값 |
|---|---|
| 대상 | 글로벌 도메인 tier·라이선스 판정 · 주제 기획 모드(B-②) · 군집화·보강 검색 언어·`site:` 풀 · `enrichment.json` 영어 기준 · `upload-meta.json` `market/language/track` · 영어 검수(게이트 2) |
| 요청 파트 | AI 파이프라인 |
| 요청자 | 박준현(테크리드) |
| 담당 | 박수헌 |
| Jira | [KAN-202](https://runtime364.atlassian.net/browse/KAN-202) · 에픽 [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) |
| 발행 날짜 | 2026-10-14 |
| 시작 날짜 | 2026-10-14 |
| 기한 | 2026-10-24 (Medium 환산은 발행+3일(10-17)이나 선행 티켓 뒤 착수라 10일 계획의 마일스톤 날짜로 적음) |
| 선행 | [KAN-203](https://runtime364.atlassian.net/browse/KAN-203) · [KAN-200](https://runtime364.atlassian.net/browse/KAN-200) 소스 풀 범위·권리 판정 · 사람 손: **영어 검수자 배정**(게이트 2는 대본 직접 열람) |
| 관련 | BE [KAN-190](https://runtime364.atlassian.net/browse/KAN-190) 발행 계약과 같은 필드를 기록한다 — 제품 발행은 5번 |
| 근거 문서 | **`spec/api/global-api.md` 4.9(`market`·`language`·태그 `^[가-힣A-Za-z0-9 ]{2,20}$`·`target_audiences` 생략)** — 구현은 이 문서를 따르고, 계약이 바뀌면 티켓이 아니라 이 문서를 고친다 · 2026-10-14 글로벌화 조사 |
| 중요도 | Medium |
| 상태 | 대기 |

> 2026-10-14 발행한 묶음 티켓(BE KAN-185 · FE KAN-183 · AI KAN-184)을 처리 단위로 나눈 것. 결정 사항(같은 앱·기기 언어로 가입 시 1회 시장 판정·한국 트랙 불변·에러 번역은 클라이언트·가격은 스토어·영어 진행자 새 2인·K-컬처 주제 신설·GLOBAL 연령 16세)과 결정 대기(시장 전환 불허)는 `spec/api/global-api.md` 2.1·9장이 원본이다.

## 무엇을 한다

- 글로벌 도메인 20~30곳 사람 판정(tier·라이선스). 주제 기획 모드로 후보 생성(스윕 자동화는 2단계). 군집화·보강 검색의 언어·`site:` 풀 트랙별.
- 메타: `enrichment.json` 영어 판정 기준, `language: "en"`, `target_audiences` 생략, 태그는 완화 규칙(공백·20자)으로 생성. 임베딩 모델 유지.
- `upload-meta.json`에 `market: global`·`language: en`·`track` 기록 → 콘솔이 payload로 옮긴다(BE 4번 배포 전엔 플래그 off).
- **주제 4~5개 × 5편 = 20~25편** 검수 통과(영어 검수자).

## 범위 밖

스윕 자동화 · 시장별 권리 규칙(정규 운영)

## 완료 조건

- Given 2026-10-24 / Then 영어 20편 이상 검수 통과, `upload-meta.json`에 `market=global, language=en`
- Given 생성된 태그 / Then 전부 `^[가-힣A-Za-z0-9 ]{2,20}$` 통과, `target_audiences` 없음
- Given 소스 풀 / Then 20~30곳 tier·라이선스 표가 있다

## 처리 기록
- 2026-10-14 발행(마크다운 + Jira). 묶음 티켓 분할.
