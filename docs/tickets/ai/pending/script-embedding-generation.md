# [AI] 파이프라인 `enrich` 단계에 대본 임베딩 생성(Phase B)을 넣는다

| 항목 | 값 |
|---|---|
| 대상 | `pipeline/apps/worker/src/stages/enrich.ts` · `pipeline/apps/worker/src/config.ts` · `pipeline/deploy/docker-compose.prod.yml`(worker env) |
| 요청 파트 | AI(파이프라인) |
| 요청자 | 박준현(백엔드·인프라) |
| 발행 날짜 | 2026-09-22 |
| 시작 날짜 | 2026-09-22 |
| 기한 | 2026-09-25 (Medium — 3일) |
| 선행 | 티켓 선행 없음. **티켓이 아닌 선행 1건** — 운영 AI 서버 `env.ai-server`에 `EMBEDDING_PROVIDER=openai`·`OPENAI_API_KEY`·`EMBEDDING_MODEL=text-embedding-3-small`이 실제로 들어 있는지 확인(담당: 박준현·인프라 / 상태: **미확인**. AI 서버 SSH가 infra IP로만 열려 있어 저장소에서 확인할 수 없다. 확인 방법은 아래 "선행 확인 방법" 참조). 기본값이 `stub`이라 누락 시 코드를 다 넣어도 `dev-stub` 벡터만 나온다 |
| Jira | [KAN-89](https://runtime364.atlassian.net/browse/KAN-89) (담당: 박수헌) |
| 발견 시점 | 2026-09-22 — "대본 임베딩 코드가 다 구현돼 있는가" 확인 중. 양 끝(AI 서버 생성 API·백엔드 저장/스코어링)은 완성돼 있고 **가운데(파이프라인의 호출)만 비어 있었다** |
| 근거 문서 | `ai/metadata-pipeline.md` 4.1·4.3·4.4·5장 · `backend/domain.md` 5.6 · `features/drip-scheduling.md` 4.2 · `ai-server/README.md` |
| 중요도 | **Medium** — 추천 3축 중 **가중치가 가장 큰 임베딩 축(0.4)이 통째로 빠진 채** 편성이 돌고 있다. 오류는 나지 않고 결여 축 재정규화로 신호·메타 2축만 쓴다(`drip-scheduling.md` 4.2). 서비스가 멈추는 문제는 아니지만 추천 품질에 직접 영향이다 |
| 상태 | 대기 |

## 문제

`enrich` 단계는 Phase A(메타 판정)와 Phase C(`enrichment.json` 산출)를 수행하지만 **Phase B(임베딩 생성)를 건너뛴다.** 파일 상단 주석에 사유가 적혀 있다.

```
- 임베딩(Phase B)은 모델 미확정이라 생략(스킬과 같음).
```

**이 사유는 이미 유효하지 않다.** 모델은 2026-09-01에 `text-embedding-3-small` · 1536차원으로 확정됐고(`domain.md` 15.1 #11 해소), 저장처인 `content_embeddings` 마이그레이션도 나갔다. `metadata-pipeline.md` 4.3의 "서버 쪽 저장이 나가기 전까지는 Phase B를 건너뛰어도 된다"는 단서도 같은 이유로 수명이 끝났다(이 티켓 처리 시 함께 정리 — 아래 "함께 할 일").

결과적으로 `enrichment.json`에 `embedding` 키가 한 번도 실리지 않았고, `content_embeddings`에 행이 쌓이지 않았다.

## 이미 되어 있는 것 (새로 만들 필요 없음)

| 구간 | 위치 | 상태 |
|---|---|---|
| 임베딩 생성 API | `ai-server/app/api/embeddings.py` — `POST /embeddings` | **완성.** 청킹·평균 풀링·L2 정규화까지 서버 안에서 처리된다. 계약 테스트 있음 |
| 업로드 검증 | `backend/src/modules/admin/enrichment-file.ts` — `parseEmbedding` | **완성** |
| 저장 | `backend/src/modules/content/services/content.service.ts` — `applyEnrichment` → `ContentEmbeddingRepository.upsert` | **완성.** 콘텐츠당 1행 전체 교체 |
| 스코어링 소비 | `findScorableEmbeddings` → `drip-scoring.service.ts` | **완성.** 현재 모델·현재 `content_version` 행만 읽는다 |

**백엔드·AI 서버 코드는 수정 대상이 아니다.** 이 티켓의 범위는 파이프라인 워커뿐이다.

## 요청 내용

### 1. 워커 → AI 서버 호출 배선

현재 워커에는 AI 서버를 부르는 설정이 **하나도 없다**(`config.ts`에 관련 env 없음).

- worker env에 AI 서버 주소와 내부 토큰을 추가한다. 두 서비스가 같은 compose에 있으므로 주소는 `http://ai-server:8000`이면 되고 네트워크는 이미 닿는다.
- 엔드포인트는 `X-Internal-Token` 헤더를 요구한다(`verify_internal_token`). 값은 `env.ai-server`의 `INTERNAL_AUTH_TOKEN`과 같아야 한다.
- 키가 비어 있으면 임베딩만 생략한다 — 썸네일 단계가 `OPENAI_API_KEY` 없을 때 작업을 집지 않는 것과 같은 방식으로, **메타 부여 자체는 계속 되어야 한다.**

### 2. `enrich.ts`에 Phase B 추가

- 입력은 **대본 전문**(`episodes/<id>/script.md`). 대본이 없으면 **제목 + 설명**으로 산출하고 `source: "title_description"`을 남긴다(`metadata-pipeline.md` 4.5 — 현재 메타 판정의 폴백과 같은 분기).
- 응답 `{ model, dim, vector }`를 `enrichment.json`의 `embedding` 키에 **그대로** 담는다. 워커가 벡터를 가공하지 않는다(정규화 규칙이 호출자마다 갈리면 벡터가 비교 불가능해진다 — `domain.md` 5.6).
- `.report.json`에 임베딩 성공 여부·모델·차원을 남긴다. 기존 `warnings`와 같은 자리면 된다.

### 3. **잘못된 임베딩은 키를 빼고 내보낸다 — 이 티켓에서 가장 중요한 지점**

`parseEnrichmentFile`은 `embedding` 키 하나가 검증에 걸리면 **파일 전체를 거부한다.** 즉 임베딩이 잘못 실리면 **난이도·형식·시의성·키워드·청자 5종까지 통째로 버려진다.** 지금은 키가 없어서 조용히 통과하고 있을 뿐이다.

거부 조건은 셋이다.

| 조건 | 값 |
|---|---|
| `model` | `text-embedding-3-small`과 **글자 단위로 일치**해야 한다 |
| `dim` | 1536 (있으면 검사, 없으면 통과) |
| `vector` | **유한한** 숫자 정확히 1536개 배열 |

그래서 워커는 이렇게 동작해야 한다.

- **AI 서버가 stub 응답(`model: "dev-stub"`)을 주면 `embedding` 키를 빼고 파일을 쓴다.** stub은 의미 유사도가 없는 결정적 더미 벡터라 애초에 운영 저장 대상이 아니고(`metadata-pipeline.md` 4.3), 실으면 파일 전체가 거부된다.
- **임베딩 호출 실패가 `enrich` 작업 전체를 실패시키지 않는다.** 메타는 내보내고 임베딩만 생략한다 — 명세 5장의 `partial` 상태가 정확히 이 경우다.
- 응답 차원이 1536이 아니면 같은 처리(키 생략 + 경고).

### 4. 기존 발행분 소급

현재 발행 콘텐츠에는 임베딩이 하나도 없다. 위가 동작하면 **콘텐츠 모드**(`{ content_id, ... }`)로 전량 재실행해 `datasets/enrichment/<content_id>.json`을 만들고, 콘솔 [반영]로 업로드한다. 편수가 적어(발행분 약 15편) 일괄 실행 부담은 없다.

## 범위 밖

- 백엔드·AI 서버 코드 수정 — 위 "이미 되어 있는 것" 참조. 필요가 생기면 별도 티켓으로 넘긴다.
- 임베딩 모델 교체 절차 — 교체 시 전량 재생성이 필요하다는 규칙은 `domain.md` 5.6에 이미 있다.
- 재발행(`content_version` 상승) 시 임베딩 재생성 누락 감지 — 운영 콘솔 "추천 입력 결손"이 소유한다(`drip-scheduling.md` 5장).

## 함께 할 일 (문서)

낡은 서술 두 곳을 이 티켓의 PR에서 함께 고친다. `docs/`는 `changes/` 경유 대상이므로 수정 내용을 `changes/pending/`에 먼저 기록한다.

- `ai/metadata-pipeline.md` 4.3 — "서버 쪽 저장(`content_embeddings` 마이그레이션)이 나가기 전까지는 Phase B 산출물이 저장처 없이 대기하므로, 그동안은 건너뛰어도 된다" 삭제. 마이그레이션은 나갔다.
- `enrich.ts` 상단 주석 — "임베딩(Phase B)은 모델 미확정이라 생략" 삭제(코드 주석이라 `changes/` 대상이 아니다).

## 완료 조건

- Given 대본이 있는 에피소드 / When `enrich` 작업이 돈다 / Then `episodes/<id>/enrichment.json`에 `embedding: { model: "text-embedding-3-small", dim: 1536, vector: [...] }`이 실린다
- Given 그 파일 / When 관리자 업로드로 발행한다 / Then 거부되지 않고 `content_embeddings`에 행이 1건 생기며 `model`·`content_version`이 현재 값과 일치한다
- Given AI 서버가 `EMBEDDING_PROVIDER=stub`으로 떠 있다 / When `enrich`가 돈다 / Then 산출물에 `embedding` 키가 **없고**, 메타 5종은 정상으로 실리며, 리포트에 생략 사유가 남는다
- Given AI 서버가 응답하지 않는다(타임아웃·5xx) / When `enrich`가 돈다 / Then 작업은 **성공**으로 끝나고 메타 5종이 실리며, 리포트에 실패가 남는다
- Given 대본이 없는 콘텐츠 / When `enrich`가 돈다 / Then 제목+설명으로 임베딩을 산출하고 `source: "title_description"`이 함께 실린다
- Given 발행분 전량 소급 실행 후 / When 편성 배치가 돈다 / Then 임베딩 축이 결여 재정규화 없이 동작한다(추천 검증 페이지에서 "임베딩 없음"이 사라진다)

## 선행 확인 방법 (인프라)

AI 서버는 `/health`에 **비밀값 없이** 현재 provider·model을 싣는다(`ai-server/app/main.py`).

```json
{ "status": "ok", "provider": "openai", "model": "text-embedding-3-small" }
```

`:8000`은 공개 도메인이 없고 SG가 소스를 제품 SG로 한정하므로 **API EC2에서 호출한다.**

```bash
ssh -i ~/.ssh/ear-prod-isb.pem ec2-user@ec2-43-203-57-240.ap-northeast-2.compute.amazonaws.com \
  'curl -s http://54.116.31.183:8000/health'
```

`provider`가 `stub`으로 나오면 서버의 `env.ai-server`에 `EMBEDDING_PROVIDER=openai`·`OPENAI_API_KEY`·`EMBEDDING_MODEL=text-embedding-3-small`을 채우고 `ai-server` 컨테이너를 재기동한다. 결과를 이 티켓의 처리 기록과 Jira 코멘트에 남긴다.

## 처리 기록

- 2026-09-22 발행. Jira KAN-89(담당 박수헌·AI). 선행인 운영 env 확인은 인프라(박준현) 몫으로 분리했다 — 위 "선행 확인 방법".
