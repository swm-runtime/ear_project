import 'dotenv/config';

import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AppModule } from '@/app.module';
import { traceIdMiddleware } from '@/common/middlewares/trace-id.middleware';
import { jamoEditSimilarity, toJamo } from '@/common/utils/search-text.util';
import {
  EMBEDDING_DIM,
  EMBEDDING_MODEL_ID,
} from '@/modules/content/content.constant';
import { ContentOrigin, ContentStatus } from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { SearchQueryLog } from '@/modules/content/entities/search-query-log.entity';
import { ContentService } from '@/modules/content/services/content.service';
import { encodeSearchCursor } from '@/modules/explore/explore.cursor';
import { SocialProvider, UserMarket } from '@/modules/user/user.enum';

interface SearchBody {
  items: { content: { id: string }; matched_by: string[] }[];
  next_cursor: string | null;
  has_next: boolean;
  fallback: unknown;
  query_used: string;
  corrected_from: string | null;
  match: 'keyword' | 'related';
  engines: string[];
}

interface SummaryBody {
  totals: {
    corrected: number;
    correction_rejected: number;
    keyword_misses: number;
    rescued: number;
    semantic_unavailable: number;
  };
  missed: {
    query: string;
    query_used: string | null;
    keyword_count: number | null;
  }[];
}

const STUB_TOKEN = 'e2e-internal-token';
/** 질의 벡터의 축 — 공유 로컬 DB의 다른 임베딩(실제 모델 벡터는 성분이 고르게 퍼진다)과 거의 직교한다 */
const QUERY_AXIS = 7;
const OTHER_AXIS = 900;

/** 두 축 성분으로 만든 단위 벡터 — 질의 축(`QUERY_AXIS`)과의 코사인이 정확히 `cosine`이다 */
function vectorWithCosine(cosine: number): number[] {
  const vector = new Array<number>(EMBEDDING_DIM).fill(0);
  vector[QUERY_AXIS] = cosine;
  vector[OTHER_AXIS] = Math.sqrt(1 - cosine * cosine);
  return vector;
}

function toPgVector(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

/** 받침 없는 음절 — 초성 `cho`(0~18), 중성 `jung`(0~20) */
function syllable(cho: number, jung: number): string {
  return String.fromCodePoint(0xac00 + (cho * 21 + jung) * 28);
}

/** 이 실행만의 무작위 받침 없는 음절 n개 — 공유 로컬 DB의 다른 어휘와 겹치지 않는 한글 토큰 */
function randomPlainSyllables(n: number): string {
  let token = '';
  for (let i = 0; i < n; i += 1) {
    token += syllable(
      Math.floor(Math.random() * 19),
      Math.floor(Math.random() * 21),
    );
  }
  return token;
}

/** 단일 모음(겹모음이 아닌 것) — 오타는 이 중 하나를 다른 것으로 바꾼다 */
const VOWEL_A = 0; // ㅏ
const VOWEL_EO = 4; // ㅓ
const VOWEL_O = 8; // ㅗ
const VOWEL_U = 13; // ㅜ
/** 자모 하나로 풀리는 모음(ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅛㅜㅠㅡㅣ) — 겹모음(ㅘ·ㅢ 등)은 자모 둘이다 */
const SIMPLE_VOWELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 13, 17, 18, 20];

/** 무작위 받침 없는 홑모음 음절 n개 — 음절마다 자모가 정확히 2개다 */
function randomSimpleSyllables(n: number): string {
  let token = '';
  for (let i = 0; i < n; i += 1) {
    token += syllable(
      Math.floor(Math.random() * 19),
      SIMPLE_VOWELS[Math.floor(Math.random() * SIMPLE_VOWELS.length)],
    );
  }
  return token;
}

/**
 * 하이브리드 검색·오타 교정 E2E(KAN-238 — `explore.md` 4.5-5, explore-api.md 4.5, domain.md 5.1·5.7). 실제 DB와 로컬 HTTP
 * AI 서버 스텁 위에서 밟는다.
 *
 * AI 서버 스텁: `POST /embeddings`가 `X-Internal-Token`을 확인하고, 질의별로 정해 둔 벡터를 돌려준다(정해 두지 않은 질의는
 * 질의 축과 직교하는 벡터 — 의미 결과 없음). 질의에 표식이 있으면 실패를 흉내 낸다: `boom` 500 · `devstub` 모델 `dev-stub` ·
 * `shortdim` 3차원 · `slowq` 응답 지연(예산 400ms 초과). 타임아웃 뒤에는 클라이언트가 30초 쉬므로 그 테스트는 맨 끝이다.
 *
 * 공유 로컬 DB의 다른 콘텐츠와 섞이지 않게 질의마다 이 실행만의 무작위 한글 토큰을 쓴다.
 */
describe('하이브리드 검색·오타 교정 E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let contentService: ContentService;
  let stub: Server;
  const stubCalls: string[] = [];
  const stubVectors = new Map<string, number[]>();
  const userIds: string[] = [];
  const contentIds: string[] = [];
  const topicIds: string[] = [];
  const path = (p: string) => `/api/v1${p}`;
  const previousEnv = {
    url: process.env.AI_SERVER_URL,
    token: process.env.AI_SERVER_INTERNAL_TOKEN,
  };

  /** 교정 대상 말 — 무작위 2음절 + 받침 없는 끝음절(모음 ㅓ). 오타는 끝 모음을 ㅗ로 바꾼 것(자모 하나 차이) */
  const BASE = randomPlainSyllables(2);
  const LAST_CHO = Math.floor(Math.random() * 19);
  const WORD = BASE + syllable(LAST_CHO, VOWEL_EO);
  const TYPO = BASE + syllable(LAST_CHO, VOWEL_O);
  /** 조사 떼기 — 제목에만 "PARTICLE_WORD를"로 나오는 말 */
  const PARTICLE_BASE = randomPlainSyllables(2);
  const PARTICLE_CHO = Math.floor(Math.random() * 19);
  const PARTICLE_WORD = PARTICLE_BASE + syllable(PARTICLE_CHO, VOWEL_EO);
  const PARTICLE_TYPO = PARTICLE_BASE + syllable(PARTICLE_CHO, VOWEL_O);
  /** 동점 해소 — 같은 오타에 똑같이 닮은 두 말(끝 모음 ㅏ·ㅓ, 오타는 ㅗ). 하나는 태그, 하나는 제목 토큰 */
  const TIE_BASE = randomPlainSyllables(2);
  const TIE_CHO = Math.floor(Math.random() * 19);
  const TIE_TAG = TIE_BASE + syllable(TIE_CHO, VOWEL_A);
  const TIE_TITLE = TIE_BASE + syllable(TIE_CHO, VOWEL_EO);
  const TIE_TYPO = TIE_BASE + syllable(TIE_CHO, VOWEL_O);
  /** 빈도 해소 — 둘 다 제목 토큰, 하나가 두 편에 나온다 */
  const FREQ_BASE = randomPlainSyllables(2);
  const FREQ_CHO = Math.floor(Math.random() * 19);
  const FREQ_ONCE = FREQ_BASE + syllable(FREQ_CHO, VOWEL_A);
  const FREQ_TWICE = FREQ_BASE + syllable(FREQ_CHO, VOWEL_EO);
  const FREQ_TYPO = FREQ_BASE + syllable(FREQ_CHO, VOWEL_O);
  /** 자모 둘 차이 — 홑모음만 쓴 3음절 말(겹모음이 끼면 자모가 7개 이상이라 점수가 달라진다)과 끝음절 초성·모음을 바꾼 오타 */
  const TWO_OFF_BASE = randomSimpleSyllables(2);
  const TWO_OFF_CHO = Math.floor(Math.random() * 19);
  const TWO_OFF_WORD = TWO_OFF_BASE + syllable(TWO_OFF_CHO, VOWEL_EO);
  const TWO_OFF_TYPO = TWO_OFF_BASE + syllable((TWO_OFF_CHO + 5) % 19, VOWEL_U);
  /** 의미 엔진 — "이직" 자리. 질의는 토큰 + "이직", 제목에 그 말이 있는 편과 없는 편 */
  const SEMANTIC_TOKEN = randomPlainSyllables(3);
  const SEMANTIC_QUERY = `${SEMANTIC_TOKEN}이직`;
  /** 키워드 0 + 의미 결과만 — "관련 결과" */
  const RELATED_QUERY = `${randomPlainSyllables(3)}${syllable(LAST_CHO, VOWEL_U)}`;
  /** 하위 호환 대조용 — 이 토큰을 제목·태그·설명 여러 자리에 넣은 편들 */
  const COMPAT_TOKEN = randomPlainSyllables(3);

  const ids = {
    word1: '',
    word2: '',
    particle: '',
    tieTag: '',
    tieTitle: '',
    semanticTitled: '',
    semanticUntitled: '',
    semanticFar: '',
    semanticStubModel: '',
    semanticStale: '',
    semanticWithdrawn: '',
    semanticGlobal: '',
  };
  let otherTopicId = '';

  beforeAll(async () => {
    stub = createServer((req, res) => void handleStub(req, res));
    await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
    const { port } = stub.address() as AddressInfo;
    // ConfigService는 검증된 env에 없는 키를 process.env에서 읽는다 — 앱을 만들기 전에 넣는다
    process.env.AI_SERVER_URL = `http://127.0.0.1:${port}`;
    process.env.AI_SERVER_INTERNAL_TOKEN = STUB_TOKEN;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(traceIdMiddleware);
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    dataSource = app.get(DataSource);
    contentService = app.get(ContentService);

    ids.word1 = await seed(`${WORD}를 바꾸는 법`, 1, { tags: [WORD, '전환'] });
    ids.word2 = await seed(`${WORD} 첫걸음`, 2, { tags: [WORD] });
    ids.particle = await seed(`${PARTICLE_WORD}를 듣다`, 3);
    ids.tieTag = await seed('동점 태그 편', 4, { tags: [TIE_TAG] });
    ids.tieTitle = await seed(`${TIE_TITLE} 이야기`, 5);
    await seed(`${FREQ_ONCE} 하나`, 6);
    await seed(`${FREQ_TWICE} 둘`, 7);
    await seed(`${FREQ_TWICE} 셋`, 8);

    // 의미 엔진 — 제목에 질의가 있는 편(임베딩도 꽤 가깝다)·없는 편(가장 가깝다)·먼 편·제외돼야 할 편들
    ids.semanticTitled = await seed(`${SEMANTIC_QUERY} 준비하는 법`, 10);
    ids.semanticUntitled = await seed('퇴사·연봉 협상', 11);
    ids.semanticFar = await seed('전혀 다른 이야기', 12);
    ids.semanticStubModel = await seed('스텁 모델 편', 13);
    ids.semanticStale = await seed('재발행 미갱신 편', 14, {
      contentVersion: 2,
    });
    ids.semanticWithdrawn = await seed('회수된 편', 15, {
      status: ContentStatus.WITHDRAWN,
      withdrawnAt: new Date(),
    });
    ids.semanticGlobal = await seed('다른 시장 편', 16, {
      market: UserMarket.GLOBAL,
    });
    await embed(ids.semanticTitled, vectorWithCosine(0.8));
    await embed(ids.semanticUntitled, vectorWithCosine(0.95));
    // 코사인 0.2 — 하한(0.3) 아래
    await embed(ids.semanticFar, vectorWithCosine(0.2));
    await embed(ids.semanticStubModel, vectorWithCosine(0.99), {
      model: 'dev-stub',
    });
    // 콘텐츠는 2판인데 임베딩은 1판 — 재발행 뒤 미갱신
    await embed(ids.semanticStale, vectorWithCosine(0.99), { version: 1 });
    await embed(ids.semanticWithdrawn, vectorWithCosine(0.99));
    await embed(ids.semanticGlobal, vectorWithCosine(0.99));
    stubVectors.set(SEMANTIC_QUERY, vectorWithCosine(1));
    stubVectors.set(RELATED_QUERY, vectorWithCosine(1));

    const [topic] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO topics (name, parent_category, market, is_visible, display_order)
       VALUES ($1, 'e2e', 'kr', true, 999) RETURNING id`,
      [`e2e교정${randomPlainSyllables(2)}`],
    );
    otherTopicId = topic.id;
    topicIds.push(topic.id);
  }, 60_000);

  afterAll(async () => {
    for (const id of userIds) {
      await dataSource.query(`DELETE FROM users WHERE id = $1`, [id]);
    }
    await dataSource.query(
      `DELETE FROM idempotency_keys WHERE idempotency_key LIKE 'e2e-hybrid-%'`,
    );
    for (const id of contentIds) {
      await dataSource.query(`DELETE FROM contents WHERE id = $1`, [id]);
    }
    for (const id of topicIds) {
      await dataSource.query(`DELETE FROM topics WHERE id = $1`, [id]);
    }
    await app.close();
    await new Promise<void>((resolve) => stub.close(() => resolve()));
    restoreEnv('AI_SERVER_URL', previousEnv.url);
    restoreEnv('AI_SERVER_INTERNAL_TOKEN', previousEnv.token);
  }, 60_000);

  describe('hangul_to_jamo (SQL) ↔ toJamo (TS)', () => {
    it('완성형 음절 11,172자 전부와 홀겹자모·비한글이 두 구현에서 같은 자모열이 된다', async () => {
      // given — 음절 전 범위 + 겹모음·겹받침 홀자모 + 영문·숫자·기호·공백
      let allSyllables = '';
      for (let code = 0xac00; code <= 0xd7a3; code += 1) {
        allSyllables += String.fromCodePoint(code);
      }
      const inputs = [
        allSyllables,
        'ㅘㅙㅚㅝㅞㅟㅢㄳㄵㄶㄺㄻㄼㄽㄾㄿㅀㅄ',
        'ㄱㄴㄷ ㅏㅓ',
        '닭과 뷁, 읽기',
        'AI 커리어 2편! (Stray Kids)',
        '',
      ];

      for (const input of inputs) {
        // when
        const [row] = await dataSource.query<{ jamo: string }[]>(
          `SELECT hangul_to_jamo($1) AS jamo`,
          [input],
        );

        // then
        expect(row.jamo).toBe(toJamo(input));
      }
    }, 60_000);

    it('IMMUTABLE·STRICT 함수이고 search_path를 pg_catalog로 고정한다', async () => {
      // when
      const [row] = await dataSource.query<
        { volatile: string; strict: boolean; config: string[] }[]
      >(
        `SELECT provolatile AS volatile, proisstrict AS strict, proconfig AS config
           FROM pg_proc WHERE proname = 'hangul_to_jamo'`,
      );

      // then
      expect(row.volatile).toBe('i');
      expect(row.strict).toBe(true);
      expect(row.config).toEqual(['search_path=pg_catalog']);
    });
  });

  describe('교정어 선택', () => {
    const correct = (normalizedQuery: string, includeSeriesTitles = false) =>
      contentService.findSearchCorrection({
        market: UserMarket.KR,
        normalizedQuery,
        includeSeriesTitles,
        now: new Date(),
      });

    it('자모 하나 틀린 오타는 그 말로 고친다', async () => {
      // when
      const term = await correct(TYPO);

      // then
      expect(term).toBe(WORD);
    });

    it('제목 토큰 끝의 조사를 떼고 고친다 — "OO를" → "OO"', async () => {
      // when
      const term = await correct(PARTICLE_TYPO);

      // then
      expect(term).toBe(PARTICLE_WORD);
    });

    it('똑같이 닮은 두 말이면 태그(·주제명)가 제목 토큰보다 앞선다', async () => {
      // given — 두 말의 점수(자모 편집 유사도)가 같다
      expect(jamoEditSimilarity(TIE_TYPO, TIE_TAG)).toBe(
        jamoEditSimilarity(TIE_TYPO, TIE_TITLE),
      );

      // when
      const term = await correct(TIE_TYPO);

      // then
      expect(term).toBe(TIE_TAG);
    });

    it('같은 우선순위로 똑같이 닮았으면 더 자주 나온 말이 앞선다', async () => {
      // when
      const term = await correct(FREQ_TYPO);

      // then
      expect(term).toBe(FREQ_TWICE);
    });

    it('임계값(0.7) 아래면 교정어가 없다 — 자모 넷 틀림', async () => {
      // given — 뒤 두 음절을 통째로 바꾼다(자모 넷 차이, 점수 1 − 4/6 = 0.33)
      const farTypo =
        BASE[0] +
        syllable((LAST_CHO + 3) % 19, VOWEL_U) +
        syllable((LAST_CHO + 7) % 19, VOWEL_U);

      // when
      const term = await correct(farTypo);

      // then
      expect(term).toBeNull();
    });

    it('자모 6개인 말에서 자모 둘 틀리면(점수 0.667) 고치지 않는다 — 종전 word_similarity는 4/7 = 0.57로 고쳤다', async () => {
      // given — 홑모음만 쓴 받침 없는 3음절 말(자모 정확히 6개). 끝음절의 초성·모음을 둘 다 바꾼다
      await seed(`${TWO_OFF_WORD} 이야기`, 9);
      expect(jamoEditSimilarity(TWO_OFF_TYPO, TWO_OFF_WORD)).toBeCloseTo(
        1 - 2 / 6,
      );

      // when
      const term = await correct(TWO_OFF_TYPO);

      // then
      expect(term).toBeNull();
    });

    it('원문과 같은 말은 교정어가 아니다', async () => {
      // when
      const term = await correct(WORD);

      // then
      expect(term).not.toBe(WORD);
    });
  });

  describe('교정어 선택 — 실제 말(개발계 실측 사례)', () => {
    const realIds = { economy: '' };

    beforeAll(async () => {
      // "경제"는 제목 토큰으로만, "거의"는 태그(우선순위가 더 높다)로도 둔다 — 경제가 점수로 이겨야 한다
      realIds.economy = await seed('키워드로 훑어보는 경제 상식', 60);
      await seed('거의 모든 것의 역사', 61, { tags: ['거의'] });
      await seed('운영체제 기초', 62, { tags: ['운영체제', '운영'] });
      await seed('네트워크 입문', 63, { tags: ['네트워크'] });
      await seed('커리어 전환 첫걸음', 64, { tags: ['커리어', '커리어 전환'] });
      await seed('면접 준비하는 법', 65, { tags: ['면접', '면허'] });
    });

    const correct = (normalizedQuery: string) =>
      contentService.findSearchCorrection({
        market: UserMarket.KR,
        normalizedQuery,
        includeSeriesTitles: false,
        now: new Date(),
      });

    it.each([
      ['겅제', '경제'],
      ['운영체재', '운영체제'],
      ['네트웍', '네트워크'],
      ['커리오', '커리어'],
      ['면졉', '면접'],
    ])('"%s" → "%s"', async (typo, expected) => {
      // when
      const term = await correct(typo);

      // then
      expect(term).toBe(expected);
    });

    it('겅제 — 종전 word_similarity는 "거의"(0.5)가 "경제"(0.333)보다 높았다(회귀 근거)', async () => {
      // given
      const [row] = await dataSource.query<{ wrong: number; right: number }[]>(
        `SELECT word_similarity(hangul_to_jamo('겅제'), hangul_to_jamo('거의')) AS wrong,
                word_similarity(hangul_to_jamo('겅제'), hangul_to_jamo('경제')) AS right`,
      );

      // then — 그래서 점수를 자모 편집 유사도로 바꿨다(경제 0.8, 거의 0.6)
      expect(row.wrong).toBeGreaterThan(row.right);
      expect(jamoEditSimilarity('겅제', '경제')).toBeCloseTo(0.8);
      expect(jamoEditSimilarity('겅제', '거의')).toBeCloseTo(0.6);
    });

    it('여러 단어 질의 "커리어 없는말"은 고치지 않는다 — 통째로 닮은 어휘가 없다', async () => {
      // when
      const term = await correct('커리어 없는말');

      // then
      expect(term).toBeNull();
    });

    it('아무 말도 아닌 문자열은 고치지 않는다', async () => {
      // when
      const term = await correct('zqxj쀍뷁');

      // then
      expect(term).toBeNull();
    });

    it('흐름 — "겅제" 검색은 "경제"로 대신 검색한다', async () => {
      // given
      const { auth } = await createUser('real-correct');

      // when
      const body = (await search(auth, { query: '겅제' }).expect(HttpStatus.OK))
        .body as SearchBody;

      // then
      expect(body.query_used).toBe('경제');
      expect(body.corrected_from).toBe('겅제');
      expect(body.match).toBe('keyword');
      expect(body.items.map((item) => item.content.id)).toContain(
        realIds.economy,
      );
    });
  });

  describe('흐름', () => {
    it('키워드 0건이면 교정어로 대신 검색한다 — query_used·corrected_from, 결과는 키워드, match: keyword', async () => {
      // given
      const { auth } = await createUser('correct');

      // when
      const body = (await search(auth, { query: TYPO }).expect(HttpStatus.OK))
        .body as SearchBody;

      // then
      expect(body.query_used).toBe(WORD);
      expect(body.corrected_from).toBe(TYPO);
      expect(body.match).toBe('keyword');
      expect(body.fallback).toBeNull();
      const word1 = body.items.find((item) => item.content.id === ids.word1);
      expect(word1?.matched_by).toContain('keyword');
      expect(body.items.map((item) => item.content.id)).toEqual(
        expect.arrayContaining([ids.word1, ids.word2]),
      );
    });

    it('exact=true면 교정하지 않는다 — 원문 그대로, 키워드·의미 둘 다 0이면 빈 결과 + fallback', async () => {
      // given
      const { auth } = await createUser('exact');

      // when
      const body = (
        await search(auth, { query: TYPO, exact: 'true' }).expect(HttpStatus.OK)
      ).body as SearchBody;

      // then
      expect(body.corrected_from).toBeNull();
      expect(body.query_used).toBe(TYPO);
      expect(body.items).toEqual([]);
      expect(body.match).toBe('keyword');
      expect(body.fallback).not.toBeNull();
    });

    it('교정어가 있어도 그 말로 키워드 0건이면 교정하지 않는다 — 주제 필터가 교정어 편을 거른다', async () => {
      // given — 어휘는 시장 전체지만 키워드 엔진은 주제 필터를 겹친다. 교정어 편들은 이 주제에 없다
      const { auth } = await createUser('no-correct');
      expect(
        await contentService.findSearchCorrection({
          market: UserMarket.KR,
          normalizedQuery: TYPO,
          includeSeriesTitles: false,
          now: new Date(),
        }),
      ).toBe(WORD);

      // when
      const body = (
        await search(auth, { query: TYPO, topic_ids: otherTopicId }).expect(
          HttpStatus.OK,
        )
      ).body as SearchBody;

      // then
      expect(body.corrected_from).toBeNull();
      expect(body.query_used).toBe(TYPO);
      expect(body.items).toEqual([]);
    });

    it('# 질의는 종전 태그 정확 일치 경로다 — 교정·의미 없음, engines: [keyword]', async () => {
      // given
      const { auth } = await createUser('hashtag');
      const before = stubCalls.length;

      // when
      const typo = (
        await search(auth, { query: `#${TYPO}` }).expect(HttpStatus.OK)
      ).body as SearchBody;
      const exact = (
        await search(auth, { query: `#${WORD}` }).expect(HttpStatus.OK)
      ).body as SearchBody;

      // then
      expect(typo.corrected_from).toBeNull();
      expect(typo.items).toEqual([]);
      expect(typo.engines).toEqual(['keyword']);
      expect(exact.query_used).toBe(`#${WORD}`);
      expect(exact.engines).toEqual(['keyword']);
      expect(
        exact.items.every((item) => item.matched_by.join() === 'keyword'),
      ).toBe(true);
      expect(stubCalls.length).toBe(before);
    });
  });

  describe('의미 엔진', () => {
    it('제목에 질의가 없는 편이 matched_by: [semantic]으로 들고, 제목에 있는 편이 그보다 위다', async () => {
      // given
      const { auth } = await createUser('semantic');

      // when
      const body = (
        await search(auth, { query: SEMANTIC_QUERY }).expect(HttpStatus.OK)
      ).body as SearchBody;

      // then
      const order = body.items.map((item) => item.content.id);
      expect(body.engines).toEqual(['keyword', 'semantic']);
      expect(body.match).toBe('keyword');
      expect(body.corrected_from).toBeNull();
      expect(order.indexOf(ids.semanticTitled)).toBe(0);
      expect(order.indexOf(ids.semanticUntitled)).toBe(1);
      expect(body.items[0].matched_by).toEqual(['keyword', 'semantic']);
      expect(body.items[1].matched_by).toEqual(['semantic']);
      // 하한 아래·다른 모델·대본 버전 불일치·회수·다른 시장은 의미 엔진에서도 빠진다
      for (const excluded of [
        ids.semanticFar,
        ids.semanticStubModel,
        ids.semanticStale,
        ids.semanticWithdrawn,
        ids.semanticGlobal,
      ]) {
        expect(order).not.toContain(excluded);
      }
    });

    it('키워드 0건 + 의미 결과만이면 match: related, 교정어가 없으면 corrected_from: null', async () => {
      // given
      const { auth } = await createUser('related');

      // when
      const body = (
        await search(auth, { query: RELATED_QUERY, exact: 'true' }).expect(
          HttpStatus.OK,
        )
      ).body as SearchBody;

      // then
      expect(body.match).toBe('related');
      expect(body.corrected_from).toBeNull();
      expect(body.items[0].content.id).toBe(ids.semanticUntitled);
      expect(
        body.items.every((item) => item.matched_by.join() === 'semantic'),
      ).toBe(true);
      expect(body.fallback).toBeNull();
    });

    it('같은 질의 연타(디바운스)·커서 2페이지는 AI 서버를 한 번만 부른다(캐시)', async () => {
      // given
      const { auth } = await createUser('cache');
      const before = stubCalls.filter((text) => text === SEMANTIC_QUERY).length;

      // when — 이미 한 번 불렸어도 그 뒤로는 늘지 않는다. 연타 두 번 + 다음 페이지
      await search(auth, { query: SEMANTIC_QUERY, limit: '1' }).expect(
        HttpStatus.OK,
      );
      const first = (
        await search(auth, { query: SEMANTIC_QUERY, limit: '1' }).expect(
          HttpStatus.OK,
        )
      ).body as SearchBody;
      const second = (
        await search(auth, {
          query: SEMANTIC_QUERY,
          limit: '1',
          cursor: first.next_cursor as string,
        }).expect(HttpStatus.OK)
      ).body as SearchBody;

      // then
      const after = stubCalls.filter((text) => text === SEMANTIC_QUERY).length;
      expect(after - before).toBeLessThanOrEqual(before === 0 ? 1 : 0);
      expect(after).toBe(1);
      expect(first.items[0].content.id).toBe(ids.semanticTitled);
      expect(second.items[0].content.id).toBe(ids.semanticUntitled);
      expect(second.engines).toEqual(['keyword', 'semantic']);
    });

    it.each([
      ['boom', '500'],
      ['devstub', '모델 dev-stub'],
      ['shortdim', '차원 3'],
    ])(
      'AI 서버 응답이 %s(%s)면 의미 엔진 없이 키워드만 — 200, engines: [keyword]',
      async (marker) => {
        // given — 제목에 그 표식이 든 편 하나
        const { auth } = await createUser(`fail-${marker}`);
        const query = `${randomPlainSyllables(3)}${marker}`;
        const id = await seed(`${query} 편`, 30);

        // when
        const body = (await search(auth, { query }).expect(HttpStatus.OK))
          .body as SearchBody;

        // then
        expect(body.engines).toEqual(['keyword']);
        expect(body.items.map((item) => item.content.id)).toEqual([id]);
      },
    );
  });

  describe('커서', () => {
    it('교정된 응답의 다음 페이지는 교정어로 이어지고 query_used·corrected_from을 반복한다', async () => {
      // given
      const { auth } = await createUser('cursor');
      const first = (
        await search(auth, { query: TYPO, limit: '1' }).expect(HttpStatus.OK)
      ).body as SearchBody;
      expect(first.corrected_from).toBe(TYPO);
      expect(first.next_cursor).not.toBeNull();

      // when
      const second = (
        await search(auth, {
          query: TYPO,
          limit: '1',
          cursor: first.next_cursor as string,
        }).expect(HttpStatus.OK)
      ).body as SearchBody;

      // then
      expect(second.query_used).toBe(WORD);
      expect(second.corrected_from).toBe(TYPO);
      expect(second.match).toBe('keyword');
      expect(
        [...first.items, ...second.items].map((item) => item.content.id).sort(),
      ).toEqual(expect.arrayContaining([ids.word1, ids.word2].sort()));
      expect(second.items[0].content.id).not.toBe(first.items[0].content.id);
    });

    it('exact·query·topic_ids가 다른 커서는 EXPLORE_CURSOR_INVALID', async () => {
      // given
      const { auth } = await createUser('cursor-invalid');
      const first = (
        await search(auth, { query: TYPO, limit: '1' }).expect(HttpStatus.OK)
      ).body as SearchBody;
      const cursor = first.next_cursor as string;

      // when
      const responses = await Promise.all([
        search(auth, { query: TYPO, limit: '1', cursor, exact: 'true' }),
        search(auth, { query: WORD, limit: '1', cursor }),
        search(auth, {
          query: TYPO,
          limit: '1',
          cursor,
          topic_ids: otherTopicId,
        }),
      ]);

      // then
      for (const response of responses) {
        expect(response.status).toBe(HttpStatus.BAD_REQUEST);
        expect((response.body as { error_code: string }).error_code).toBe(
          'EXPLORE_CURSOR_INVALID',
        );
      }
    });

    it('종전 키워드 커서(옛 앱이 배포 순간 들고 있던 것)는 거절하지 않고 종전 키워드 경로로 잇는다', async () => {
      // given — 1.3.0까지의 서버가 발급하던 모양(s·w·p·t·i·q). 첫 편 뒤 위치
      const { auth } = await createUser('legacy-cursor');
      const legacyFirst = await contentService.findSearchPage({
        market: UserMarket.KR,
        normalizedQuery: WORD,
        tagOnly: false,
        topicIds: [],
        cursor: null,
        limit: 1,
        now: new Date(),
      });
      const top = legacyFirst.items[0];
      const cursor = encodeSearchCursor(
        {
          score: top.score,
          titleSimilarity: top.titleSimilarity,
          playCount: top.playCount,
          publishedAt: top.content.publishedAt,
          id: top.content.id,
        },
        WORD,
        [],
      );

      // when
      const body = (
        await search(auth, { query: WORD, limit: '1', cursor }).expect(
          HttpStatus.OK,
        )
      ).body as SearchBody;

      // then
      expect(body.engines).toEqual(['keyword']);
      expect(body.corrected_from).toBeNull();
      expect(body.items).toHaveLength(1);
      expect(body.items[0].content.id).not.toBe(top.content.id);
    });
  });

  describe('하위 호환 — 의미 엔진 없고 교정 없으면 종전 키워드 결과·순서 그대로', () => {
    beforeAll(async () => {
      // 같은 토큰을 제목·태그·저자·설명 여러 자리에 — 가중 점수·제목 유사도·신선도가 갈리게
      await seed(`${COMPAT_TOKEN} 제목 앞`, 40);
      await seed(`제목 뒤 ${COMPAT_TOKEN}`, 41);
      await seed('태그만', 42, { tags: [COMPAT_TOKEN] });
      await seed('저자만', 43, { authorName: `${COMPAT_TOKEN} 저자` });
      await seed('설명만', 44, { description: `설명 ${COMPAT_TOKEN}` });
      await seed(`${COMPAT_TOKEN} 제목+태그`, 45, { tags: [COMPAT_TOKEN] });
      await seed(`${COMPAT_TOKEN}${COMPAT_TOKEN} 반복`, 46);
    });

    it.each([
      ['시드 토큰', () => COMPAT_TOKEN],
      ['로컬 DB 전체에 흔한 말', () => 'e2e'],
      ['한 글자(서비스 직접 — 동점이 많다)', () => '이'],
    ])(
      '%s: 하이브리드(질의 벡터 없음)와 종전 키워드가 페이지를 넘겨도 같은 순서다',
      async (_label, queryOf) => {
        const normalizedQuery = queryOf();

        for (const seriesAnchorsOnly of [false, true]) {
          // given
          const now = new Date();
          const common = {
            market: UserMarket.KR,
            normalizedQuery,
            topicIds: [],
            limit: 3,
            now,
            ...(seriesAnchorsOnly && {
              seriesAnchorsOnly: true,
              matchSeriesTitle: true,
            }),
          };

          // when — 두 경로를 각각 끝까지 넘긴다
          const legacyIds: string[] = [];
          let legacyCursor: Parameters<
            ContentService['findSearchPage']
          >[0]['cursor'] = null;
          for (let guard = 0; guard < 100; guard += 1) {
            const page = await contentService.findSearchPage({
              ...common,
              tagOnly: false,
              cursor: legacyCursor,
            });
            legacyIds.push(...page.items.map((row) => row.content.id));
            const last = page.items.at(-1);
            if (!page.hasNext || !last) break;
            legacyCursor = {
              score: last.score,
              titleSimilarity: last.titleSimilarity,
              playCount: last.playCount,
              publishedAt: last.content.publishedAt,
              id: last.content.id,
            };
          }
          const hybridIds: string[] = [];
          let hybridCursor: Parameters<
            ContentService['findHybridSearchPage']
          >[0]['cursor'] = null;
          for (let guard = 0; guard < 100; guard += 1) {
            const page = await contentService.findHybridSearchPage({
              ...common,
              queryVector: null,
              cursor: hybridCursor,
            });
            hybridIds.push(...page.items.map((row) => row.content.id));
            const last = page.items.at(-1);
            if (!page.hasNext || !last) break;
            hybridCursor = {
              rrf: last.rrf,
              playCount: last.playCount,
              publishedAt: last.content.publishedAt,
              id: last.content.id,
            };
          }

          // then — 순서 대조는 이 스위트가 심은 편끼리만 한다. 병렬로 도는 다른 e2e 가 같은 말을 품은 편을 넣고 지워
          // 두 경로를 넘기는 사이 DB 전체 목록이 달라질 수 있다(CI 2026-10-22 #1828 — Received +3). 키셋 페이지네이션이라
          // 남의 행이 끼어도 내 편끼리의 상대 순서는 그대로다
          expect(hybridIds.length).toBeGreaterThan(0);
          const own = new Set(contentIds);
          expect(hybridIds.filter((id) => own.has(id))).toEqual(
            legacyIds.filter((id) => own.has(id)),
          );
        }
      },
      60_000,
    );
  });

  describe('검색 로그·관리자 요약', () => {
    it('교정 행·교정 거절(exact) 새 행·의미가 살린 행을 남기고 요약이 센다', async () => {
      // given
      const { userId, auth } = await createUser('logs');
      const logs = dataSource.getRepository(SearchQueryLog);

      // when — 교정 → 교정 거절(같은 입력, exact) → 의미만(관련 결과)
      await search(auth, { query: TYPO }).expect(HttpStatus.OK);
      await search(auth, { query: TYPO, exact: 'true' }).expect(HttpStatus.OK);
      await search(auth, { query: RELATED_QUERY, exact: 'true' }).expect(
        HttpStatus.OK,
      );

      // then — 세 행(거절은 묶음·재조회가 아니라 새 행)
      const rows = await logs.find({ where: { userId }, order: { id: 'ASC' } });
      expect(rows.map((row) => [row.query, row.queryUsed])).toEqual([
        [TYPO, WORD],
        [TYPO, TYPO],
        [RELATED_QUERY, RELATED_QUERY],
      ]);
      expect(rows[0].keywordCount).toBe(rows[0].resultCount);
      expect(rows[0].resultCount).toBeGreaterThan(0);
      expect(rows[1].keywordCount).toBe(0);
      expect(rows[1].resultCount).toBe(0);
      expect(rows[2].keywordCount).toBe(0);
      expect(rows[2].resultCount).toBeGreaterThan(0);
      expect(rows[2].engines).toEqual(['keyword', 'semantic']);

      // when — 관리자 요약
      const admin = await createAdmin();
      const summary = (
        await request(app.getHttpServer())
          .get(path('/admin/search-query-logs/summary'))
          .query({ days: 1 })
          .set('Authorization', admin)
          .expect(HttpStatus.OK)
      ).body as SummaryBody;

      // then — 전 사용자 합계라 이 테스트의 행 이상이다
      expect(summary.totals.corrected).toBeGreaterThanOrEqual(1);
      expect(summary.totals.correction_rejected).toBeGreaterThanOrEqual(1);
      expect(summary.totals.keyword_misses).toBeGreaterThanOrEqual(2);
      expect(summary.totals.rescued).toBeGreaterThanOrEqual(1);
      expect(typeof summary.totals.semantic_unavailable).toBe('number');
      const missed = summary.missed.find((row) => row.query === TYPO);
      expect(missed).toMatchObject({ query_used: TYPO, keyword_count: 0 });
    });
  });

  // 타임아웃 뒤 클라이언트가 30초 동안 AI 서버를 부르지 않는다 — 다른 테스트에 번지지 않게 맨 끝에 둔다
  describe('AI 서버 예산 초과', () => {
    it('예산(400ms)을 넘기면 200, 키워드 결과, engines에 semantic 없음 — 교정 흐름은 그대로', async () => {
      // given
      const { auth } = await createUser('timeout');
      const query = `${randomPlainSyllables(3)}slowq`;
      const id = await seed(`${query} 편`, 50);
      const startedAt = Date.now();

      // when
      const body = (await search(auth, { query }).expect(HttpStatus.OK))
        .body as SearchBody;
      const corrected = (
        await search(auth, { query: PARTICLE_TYPO }).expect(HttpStatus.OK)
      ).body as SearchBody;

      // then
      expect(Date.now() - startedAt).toBeLessThan(3_000);
      expect(body.engines).toEqual(['keyword']);
      expect(body.items.map((item) => item.content.id)).toEqual([id]);
      expect(corrected.corrected_from).toBe(PARTICLE_TYPO);
      expect(corrected.query_used).toBe(PARTICLE_WORD);
      expect(corrected.engines).toEqual(['keyword']);
    });
  });

  async function handleStub(req: IncomingMessage, res: ServerResponse) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);

    if (req.url !== '/embeddings' || req.method !== 'POST') {
      res.writeHead(404).end();
      return;
    }
    if (req.headers['x-internal-token'] !== STUB_TOKEN) {
      res.writeHead(401).end();
      return;
    }

    const { text } = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
      text: string;
    };
    stubCalls.push(text);

    if (text.includes('slowq')) {
      await new Promise((resolve) => setTimeout(resolve, 900));
    }
    if (text.includes('boom')) {
      res.writeHead(500).end();
      return;
    }

    const vector =
      stubVectors.get(text) ??
      (() => {
        const unrelated = new Array<number>(EMBEDDING_DIM).fill(0);
        unrelated[OTHER_AXIS + 1] = 1;
        return unrelated;
      })();
    const body = text.includes('devstub')
      ? { model: 'dev-stub', dim: EMBEDDING_DIM, vector }
      : text.includes('shortdim')
        ? { model: EMBEDDING_MODEL_ID, dim: 3, vector: [1, 0, 0] }
        : { model: EMBEDDING_MODEL_ID, dim: EMBEDDING_DIM, vector };

    if (!res.writableEnded && !res.destroyed) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    }
  }

  function restoreEnv(key: string, value: string | undefined) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  function search(auth: string, query: Record<string, string>) {
    return request(app.getHttpServer())
      .get(path('/explore/search'))
      .query(query)
      .set('Authorization', auth);
  }

  async function embed(
    contentId: string,
    vector: number[],
    options: { model?: string; version?: number } = {},
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO content_embeddings (content_id, embedding, model, content_version)
       VALUES ($1, $2::vector, $3, $4)`,
      [
        contentId,
        toPgVector(vector),
        options.model ?? EMBEDDING_MODEL_ID,
        options.version ?? 1,
      ],
    );
  }

  async function seed(
    title: string,
    index: number,
    overrides: Partial<Content> = {},
  ): Promise<string> {
    const repository = dataSource.getRepository(Content);
    const content = await repository.save(
      repository.create({
        title,
        description: 'e2e 전용',
        authorName: '테스트',
        sourceName: 'E2E',
        sourceUrl: 'https://example.com/e2e',
        origin: ContentOrigin.AI_GENERATED,
        partnerId: null,
        seriesId: null,
        episodeNo: null,
        totalEpisodes: null,
        audioPath: `e2e-hybrid/${index}-${contentIds.length}.mp3`,
        durationSec: 600,
        thumbnailUrl: 'https://example.com/e2e.png',
        contentVersion: 1,
        licenseExpiresAt: null,
        status: ContentStatus.PUBLISHED,
        publishedAt: new Date(Date.now() - index * 60_000),
        withdrawnAt: null,
        tags: null,
        ...overrides,
      }),
    );
    contentIds.push(content.id);
    return content.id;
  }

  async function createUser(
    label: string,
  ): Promise<{ userId: string; auth: string; providerToken: string }> {
    const providerToken = `e2e-hybrid-${label}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const deviceId = `e2e-hybrid-device-${label}`;
    const login = await request(app.getHttpServer())
      .post(path('/auth/social-login'))
      .send({
        provider: SocialProvider.KAKAO,
        provider_token: providerToken,
        device_id: deviceId,
      })
      .expect(HttpStatus.OK);
    const signUp = await request(app.getHttpServer())
      .post(path('/auth/sign-up'))
      .set('Idempotency-Key', `e2e-hybrid-signup-${providerToken}`)
      .send({
        signup_token: (login.body as { signup_token: string }).signup_token,
        device_id: deviceId,
        consents: [
          { consent_type: 'terms', version: '0.1', is_agreed: true },
          { consent_type: 'privacy', version: '0.1', is_agreed: true },
          { consent_type: 'age_confirmation', version: null, is_agreed: true },
        ],
      })
      .expect(HttpStatus.CREATED);
    const body = signUp.body as { access_token: string; user: { id: string } };
    userIds.push(body.user.id);

    return {
      userId: body.user.id,
      auth: `Bearer ${body.access_token}`,
      providerToken,
    };
  }

  /** 관리자 — 역할을 바꾼 뒤 다시 로그인해야 토큰에 역할이 실린다 */
  async function createAdmin(): Promise<string> {
    const { userId, providerToken } = await createUser('admin');
    await dataSource.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [
      userId,
    ]);
    const login = await request(app.getHttpServer())
      .post(path('/auth/social-login'))
      .send({
        provider: SocialProvider.KAKAO,
        provider_token: providerToken,
        device_id: 'e2e-hybrid-device-admin',
      })
      .expect(HttpStatus.OK);
    return `Bearer ${(login.body as { access_token: string }).access_token}`;
  }
});
