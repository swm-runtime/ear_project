# [INFRA] AI 서버 등록 — 임베딩 API (`ai-server/`) 배포

| 항목 | 값 |
|---|---|
| 대상 | 신규 파트 `ai-server/`(Python·FastAPI)의 컨테이너 배포·환경변수 주입·접근 제어. 코드는 완성돼 있고 **등록·운영 결정이 본체**다 |
| 요청 파트 | 백엔드 (추천 고도화 — AI 서버 신설 협의 2026-09-01) |
| 발행 날짜 | 2026-09-01 |
| 발견 시점 | 2026-09-01 임베딩 생성 위치 협의 — "모델 추론은 AI 서버 내부"(`backend/architecture.md` 1장) 원칙에 따라 NestJS가 아니라 별도 AI 서버로 확정. 대본 생성용 AI 서버 계획과 같은 서버를 쓴다 |
| 근거 문서 | `ai-server/README.md`(실행·env·경계) · `backend/architecture.md` 1장(모델 추론 경계)·9.5(내부 인증) · `docs/ai/metadata-pipeline.md` 4.3(호출자) · `domain.md` 15.1 #11(모델 미결) |
| 심각도 | **중** — 추천 자체는 이 서버 없이 동작한다(임베딩 축 제외 재정규화 — `drip-scheduling.md` 4.2). 다만 **임베딩 축을 켜는 경로의 첫 관문**이고, 대본 생성 AI 서버를 어차피 띄울 계획이므로 그때 함께 올리는 것이 효율적이다 |
| 상태 | pending |

## 배경

추천 스코어링 3축 중 임베딩 유사도 축(결정 51)의 입력을 만드는 서버다. 임베딩은 모델 추론이라 NestJS(서비스 서버)에 두지 않고 AI 서버로 분리했다 — API 키·모델 교체·전량 재생성이 서비스 배포와 무관해야 한다. 같은 서버가 이후 대본 생성·QA·TTS 엔드포인트를 담게 된다.

**모델은 OpenAI `text-embedding-3-small` · 1536차원으로 확정됐다**(2026-09-01 — `domain.md` 15.1 #11 해소). 운영 기동은 `openai` 제공자로 하며, **OpenAI API 키 주입이 필요하다.** 임베딩 축이 실제로 켜지는 것은 백엔드 저장(`content_embeddings` 마이그레이션) 이후다.

## 등록 방법 (이대로 하면 뜬다)

1. **빌드·기동** — `ai-server/Dockerfile` 기준:

   ```bash
   docker build -t ear-ai-server ai-server/
   docker run -d --env-file <env파일> -p 8000:8000 ear-ai-server
   ```

   컨테이너 없이 올리면: `pip install -r requirements.txt` 후 `uvicorn app.main:app --host 0.0.0.0 --port 8000` (Python 3.12+).

2. **환경변수** — 누락 시 **기동이 실패한다**(의도된 동작 — `backend/architecture.md` 9.5). 실값은 저장소에 커밋하지 않는다:

   | 변수 | 지금 값 | 비고 |
   |---|---|---|
   | `INTERNAL_AUTH_TOKEN` | **infra가 발급** (충분히 긴 랜덤 문자열) | 호출자(백엔드 담당의 부여 스킬, 추후 NestJS)와 공유 필요 — 발급 후 백엔드 담당에게 전달 |
   | `EMBEDDING_PROVIDER` | `openai` | 확정값 (2026-09-01) |
   | `EMBEDDING_MODEL` / `EMBEDDING_DIM` | `text-embedding-3-small` / `1536` | 확정값 — 임의 변경 금지(`domain.md` 15.1 #11 — 교체는 발행분 전량 재생성을 동반) |
   | `OPENAI_API_KEY` | **infra가 시크릿으로 주입** | 키 발급·보관 주체 협의 필요 — 저장소·이미지에 넣지 않는다 |
   | `EMBEDDING_CHUNK_CHARS` | 비움(기본 4000) | |

3. **헬스체크** — `GET /health` → `{"status":"ok","provider":"stub","model":"dev-stub"}`. 로드밸런서·모니터링 대상 경로다.

4. **접근 제어** — 이 서버는 **내부 전용**이다. 사용자 앱이 직접 부르지 않으므로 공개 도메인이 필요 없다. 전 엔드포인트(`/health` 제외)가 `X-Internal-Token` 헤더를 요구하지만, 그것과 별개로 네트워크 수준 제한을 권장한다. **단, 호출자 중 하나가 개발자 로컬에서 도는 스킬**이라 완전 폐쇄망이면 스킬이 못 부른다 — 아래 "결정 필요" 참조.

5. **리소스** — 경량이다. 현재는 외부 임베딩 API 프록시 + 벡터 산술 수준이라 최소 사양이면 된다. 대본 생성(LLM 호출)·TTS가 추가될 때 재산정한다.

## 결정 필요 (infra 판단 요청)

- **스킬(개발자 로컬)의 접근 경로** — 선택지: ① API 서버와 같은 망에 두고 개발자는 VPN/SSH 터널로 접근 ② 공개 리슨 + `INTERNAL_AUTH_TOKEN` + IP 제한. 임베딩은 대본이 오가는 경로라(파트너 저작물 — `architecture.md` 9.4) HTTPS 종단이 필요하면 ②에서도 TLS 프록시를 앞에 둔다.
- **backend API 서버와의 배치 관계** — 추후 NestJS가 이 서버를 부르므로(`architecture.md` 1장) 같은 네트워크/VPC가 편하다. `tickets/backend/pending/api-server-deployment.md`(API 서버 배포)와 함께 보면 좋다.

## 완료 조건

- Given 배포된 AI 서버 / When `GET /health`를 조회한다 / Then 200과 `{"status":"ok"}`가 반환된다
- Given 공유된 `INTERNAL_AUTH_TOKEN` / When `POST /embeddings`에 `X-Internal-Token` 헤더와 `{"text":"아무 대본"}`을 보낸다 / Then 200과 `{ model, dim, vector }`(단위 벡터)가 반환된다
- Given 토큰이 없거나 틀린 요청 / When 같은 호출을 한다 / Then 401이 반환된다
- Given 필수 env(`INTERNAL_AUTH_TOKEN`)가 빠진 기동 / When 컨테이너를 올린다 / Then 기동이 실패한다(조용히 뜨지 않는다)
- Given 발급된 토큰·접속 주소 / When 백엔드 담당에게 전달된다 / Then 부여 스킬이 로컬에서 위 호출을 재현할 수 있다

## 진행 기록

- 2026-09-01 — 발행. 코드·테스트는 `feat(ai)/embedding-server` 브랜치에서 완성(로컬 uvicorn 기동·계약 테스트 통과). 모델 확정 시 env 3종 교체 + 발행분 전량 재생성은 별도 티켓(`tickets/backend/pending/metadata-pipeline-after-script-quality.md`)이 다룬다.
