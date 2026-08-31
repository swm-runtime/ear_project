# ai-server — 이어 AI 서버

앱 밖 모델 추론을 담당하는 파트다(`docs/backend/architecture.md` 1장 — 모델 추론은 AI 서버 내부).
현재 제공하는 것은 **임베딩 API 하나**이며, 대본 생성·QA·TTS가 이후 여기에 추가된다.

| 경로 | 인증 | 설명 |
|---|---|---|
| `POST /embeddings` | `X-Internal-Token` 헤더 | 대본 텍스트 → 단위 벡터(청킹·평균·L2 정규화 포함). 응답 `{ model, dim, vector }`는 `enrichment.json`의 `embedding` 키와 같은 모양(`docs/ai/metadata-pipeline.md` 4.4) |
| `GET /health` | 없음 | 인프라 헬스체크 |

**호출자**: 메타데이터 부여 파이프라인 스킬(`docs/ai/metadata-pipeline.md` 4.3 Phase B), 추후 Backend(재발행·소급 일괄 재생성). 사용자 앱·클라이언트는 이 서버를 직접 부르지 않는다.

## 실행

```bash
cd ai-server
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt          # 테스트까지 돌리려면 -r requirements-dev.txt 추가
cp .env.example .env                     # 값 채우기 (아래 표)
set -a; . ./.env; set +a
uvicorn app.main:app --host 0.0.0.0 --port 8000
curl -s localhost:8000/health            # {"status":"ok",...}
```

테스트: `pytest`

## 환경 변수

env 검증은 기동 시점에 하고, 누락이면 **기동을 실패시킨다**(`app/config.py` — `backend/architecture.md` 9.5와 같은 원칙).

| 변수 | 필수 | 설명 |
|---|---|---|
| `INTERNAL_AUTH_TOKEN` | ✅ | 내부 호출 인증 토큰. 호출자(스킬·Backend)와 공유 |
| `EMBEDDING_PROVIDER` | 기본 `stub` | `stub`(개발 검증용 결정적 벡터 — **운영 저장 금지**) / `openai` |
| `EMBEDDING_MODEL` | `openai`면 ✅ | 모델 식별자 — **모델 선택의 유일한 소유자가 이 env다**(`docs/backend/domain.md` 15.1 #11). 교체 시 발행분 전량 재생성 |
| `EMBEDDING_DIM` | 선택 | 벡터 차원. `openai`에서 주면 `dimensions`로 전달(차원 축소), `stub` 기본 256 |
| `EMBEDDING_CHUNK_CHARS` | 기본 4000 | 청킹 문자 한도 — 초과 시 청크 임베딩 후 평균→정규화(`docs/ai/metadata-pipeline.md` 4.3) |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` | `openai`면 ✅ / 선택 | 제공자 자격·엔드포인트 |

## 경계

- **DB에 쓰지 않는다.** 벡터 저장(`content_embeddings`, pgvector)은 Backend 몫이다(`architecture.md` 1장 경계 원칙).
- **모델은 OpenAI `text-embedding-3-small` · 1536차원으로 확정됐다**(2026-09-01 — `domain.md` 15.1 #11 해소). env 기본 템플릿(.env.example)이 그 값이다. `stub` 제공자는 키 없는 로컬 검증용으로만 남는다 — stub 벡터를 `content_embeddings`에 넣지 않는다.
- 배포·등록 절차: `docs/tickets/infra/pending/ai-server-deployment.md`
