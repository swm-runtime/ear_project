# [AI] 글로벌 5 — 개발계→운영 발행(BE 계약 뒤)·ElevenLabs 한도 공용 모니터링·영어 TTS 단가 실측

| 항목 | 값 |
|---|---|
| 대상 | 콘솔 `SEND_*` 플래그(market/language) — 한국판·글로벌판 콘솔 양쪽 · ElevenLabs 한도·단가 · 발행 교차 확인 |
| 요청 파트 | AI 파이프라인 |
| 요청자 | 박준현(테크리드) |
| 담당 | 박수헌 |
| Jira | [KAN-204](https://runtime364.atlassian.net/browse/KAN-204) · 에픽 [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) |
| 발행 날짜 | 2026-10-14 |
| 시작 날짜 | 2026-10-14 |
| 기한 | 2026-10-24 (Low — 선택 범위·후순위. 날짜는 글로벌 빌드 제출일) |
| 선행 | BE [KAN-190](https://runtime364.atlassian.net/browse/KAN-190) `global-publish-contract.md`(개발계 배포 알림) · [KAN-202](https://runtime364.atlassian.net/browse/KAN-202) |
| 관련 | BE [KAN-193](https://runtime364.atlassian.net/browse/KAN-193) 통합 검증과 같은 날 개발계에서 교차 확인 |
| 근거 문서 | **`spec/api/global-api.md` 4.9 · 6장 발행 흐름** · `docs/ai/global/PIPELINE.md` 6.9·8장 |
| 중요도 | Low |
| 상태 | 대기 |

> 2026-10-14 발행한 묶음 티켓(BE KAN-185 · FE KAN-183 · AI KAN-184)을 처리 단위로 나눈 것. 앱·서버 결정은 `spec/api/global-api.md`가, 파이프라인 결정은 `docs/ai/global/PIPELINE.md`가 원본이다. **티켓과 명세가 다르면 명세를 따른다.**

## 무엇을 한다

- BE 4.9 개발계 배포 알림을 받으면 콘솔 플래그를 켜 `market`·`language`를 payload로 보낸다 — 한국판 콘솔도 `market=kr, language=ko`를 명시한다. 개발계 발행 → GLOBAL 계정에만 노출 확인(BE e2e와 교차) → 운영.
- ElevenLabs 한도를 두 인스턴스 공용으로 모니터링한다(계정 하나). 영어 TTS 단가 실측 — 편당 원가를 처리 기록에.
- 비용은 인스턴스별 `runs`에 따로 남는다(DB가 따로). 두 트랙 합산은 필요할 때 조회로 한다.

## 범위 밖

정규 운영 항목(영어 L0 확장·골드·회귀 세트) · 오픈 전 40편 생산(4번)

## 완료 조건

- Given 글로벌 콘솔의 운영 발행 1편(`market=global`) → 운영→개발계 콘텐츠 동기화 / Then 개발계의 GLOBAL 계정 피드에 보이고 KR 계정에는 없다(BE와 교차 확인 날짜). 2026-10-19 고침 — 글로벌 콘솔의 발행처는 운영 서버(`EAR_API_BASE_URL`)이고, 개발계 콘텐츠는 운영에서 동기화로 내려온다(BE KAN-204 코멘트 2026-10-19). 운영은 `GLOBAL_SIGNUP_ENABLED` 가 꺼져 있고 GLOBAL 주제가 숨김이라 실제 사용자에게는 보이지 않는다
- Given 한국어 트랙 발행 / Then `market=kr, language=ko` 명시 전송, 종전과 동일 노출
- Given 영어 TTS 20편 이상 / Then 편당 단가·총액이 처리 기록에 있다

## 처리 기록
- 2026-10-14 발행(마크다운 + Jira). 묶음 티켓 분할.
- 2026-10-14 명세 우선 정리 — `runs` 트랙 축은 인스턴스(DB) 분리로 필요 없어 뺐다. "공개 후 2주 안에 30~40편 확장(후속)"은 사용자 결정(2026-10-14)으로 **오픈 전 최소 40편**이 돼 4번으로 옮겼다.
- 2026-10-19 발행 payload 에 `market`·`language` 전송 시작(#1748) — 글로벌 콘솔은 `global`·`en`, 한국판 콘솔은 `kr`·`ko` 를 명시한다. 콘솔 플래그 없이 인스턴스 시장(`<html data-market>`)으로 정한다(BE 1단계 선택 입력이 운영까지 배포돼 있어 바로 보냈다 — BE KAN-202 코멘트 10-17·10-19). 재발행(PATCH)은 BE 요청 범위 밖이라 그대로. 완료 조건 1 의 "개발계 발행"을 "운영 발행 → 개발계 동기화"로 고쳤다(발행처가 운영 서버다).
