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
| 상태 | 대기 |

## 확정 — GLOBAL 16세 (2026-10-14 박준현)

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

- 연령 동의 문구를 `user.market`으로 분기 — GLOBAL "I confirm that I am 16 or older", KR 종전 18세 문구. 언어가 아니라 **시장**으로 분기한다(영어 설정 KR 사용자는 18).
- 연령 미충족 선택 시의 차단 화면·문구 영어 리소스(KAN-194 리소스 체계).
- 약관 동의 전송은 서버가 `pending_consents[].version`으로 내려주는 시장별 버전을 그대로 쓴다(`terms_global_v1` 등, BE KAN-189). 클라이언트가 버전을 하드코딩하지 않는다.
- 접근성 라벨·스크린샷 QA 체크리스트에 연령 화면 추가.

## 범위 밖

KR 연령 기준 변경 · 부모 동의 흐름 · OS 연령 신호(Declared Age Range API) 연동(KAN-207 검토 결과에 따라 후속)

## 완료 조건

- Given 응답 `user.market = global` / When 연령 동의 화면 / Then 16세 문구(en), 선택 시 가입 진행
- Given `user.market = kr` / Then 18세 문구 종전과 동일(회귀) — 기기 언어가 en이어도 18
- Given 서버 `pending_consents`의 버전 / When 동의 전송 / Then 그 버전 값 그대로, 클라이언트 상수 0건
- Given 연령 미충족 선택 / Then 영어 차단 화면, 한국어 리터럴 0건

## 처리 기록
- 2026-10-14 발행(마크다운 + Jira). 연령 기준 조사 후 16세 확정, `global-api.md` 2.1 ⚪ → ✅, 9장 미결 #2 삭제.
