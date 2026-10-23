/**
 * 검색 랭킹의 매칭 필드 가중치 (`explore.md` 4.5-5 — 확정 2026-08-23, 해시태그 추가 2026-10-16 KAN-218).
 *
 * 우선순위(제목 > 태그 > 저자 > 주제명 > 설명)는 문서가 확정했고 **계수 값은 서버 구현이
 * 소유한다** — 그래서 계약이 아니라 여기에 있다. 2의 거듭제곱으로 두는 이유는
 * **상위 필드 단독 매칭(16)이 하위 필드 전부의 조합(8+4+2+1=15)보다 항상 크게** 만들어,
 * 가중 합산이 문서의 우선순위를 정확히 재현하게 하기 위해서다. 태그는 내용을 요약해 붙인 값이라 저자보다 관련도
 * 신호가 강하다.
 */
export const SEARCH_WEIGHT_TITLE = 16;
export const SEARCH_WEIGHT_TAG = 8;
export const SEARCH_WEIGHT_AUTHOR = 4;
export const SEARCH_WEIGHT_TOPIC = 2;
export const SEARCH_WEIGHT_DESCRIPTION = 1;

/**
 * domain.md 5.6 — 현재 임베딩 모델 식별자 (확정 2026-09-01, 15.1 #11 해소).
 *
 * 스코어링은 이 모델의 벡터만 읽는다 — "서로 다른 모델의 벡터는 비교 불가하므로 `model`이
 * 섞인 상태로 스코어링하지 않는다"(5.6)를 조회 조건으로 보장한다. 모델을 교체하면 이 값을
 * 함께 바꾸고, 전량 재생성이 끝날 때까지 구 모델 행은 자연히 축 제외(중립 처리)가 된다.
 * 개발 스텁이 만드는 `"dev-stub"` 벡터도 같은 조건으로 걸러진다.
 */
export const EMBEDDING_MODEL_ID = 'text-embedding-3-small';

/** domain.md 5.6 — `vector(1536)` 확정 차원. 업로드 검증과 스키마가 같은 값을 봐야 한다 */
export const EMBEDDING_DIM = 1536;

/**
 * 검색 하이브리드(KAN-238 — `explore.md` 4.5-5)의 RRF 상수 `k`. 편마다 `Σ 1/(k + 엔진 내 순위)`.
 * 60은 RRF 원 논문(Cormack 2009)의 기본값이고, 순위 1과 10의 차이(1/61 vs 1/70)를 완만하게 만들어 한 엔진의 상위가
 * 다른 엔진의 결과를 통째로 밀어내지 않게 한다. **계약에 적지 않는다** — 검색 로그(4.21)로 조정한다.
 */
export const SEARCH_RRF_K = 60;

/**
 * 의미 엔진의 코사인 유사도 하한(`1 - (embedding <=> 질의 벡터)`). 시작값 0.3의 근거: text-embedding-3-small은 무관한
 * 한국어 텍스트끼리도 코사인 0.1~0.2대가 흔하고, 짧은 질의("이직")와 같은 주제의 대본 전문은 0.3~0.5대에 모인다 —
 * 0.3 아래는 "아무거나 조금 닮음"이라 결과를 채우는 소음이 된다. 상위 K로 한 번 더 자르므로 하한은 소음 차단만 맡는다.
 * 미스율·`rescued`(4.21)를 보고 조정한다.
 */
export const SEARCH_SEMANTIC_MIN_SIMILARITY = 0.3;

/**
 * 의미 엔진의 **제목 임베딩**(`content_title_embeddings`) 코사인 하한. 2026-10-22 개발계 실측(199편 · 질의 30개 — 짧은 말 25 ·
 * 문장 5, `scripts/measure-search-embeddings.js`)에서 제목 벡터의 (질의, 편) 쌍 F1이 0.34에서 가장 높다(정밀도 0.51 · 재현율
 * 0.40 — 같은 표에서 대본 벡터는 최고 F1 0.26). 관련 편 최고점의 중앙값이 0.40, 무관 편 최고점의 중앙값이 0.31이라 그 사이다.
 * **계약에 적지 않는다** — 검색 로그(4.21)로 조정한다.
 */
export const SEARCH_SEMANTIC_TITLE_MIN_SIMILARITY = 0.34;

/**
 * 제목 임베딩이 **있는** 편의 대본 임베딩 하한. 제목 벡터가 있으면 대본 벡터는 "아주 가까울 때만" 더한다 — 같은 실측에서 대본
 * 0.45 미만은 무관 편이 대부분이었고(0.30 이상 쌍의 정밀도 0.16), 0.45 이상만 더하면 제목 단독보다 F1이 약간 오른다(0.450 → 0.454).
 * 제목 벡터가 **없는** 편(생성 실패·백필 전)은 종전 하한(`SEARCH_SEMANTIC_MIN_SIMILARITY`)을 그대로 쓴다 — 백필 전 검색은 종전과 같다.
 */
export const SEARCH_SEMANTIC_SCRIPT_MIN_SIMILARITY_WITH_TITLE = 0.45;

/**
 * 제목 임베딩 생성 요청(발행·재발행 훅, 백필)의 타임아웃. 질의 임베딩(800ms)과 달리 사용자를 기다리게 하지 않는 경로라 넉넉히 둔다 —
 * 넘기면 그 편은 행 없이 남고(검색은 대본 벡터만 본다) 백필이 다시 채운다
 */
export const TITLE_EMBEDDING_TIMEOUT_MS = 10_000;

/** 백필의 요청 간격 기본값 — 초당 5건. AI 서버(→ OpenAI)에 몰아 보내지 않는다 */
export const TITLE_EMBEDDING_BACKFILL_DELAY_MS = 200;

/**
 * 관련 콘텐츠(`GET /contents/:content_id/related` — KAN-240, `player-api.md` 4.8)의 코사인 유사도 하한. 기준 편과 후보 편의
 * 대본 임베딩 `1 - (embedding <=> 기준 벡터)`가 **이 값 이하이면 뺀다.** 시작값 0.3은 검색 의미 엔진 하한
 * (`SEARCH_SEMANTIC_MIN_SIMILARITY`)과 같은 근거다 — text-embedding-3-small은 무관한 한국어 텍스트끼리도 0.1~0.2대가 흔하다.
 * 대본 전문끼리라 같은 주제면 질의-대본보다 높게 모인다. **계약에 적지 않는다** — 추천 블록 반응을 보고 조정한다.
 */
export const RELATED_CONTENT_MIN_SIMILARITY = 0.3;

/** 의미 엔진이 RRF에 넘기는 상위 건수 — 키워드 엔진은 자르지 않는다(종전 결과를 전부 담는다) */
export const SEARCH_SEMANTIC_TOP_K = 50;

/**
 * 오타 교정어 점수(자모 편집 유사도 `1 − 자모 편집 거리 / 긴 쪽 자모 수` — `jamoEditSimilarity`)의 하한.
 *
 * 0.7은 실측(2026-10-22, 로컬 en_US.utf8)으로 고른 값이다. 고쳐야 할 오타는 자모 하나~둘 차이로 **0.778 이상**이다 —
 * 네트웍→네트워크 0.778 · 커리오→커리어 0.833 · 면졉→면접 0.833 · 겅제→경제 0.8 · 운영체재→운영체제 0.9. 거꾸로 고치면
 * 안 되는 후보는 **0.667 이하**다 — 겅제→거의·정제 0.6, 운영체재→운영 0.6, 6자모 말의 자모 둘 차이 0.667. 그 사이에서
 * "자모 셋 중 하나 넘게 틀리면 다른 말"로 0.7을 둔다. 종전 `word_similarity ≥ 0.5`는 비대칭(질의가 어휘의 일부와 닮으면
 * 높다)이라 겅제→거의(0.5, 경제는 0.333)·"커리어 없는말"→커리어를 골랐다. 로그(4.21의 `corrected`·`correction_rejected`)로
 * 조정한다 — 값은 서버 구현이 소유한다.
 */
export const SEARCH_CORRECTION_MIN_SCORE = 0.7;

/**
 * 교정어 후보 수 상한 — SQL이 자모 트라이그램 `similarity`(대칭)가 0보다 큰(트라이그램 하나라도 겹치는) 어휘를 유사도순으로
 * 이만큼만 넘기고, 애플리케이션이 편집 유사도로 재채점한다. 트라이그램은 **점수가 아니라 후보 줄이기**다 — 점수 0.7 이상인
 * 오타 변형 7,793건(무작위 2~5음절 말의 자모 1~2개 바꿈·받침 넣고 빼기, 2026-10-22 로컬 실측)의 `similarity`는 최소
 * 0.143이었고 0인 건이 없었다. 고정 하한(예: 0.2)을 두면 그런 오타를 놓친다.
 */
export const SEARCH_CORRECTION_CANDIDATE_LIMIT = 200;

/**
 * 교정어 길이 가드 — 어휘의 글자 수(공백 포함)가 질의와 **±1 안**이어야 후보다. 오타 교정은 "같은 말을 잘못 친 것"이라
 * 길이가 거의 같다(네트웍 3자 → 네트워크 4자). 여러 단어 질의("커리어 없는말", 7자)가 짧은 어휘("커리어")로 줄어드는 것을
 * 여기서 막는다 — 여러 단어 질의는 통째로 닮은 어휘(시리즈 제목·띄어 쓴 태그)가 있을 때만 고친다.
 */
export const SEARCH_CORRECTION_MAX_LENGTH_DIFF = 1;

/**
 * 교정어 어휘에서 제목 토큰 끝의 조사를 뗀다(을/를/이/가/은/는/의/에/로/와/과/도). 뗀 뒤 2자 이상일 때만 뗀다 —
 * "나이"·"사이"가 "나"·"사"가 되지 않는다. Postgres 정규식(ARE)으로 쓴다.
 */
export const SEARCH_CORRECTION_PARTICLE_PATTERN =
  '^(.{2,})(을|를|이|가|은|는|의|에|로|와|과|도)$';

/** 교정어 어휘 최소 길이 — 1자 어휘는 무엇과도 비슷해진다 */
export const SEARCH_CORRECTION_MIN_TERM_LENGTH = 2;

/**
 * `enrichment.json` 형식 버전(metadata-pipeline.md 4.4). 파일이 이 값보다 낮으면 구형 판정으로 만든
 * 메타다 — 어드민이 `enrichment_schema_version`으로 재부여 대상을 고른다.
 *   1 — 메타 4종 + 임베딩 (2026-08-26)
 *   2 — `target_audiences`(직군·연차 청자 세트) 추가 (2026-09-11)
 *   3 — `tags`(화면 해시태그) 추가 (2026-10-08, KAN-162)
 */
export const CURRENT_ENRICHMENT_SCHEMA_VERSION = 3;

/**
 * 화면 해시태그(`tags`) 규칙 — metadata-pipeline.md 4.2. 탐색 카드·상세 화면에 "#태그"로 보이는 말이라
 * 개수와 모양을 서버가 막는다: 2~4개, '#' 없는 한글·영문·숫자 2~20자(안쪽 공백 허용 — "Stray Kids"·"Squid Game" 같은 영어
 * 고유명사를 받기 위해 2026-10-14 완화, `global-api.md` 4.9. 앞뒤 공백 금지), 대소문자 무시 중복 없음. 종전 규칙(공백 없는 2~10자)의 상위 집합이라
 * 기존 KR 태그는 전부 통과한다.
 */
export const MIN_CONTENT_TAGS = 2;
export const MAX_CONTENT_TAGS = 4;
export const CONTENT_TAG_PATTERN =
  /^[가-힣A-Za-z0-9][가-힣A-Za-z0-9 ]{0,18}[가-힣A-Za-z0-9]$/;

/** 청자 세트 상한 — 직군 7 × 연차 4 = 28 조합 중 "이 콘텐츠가 맞는" 것만 고르게 한다 */
export const MAX_TARGET_AUDIENCES = 8;

/**
 * 회수 동기화(`GET /contents/withdrawn`) 한 응답의 상한.
 *
 * **`since`가 클라이언트 값이라 상한이 없으면 전 구간 스캔이 된다** — `1970-01-01`을 보내면
 * 회수된 콘텐츠 전부가 페이징 없이 내려온다(`architecture.md` 9.3 — 목록 조회는 서버가
 * `limit`을 강제한다). 잘렸다는 사실은 응답이 알려주고, 클라이언트는 마지막 회수 시각을
 * 다음 `since`로 써서 이어 받는다.
 */
export const WITHDRAWN_SYNC_MAX_LIMIT = 200;

/**
 * 검색 질의 로그의 **타이핑 묶음 창**(domain.md 5.7). 같은 사용자의 직전 행이 이 안에 있고 두 질의가
 * 자모 단위 접두사 관계("커리" ↔ "커리어", "커링" ↔ "커리어")면 새 행을 만들지 않고 직전 행을 덮어쓴다.
 * 디바운스 300ms 로 한 단어를 치는 데 몇 초면 충분하고, 이보다 길게 멈췄다 이어 치면 다른 검색으로 본다
 */
export const SEARCH_QUERY_LOG_MERGE_WINDOW_MS = 10_000;

/**
 * 검색 질의 로그의 **재조회 창**(domain.md 5.7). 직전 행과 질의·주제 필터 수가 같은 요청이 이 안에 오면
 * 새 검색이 아니라 같은 검색의 재조회로 보고 아무것도 쓰지 않는다 — 앱은 재생 시작·포그라운드 복귀 때
 * 탐색 쿼리를 통째로 다시 부른다. 결과 반응 창(10분)과 같은 길이다: 반응을 재는 동안에는 그 행을 건드리지 않는다
 */
export const SEARCH_QUERY_LOG_REFETCH_WINDOW_MS = 10 * 60_000;

/** 어드민 요약(`admin-api.md` 4.21)의 집계 창 — 기본·상한. 보존이 90일이라 그 이상은 어차피 없다 */
export const SEARCH_QUERY_LOG_SUMMARY_DEFAULT_DAYS = 14;
export const SEARCH_QUERY_LOG_SUMMARY_MAX_DAYS = 90;

/**
 * 드립 시리즈 순서 — **담지 않고 듣던 편**이 다음 편을 기다리게 하는 기간(2026-10-23, `ContentRepository.findVisibleSeriesEpisodesForUser`).
 * 라이브러리 행은 지워서 기다림을 풀 수 있지만 담지 않은 편은 풀 수단이 없어, 이 기간 동안 다시 듣지 않으면 막지 않는다.
 * 14일 = 드립 신규(14일) 창과 같은 길이
 */
export const SERIES_HOLD_LISTENING_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
