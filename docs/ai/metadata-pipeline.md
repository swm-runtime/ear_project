# 메타데이터 부여 파이프라인 (대본 → 추천 메타 · 임베딩)

> 연결 PRD: FR-15 (추천 스코어링 고도화 — 개정 2026-08-26) / 근거: [`drip-scheduling.md`](../features/drip-scheduling.md) 4.2(3축 하이브리드 스코어링) · [`domain.md`](../backend/domain.md) 5.1(추천 메타 4종)·5.6(`content_embeddings`)
> 상위 규칙: [`admin.md`](../features/admin.md) 3.1(업로드 필드) · [`PIPELINE.md`](PIPELINE.md)·[`spec/07`](spec/07-publish.md)(AI 생성 대본의 상류 절차)

> **범위 경계 — 이것은 앱 밖 부여 도구이지 시스템이 아니다** (콘텐츠 파이프라인 [`PIPELINE.md`](PIPELINE.md)와 같은 층).
> 서버 테이블을 만들지 않고, DB에 쓰지 않는다. 산출물은 파일(`enrichment.json`)이며 저장은 관리자 업로드가 한다.
> [`PIPELINE.md`](PIPELINE.md)가 **AI 생성 콘텐츠 전용**인 것과 달리, 이 절차는 **origin(파트너/AI 생성) 무관 전 콘텐츠**에 적용된다 — 추천 스코어링은 origin을 가리지 않기 때문이다.

## 1. 목적 & 연결

발행할 콘텐츠에 추천 스코어링의 입력값을 부여한다. 대본을 입력으로:

1. **추천 메타 4종** — `difficulty`(난이도) · `format`(형식) · `is_evergreen`(시의성/에버그린) · `keywords`(세부 키워드) → `contents` 컬럼(`domain.md` 5.1)
2. **대본 임베딩** — 임베딩 API 호출 결과 벡터 → `content_embeddings`(`domain.md` 5.6)

임베딩은 "무엇에 관한 내용인가"를, 메타 4종은 임베딩이 잘 잡지 못하는 "어떤 수준·형식·수명의 콘텐츠인가"를 담당한다(`drip-scheduling.md` 4.2의 축 분리 근거).

**구현 위치는 `.claude/skills/`다**(`ai/README.md`의 경계 — 스킬로 실행하는 수작업 보조 도구). 서버 자동화(업로드 시 서버가 임베딩 API를 호출하는 구조)는 채택하지 않았다(협의 2026-08-26) — 부여 절차를 앱 밖에 두어 API 키·모델 교체·재실행이 서버 배포와 무관하게 돌아가게 한다.

## 2. 진입 조건

| 트리거 | 설명 |
|---|---|
| 신규 콘텐츠 업로드 준비 | AI 생성: [`spec/07`](spec/07-publish.md) 패키지(`packaged` 전환) 직후 이어서 실행. 파트너: 대본(또는 원문) 확보 시 실행 |
| 재발행 | `content_version`이 오르는 재업로드 전에 재실행 — 미갱신은 운영 콘솔 "추천 입력 결손"에 잡힌다(`drip-scheduling.md` 5) |
| 임베딩 모델 교체 | 발행 콘텐츠 **전량 재실행**(`domain.md` 5.6 — 모델이 섞이면 스코어링 불가) |
| 기존 발행분 소급 부여 | 이 절차 도입(2026-08-26) 이전 발행분에 일괄 실행 |

## 3. 입력값

| 값 | 설명 | 필수 |
|---|---|---|
| script | 대본 전문 (AI 생성: `script.md` — [`spec/04`](spec/04-script.md) 8장 / 파트너: 대본 또는 원문 텍스트) | 필수 — 없으면 4.5 폴백 |
| title · description | 콘텐츠 제목·설명 | 필수 |
| topic_names[] | 부여된 주제 | 필수 — 키워드가 주제의 단순 반복이 되지 않게 대조용 |
| origin | partner / ai_generated | 필수 |

## 4. 처리 로직

### 4.1 전체 흐름

```
[대본 · 제목 · 설명 · 주제]
   ├─ [A] 메타 판정 (LLM)  → difficulty · format · is_evergreen · keywords
   └─ [B] 임베딩 생성 (임베딩 API) → embedding · model
        ↓
[C] enrichment.json 산출  → 관리자 업로드 화면에 첨부(admin.md 3.1)
```

### 4.2 메타 판정 (Phase A)

값 집합은 `domain.md` 5.1의 enum과 글자 단위로 일치해야 한다(어긋나면 업로드 검증에서 거부된다).

| 항목 | 값 | 판정 기준 |
|---|---|---|
| `difficulty` | `beginner` \| `intermediate` \| `advanced` | 청자 전제 지식 기준 — `beginner`: 용어를 풀어 설명하며 사전 지식 불요 / `intermediate`: 기본 용어를 전제 / `advanced`: 실무 경험·선행 지식을 전제. **판정 불능이면 값을 지어내지 않고 비운다**(NULL — 4.5) |
| `format` | `news_analysis` \| `howto` \| `interview` \| `opinion` \| `case_study` \| `overview` | 지배적 서술 형식 하나 — 뉴스·시사 해설 / 방법·실행 안내 / 대담·인용 중심 / 주장·견해 / 사례 분석 / 개괄·입문. 혼합이면 분량 기준 지배 형식 |
| `is_evergreen` | `true` \| `false` | `false`(시의성): 특정 시점의 사건·수치·정책에 묶여 시간이 지나면 유효성이 떨어지는 내용 / `true`: 원리·방법론 중심으로 수명이 긴 내용. [`spec/04`](spec/04-script.md) 6장의 시의성 주제 판정(소스 발행일 명시 대상)과 같은 기준 |
| `keywords` | 문자열 배열 3~8개 | **대본에 실제로 다뤄진** 세부 개념의 명사구(예: "ISA 계좌", "복리 계산"). 주제명(`topic_names[]`)의 단순 반복 금지 — 주제보다 잘게 잡는 것이 존재 이유다(`drip-scheduling.md` 4.2 ②). 대본에 없는 개념을 넣지 않는다(FR-09의 부여판) |

- 키워드 표기는 **NFC 정규화 + 공백 정리**로 통일한다 — 사용자 간 가중치 집계(`user_preference_vectors.keyword_weights`)가 문자열 일치로 묶이므로 표기가 흔들리면 같은 개념이 쪼개진다.
- 판정은 대본 근거로만 한다. 대본 밖 지식으로 값을 보강하지 않는다.

### 4.3 임베딩 생성 (Phase B)

- 입력: **대본 전문**. 모델 입력 한도를 넘으면 청크로 나눠 각각 임베딩 후 **평균 → 정규화**한다(코사인 유사도 전제 — `domain.md` 5.6).
- 모델: **미결**(`domain.md` 15.1 #11). 후보 — OpenAI `text-embedding-3-small`(1536차원, 축소 가능) 등. 확정 전에는 Phase B를 건너뛰고 메타 4종만 산출한다(스코어링은 임베딩 축 제외로 동작 — `drip-scheduling.md` 4.2).
- 산출물에 **모델 식별자를 함께 기록**한다(`content_embeddings.model`). 값 없는 벡터는 만들지 않는다.

### 4.4 산출물 (Phase C) — `enrichment.json`

```json
{
  "difficulty": "beginner",
  "format": "overview",
  "is_evergreen": true,
  "keywords": ["ISA 계좌", "비과세 한도"],
  "embedding": { "model": "<모델 식별자>", "vector": [/* float N개 */] }
}
```

- 관리자 업로드 화면의 **추천 메타 파일 입력**([`admin.md`](../features/admin.md) 3.1)에 첨부한다. 개별 필드를 손으로 입력하는 경로는 없다.
- 판정 불능 항목은 키를 **생략**한다(잘못된 값보다 결손이 낫다 — 결손은 스코어링 중립 처리와 운영 콘솔 노출로 회수된다).
- AI 생성 콘텐츠는 [`spec/07`](spec/07-publish.md) 2장의 `upload-meta.json`과 **별개 파일**로 둔다 — 상류 절차와 이 절차는 실행 시점·재실행 주기가 다르다(재발행·모델 교체는 대본 재작성 없이 이 파일만 다시 만든다).

### 4.5 폴백 — 대본이 없는 콘텐츠

파트너 콘텐츠 중 대본 텍스트를 확보하지 못한 경우:

- 임베딩·키워드는 **제목 + 설명**으로 산출하되, 산출물에 `"source": "title_description"`을 명시한다 — 대본 기반과 품질이 다르다는 사실을 숨기지 않는다.
- `difficulty` · `format`은 제목·설명만으로 판정이 얕으므로 **판정 불능이면 비운다.** 지어내지 않는다.

## 5. 상태 전이 · 운영 노출

사용자 화면이 없으므로 [`features/README.md`](../features/README.md) 규칙에 따라 상태 전이로 대체한다.

```
(대본 확보) → enriched(enrichment.json 산출) → (관리자 업로드로 저장)
                └ partial — 임베딩 모델 미확정·판정 불능 항목 생략 시
```

- **이 상태를 DB에 두지 않는다** — 부여 상태는 파이프라인 운영 DB(`backlog.status`)의 단계가 아니다. 부여 여부의 진실은 저장 결과(`contents`의 메타 4종 · `content_embeddings` 행 존재)다.
- 결손 현황은 편성 배치의 운영 콘솔 항목 **"추천 입력 결손"** 이 노출한다(`drip-scheduling.md` 5) — 이 목록이 곧 재실행 대상이다.

## 6. 데이터 모델

> **스키마는 [`domain.md`](../backend/domain.md)가 유일한 기준이다.** 이 도구는 테이블을 만들지 않고 DB에 쓰지 않는다.

| 테이블 | 이 도구와의 관계 | domain.md |
|---|---|---|
| `contents` | 산출한 메타 4종이 업로드 시 이 행에 저장된다 | 5.1 |
| `content_embeddings` | 산출한 벡터·모델이 업로드 시 이 행이 된다 | 5.6 |
| `topics` | 읽기 전용 참조 — 키워드가 주제 반복이 아닌지 대조 | 4.1 |

## 7. 예외 상황

- **enum에 없는 값이 산출됨** — 산출물을 내지 않고 실패로 처리한다. 업로드 검증까지 가기 전에 이 절차가 막는다.
- **키워드가 3개 미만으로 나옴** — 대본이 얇거나 단일 주제 반복이다. 억지로 채우지 않고 나온 만큼만 낸다(배열 1~2개 허용). 0개면 키를 생략한다.
- **대본이 여러 편(시리즈)** — 편 단위로 각각 실행한다. 시리즈 공통 임베딩은 만들지 않는다(스코어링 단위가 콘텐츠 행이다).
- **임베딩 API 장애** — 메타 4종만 산출하고 임베딩 키를 생략한다(`partial`). 복구 후 재실행하면 임베딩만 채워진다.
- **재발행인데 대본이 안 바뀜**(오디오·썸네일만 교체) — 재실행 생략 가능. 단 `content_embeddings.content_version` 대조가 결손으로 잡으므로, 업로드 시 기존 임베딩의 `content_version`을 올려 갱신하는 것은 서버 몫이다(백엔드 구현 시 확정 — 미결).

## 8. 완료 조건

- Given 대본이 있는 콘텐츠(origin 무관) / When 파이프라인을 실행한다 / Then `difficulty` · `format` · `is_evergreen` · `keywords`가 `domain.md` 5.1의 enum·형식에 맞는 `enrichment.json`이 산출된다
- Given 파트너 콘텐츠의 대본 / When 파이프라인을 실행한다 / Then AI 생성 콘텐츠와 동일한 절차·산출물 형식으로 처리된다
- Given 대본에 다뤄지지 않은 개념 / When 키워드를 산출한다 / Then 해당 개념은 키워드에 포함되지 않는다
- Given 임베딩 모델이 미확정인 상태 / When 파이프라인을 실행한다 / Then 메타 4종만 담긴 산출물이 나오고 `embedding` 키는 없다
- Given 판정 불능인 항목(대본 없음 등) / When 산출물을 만든다 / Then 해당 키가 생략되고, 지어낸 값이 들어가지 않는다
- Given 산출물을 첨부한 관리자 업로드 / When 업로드가 완료된다 / Then `contents`의 메타 4종과 `content_embeddings` 행이 저장되고, 편성 배치 스코어링이 이 값들을 읽는다(`drip-scheduling.md` 4.2)

## 미결 사항

- **임베딩 모델·차원** — `domain.md` 15.1 #11과 같은 항목. 확정 전에는 Phase B 생략(4.3).
- **enum 값 집합의 검증** — `difficulty` 3값 · `format` 6값은 초기값이다(`domain.md` 5.1). 초기 콘텐츠 N건 부여 후 분포를 보고 조정한다(한 값에 몰리면 구분력이 없는 것이다).
- **키워드 정규화의 소유** — 4.2의 NFC·공백 정리를 이 도구가 하는 것으로 시작하되, 서버 저장 시점 재정규화(검색의 `explore.md` 4.5-5와 같은 층)를 둘지 백엔드 구현 시 확정.
- **재발행 시 대본 무변경 판정**(7장) — 임베딩 `content_version` 갱신 주체를 서버로 할지 재실행으로 할지.
- **기존 발행분 소급 실행의 시점** — 모델 확정 후 일괄 실행이 효율적(모델 미확정 상태에서 소급하면 메타만 두 번 작업).
