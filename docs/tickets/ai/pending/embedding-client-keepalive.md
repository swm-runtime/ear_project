# [AI] 임베딩 API가 쉬었다 부르면 느려 검색 의미 엔진이 꺼진다 — OpenAI 연결 재사용

| 항목 | 값 |
|---|---|
| 대상 | `ai-server/app/services/embedding/client.py` `OpenAiEmbeddingClient` · `ai-server/app/api/embeddings.py`(클라이언트 수명) |
| 요청 파트 | AI(AI 서버) |
| 요청자 | 박준현(BE) — 2026-10-23 검색 의미 엔진 결손 실측 |
| 담당 | AI 서버 |
| Jira | [KAN-253](https://runtime364.atlassian.net/browse/KAN-253) |
| 발행 날짜 | 2026-10-23 |
| 시작 날짜 | 2026-10-23 |
| 기한 | 2026-10-26 (Medium — +3일) |
| 선행 | 없음 — 백엔드 예산 조정은 반영됨(#1940: 400ms → 800ms, 쉼은 연결 오류 1번·타임아웃 3번 연속) |
| 근거 문서 | `backend/architecture.md` 1장·7.7(AI 서버 호출 경계) · `features/explore.md` 4.5-5 · `ai-server/README.md` |
| 중요도 | Medium |

## 왜

검색 하이브리드(KAN-238)의 질의 임베딩은 백엔드가 요청 안에서 AI 서버 `POST /embeddings`를 800ms 예산으로 부른다. 넘기면 그 검색은 키워드만으로 응답한다. 개발계 실측(2026-10-23, 개발계 API 컨테이너 → AI 서버):

| 직전 호출 뒤 쉰 시간 | 응답 |
|---|---|
| 0초 | 363ms |
| 5~30초 | 170~190ms |
| 60초 | 491ms |
| 몇 분 | **1564ms** |

트래픽이 적어 대부분 "몇 분 쉰 뒤" 호출이라 예산을 넘기고, 3번 연속 넘기면 백엔드가 30초 쉬어 그동안 검색이 키워드로만 돈다. 개발계 `search_query_logs`(엔진 기록 128건)에서 의미 엔진이 돈 비율은 38%였다. 백엔드 예산을 더 늘리면 검색 자체가 그만큼 느려진다.

원인 후보: `OpenAiEmbeddingClient.embed`가 요청마다 `httpx.post(...)`로 OpenAI에 **새 TLS 연결**을 연다(연결 풀 없음).

## 무엇을 한다

1. 프로세스 수명 동안 공유하는 `httpx.Client`(keep-alive 연결 풀)로 바꾼다. 타임아웃(30초)은 그대로.
2. 유휴 뒤 첫 호출 지연이 남으면 원인을 확인한다(DNS·TLS 재협상·OpenAI 쪽 유휴 연결 종료). 필요하면 주기적 깨우기 등을 검토한다 — 비용은 질의 1건 수 토큰이라 무시할 수준.
3. 위 표와 같은 방법으로 다시 잰다.

## 완료 조건

- Given AI 서버가 몇 분 쉬었다 / When 개발계 API가 `POST /embeddings`를 부른다 / Then 첫 호출이 400ms 안에 온다
- Given 반영 뒤 하루 / When 개발계 `search_query_logs`를 본다 / Then 엔진 기록 중 `semantic` 비율이 90% 이상이다

## 처리 기록

- 2026-10-23 발행(BE — 실측·원인 후보까지).
- 2026-10-25 구현(PR 제출) — ① `OpenAiEmbeddingClient` 가 프로세스 수명의 `httpx.Client`(keep-alive 풀, 유휴 보존 600초 — httpx 기본 5초로는 "몇 분 쉰 뒤"가 늘 새 연결) 를 쓰고 `build_client` 를 `lru_cache` 로 묶어 라우터가 요청마다 불러도 풀은 하나다 ② 유휴 중 깨우기 — 데몬 스레드가 `EMBEDDING_KEEPALIVE_SEC`(기본 55, 0이면 끔) 주기로 `GET /models`(과금 없음)를 보내 OpenAI 쪽 유휴 종료 전에 연결을 살려 둔다(2번 항목을 측정 전에 함께 넣었다 — 풀만으로는 상대 서버의 유휴 종료를 막을 수 없어서). 타임아웃 30초 그대로. 단위 테스트 5건(MockTransport — 요청 경로·헤더·dimensions·index 재정렬·깨우기 실패 무해·스레드 off·인스턴스 공유·설정 파싱). 남은 것: 배포 뒤 재측정(③) — 몇 분 쉰 뒤 `POST /embeddings` 첫 호출 400ms 안, 다음 날 `search_query_logs` semantic 비율.
