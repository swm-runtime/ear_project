# [AI] 글로벌 5 — 개발계→운영 발행(BE 계약 뒤)·`runs` 트랙 축·ElevenLabs 한도 공용 모니터링·영어 TTS 단가 실측

| 항목 | 값 |
|---|---|
| 대상 | 콘솔 `SEND_*` 플래그(market/language) · `runs` 트랙 축 · ElevenLabs 한도·단가 · 발행 교차 확인 |
| 요청 파트 | AI 파이프라인 |
| 요청자 | 박준현(테크리드) |
| 담당 | 박수헌 |
| Jira | [KAN-204](https://runtime364.atlassian.net/browse/KAN-204) · 에픽 [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) |
| 발행 날짜 | 2026-10-14 |
| 시작 날짜 | 2026-10-14 |
| 기한 | 2026-10-24 (Low — 선택 범위·후순위. 날짜는 글로벌 빌드 제출일) |
| 선행 | BE [KAN-190](https://runtime364.atlassian.net/browse/KAN-190) `global-publish-contract.md`(개발계 배포 알림) · [KAN-202](https://runtime364.atlassian.net/browse/KAN-202) |
| 관련 | BE [KAN-193](https://runtime364.atlassian.net/browse/KAN-193) 통합 검증과 같은 날 개발계에서 교차 확인 |
| 근거 문서 | **`spec/api/global-api.md` 4.9 · 6장 발행 흐름** — 구현은 이 문서를 따르고, 계약이 바뀌면 티켓이 아니라 이 문서를 고친다 · 2026-10-14 글로벌화 조사 |
| 중요도 | Low |
| 상태 | 대기 |

> 2026-10-14 발행한 묶음 티켓(BE KAN-185 · FE KAN-183 · AI KAN-184)을 처리 단위로 나눈 것. 결정 사항(같은 앱·기기 언어로 가입 시 1회 시장 판정·한국 트랙 불변·에러 번역은 클라이언트·가격은 스토어·영어 진행자 새 2인·K-컬처 주제 신설)과 결정 대기(시장 전환 불허·GLOBAL 16세)는 `spec/api/global-api.md` 2.1·9장이 원본이다.

## 무엇을 한다

- BE 4번 개발계 배포 알림을 받으면 콘솔 플래그를 켜 `market`·`language`를 payload로 보낸다(한국어 트랙도 명시). 개발계 발행 → GLOBAL 계정에만 노출 확인(BE e2e와 교차) → 운영.
- `runs`에 트랙 축, ElevenLabs 한도 두 트랙 공용 모니터링. 영어 TTS 단가 실측(글자 수가 늘어 과금 ↑ 예상 — 편당 원가를 처리 기록에).
- 공개 후 2주 안에 30~40편 확장은 후속 티켓.

## 범위 밖

정규 운영 항목(영어 L0·골드·축 규칙·스윕 자동화)

## 완료 조건

- Given 개발계 발행 1편(`market=global`) / Then GLOBAL 계정 피드에 보이고 KR 계정에는 없다(BE와 교차 확인 날짜)
- Given 한국어 트랙 발행 / Then `market=kr, language=ko` 명시 전송, 종전과 동일 노출
- Given 영어 20편 TTS / Then 편당 단가·총액이 처리 기록에 있다

## 처리 기록
- 2026-10-14 발행(마크다운 + Jira). 묶음 티켓 분할.
