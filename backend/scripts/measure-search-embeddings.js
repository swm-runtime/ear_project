/* eslint-disable */
/**
 * 검색 의미 엔진 비교 실측 — 질의 벡터를 무엇과 비교할 때 짧은 질의가 잘 맞는가.
 *
 * 변형:
 *   A  질의 ↔ 대본 전문 임베딩(content_embeddings — 현행)
 *   B  질의 ↔ 제목 임베딩
 *   C  질의 ↔ 제목 + 설명 + 태그 임베딩
 *   D  max(A, C)
 *   E  max(A, B)
 *
 * **DB에 쓰지 않는다** — `BEGIN READ ONLY` 트랜잭션에서 콘텐츠·대본 벡터만 읽고, 제목·메타 벡터는 AI 서버
 * `POST /embeddings`로 만들어 메모리에서만 비교한다. 개발계 API 컨테이너 안에서 돌린다(AI 서버 env·망이 거기 있다).
 *
 *   docker exec -i -w /app ear-prod-api-1 node - < measure-search-embeddings.js            # 요약 리포트
 *   docker exec -i -w /app -e DUMP_JSON=1 ear-prod-api-1 node - < measure-search-embeddings.js  # 원자료 JSON
 *
 * 관련성 라벨은 제목·주제 정규식이다(사람이 제목을 보고 정한 표). 사람 이름·이메일은 읽지 않는다.
 */
const { Client } = require('pg');

const MODEL = 'text-embedding-3-small';
const CONCURRENCY = 4;

const SAFETY =
  /TBM|위험성평가|LOTO|하인리히|휴먼 에러|밀폐공간|중대재해|작업중지권|위험의 외주화|산재|안전 문화|말할 수 있는 현장/;
const JOB = /취업|채용|일자리|월급|고용|자리일수록 들어가기/;

/** [질의, 관련 제목 정규식, 종류] — short: 1~2어절, sentence: 문장 */
const QUERIES = [
  ['이직', JOB, 'short'],
  ['금리', /금리|채권|이자/, 'short'],
  ['수면', /잠|수면/, 'short'],
  ['철학', /철학/, 'short'],
  ['데이터베이스', /데이터베이스|SQL|트랜잭션|DB/, 'short'],
  ['산업안전', SAFETY, 'short'],
  ['인플레이션', /물가|인플레이션/, 'short'],
  ['관세', /관세|무역|국경에서 물건/, 'short'],
  ['글쓰기', /글[은을이]|쓰기|초고|짧게 쓰라|맞춤법/, 'short'],
  ['부동산', /부동산|주택|집값|이사를|전세|대출 한도/, 'short'],
  ['네트워크', /네트워크|소켓/, 'short'],
  ['기억력', /기억|기록과/, 'short'],
  ['노화', /나이|늙/, 'short'],
  ['리더십', /팀장|리더|애자일|결정 권한|회의/, 'short'],
  ['주식', /주식|주가|시가총액|투자 상품|레버리지/, 'short'],
  ['쿠버네티스', /쿠버네티스|클라우드/, 'short'],
  ['아두이노', /아두이노|임베디드|라즈베리|STM32/, 'short'],
  ['금융위기', /금융위기|리먼|뱅크런|경제위기/, 'short'],
  ['스토아', /스토아|에피쿠로스/, 'short'],
  ['보험', /보험/, 'short'],
  ['집중력', /집중/, 'short'],
  ['환율', /환율|달러/, 'short'],
  ['AI 에이전트', /에이전트|맡기면|AI에게 뜻|금지된 일을 안 해도|하나씩 허락한|여러 AI가/, 'short'],
  ['불교', /불교/, 'short'],
  ['칸트', /칸트/, 'short'],
  ['회사를 옮길지 고민될 때 들을 만한 이야기', JOB, 'sentence'],
  ['금리가 오르면 대출 이자는 어떻게 되나', /금리|이자|대출|채권/, 'sentence'],
  ['잠을 자도 계속 피곤한 이유', /잠|수면/, 'sentence'],
  ['AI 때문에 개발자 일자리가 줄어드나', /개발자|취업|일자리|AI를 쓸 수 있다는 것|AI 교육/, 'sentence'],
  ['공장에서 사고를 줄이는 방법', SAFETY, 'sentence'],
];

const VARIANTS = ['A', 'B', 'C', 'D', 'E'];

function parseVector(text) {
  return text
    .slice(1, -1)
    .split(',')
    .map(Number);
}

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
}

function metaText(row) {
  const tags = Array.isArray(row.tags) ? row.tags.join(', ') : '';
  return [row.title, row.description, tags].filter((part) => part && part.trim() !== '').join('\n');
}

async function embed(text) {
  const base = process.env.AI_SERVER_URL.replace(/\/+$/, '');
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${base}/embeddings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-token': process.env.AI_SERVER_INTERNAL_TOKEN,
      },
      body: JSON.stringify({ text }),
    });
    if (response.ok) {
      const body = await response.json();
      if (body.model !== MODEL) throw new Error(`model mismatch: ${body.model}`);
      return body.vector;
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw new Error('embedding failed');
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        out[index] = await fn(items[index], index);
      }
    }),
  );
  return out;
}

function quantile(sorted, q) {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const f3 = (value) => value.toFixed(3);

async function main() {
  const db = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  await db.connect();
  await db.query('BEGIN READ ONLY');
  const { rows } = await db.query(
    `SELECT c.id, c.title, c.description, c.tags, e.embedding::text AS script_vector
       FROM contents c
       JOIN content_embeddings e
         ON e.content_id = c.id AND e.model = $1 AND e.content_version = c.content_version
      WHERE c.status = 'published' AND c.market = 'kr'`,
    [MODEL],
  );
  await db.query('ROLLBACK');
  await db.end();

  const contents = rows.map((row) => ({
    id: row.id,
    title: row.title,
    script: parseVector(row.script_vector),
    meta: metaText(row),
  }));

  const titleVectors = await mapLimit(contents, CONCURRENCY, (c) => embed(c.title));
  const metaVectors = await mapLimit(contents, CONCURRENCY, (c) => embed(c.meta));
  const queryVectors = await mapLimit(QUERIES, CONCURRENCY, ([q]) => embed(q));

  const results = QUERIES.map(([q, rel, kind], qi) => {
    const qv = queryVectors[qi];
    const scored = contents.map((c, ci) => {
      const A = dot(qv, c.script);
      const B = dot(qv, titleVectors[ci]);
      const C = dot(qv, metaVectors[ci]);
      return { title: c.title, relevant: rel.test(c.title), A, B, C, D: Math.max(A, C), E: Math.max(A, B) };
    });
    return { q, kind, scored };
  });

  if (process.env.DUMP_JSON) {
    process.stdout.write(JSON.stringify(results));
    return;
  }

  console.log(`contents=${contents.length} queries=${QUERIES.length}`);

  // 1) 질의별 상위 5
  for (const { q, kind, scored } of results) {
    console.log(`\n### ${q} (${kind}) — 관련 ${scored.filter((s) => s.relevant).length}편`);
    for (const v of VARIANTS) {
      const top = [...scored].sort((a, b) => b[v] - a[v]).slice(0, 5);
      const hits = top.filter((s) => s.relevant).length;
      console.log(
        `  ${v} P@5=${hits}/5  ` +
          top.map((s) => `${s.relevant ? 'O' : 'x'}${f3(s[v])} ${s.title.slice(0, 22)}`).join(' | '),
      );
    }
  }

  // 2) 변형별 요약 — P@5 평균, 관련/무관 점수 분포
  console.log('\n## 요약 (short / sentence)');
  for (const kind of ['short', 'sentence']) {
    const subset = results.filter((r) => r.kind === kind);
    for (const v of VARIANTS) {
      let p5 = 0;
      let top1 = 0;
      const relevantTop = [];
      const irrelevantTop = [];
      for (const { scored } of subset) {
        const sorted = [...scored].sort((a, b) => b[v] - a[v]);
        p5 += sorted.slice(0, 5).filter((s) => s.relevant).length / 5;
        top1 += sorted[0].relevant ? 1 : 0;
        // 관련 편 중 최고 점수, 무관 편 중 최고 점수 — 하한을 어디에 둬야 소음을 끊는가
        const bestRel = sorted.find((s) => s.relevant);
        const bestIrr = sorted.find((s) => !s.relevant);
        if (bestRel) relevantTop.push(bestRel[v]);
        if (bestIrr) irrelevantTop.push(bestIrr[v]);
      }
      relevantTop.sort((a, b) => a - b);
      irrelevantTop.sort((a, b) => a - b);
      console.log(
        `  [${kind}] ${v}: P@5=${f3(p5 / subset.length)} top1=${top1}/${subset.length} ` +
          `관련최고 p10/p50/p90=${f3(quantile(relevantTop, 0.1))}/${f3(quantile(relevantTop, 0.5))}/${f3(quantile(relevantTop, 0.9))} ` +
          `무관최고 p10/p50/p90=${f3(quantile(irrelevantTop, 0.1))}/${f3(quantile(irrelevantTop, 0.5))}/${f3(quantile(irrelevantTop, 0.9))}`,
      );
    }
  }

  // 3) 하한 훑기 — (질의, 콘텐츠) 쌍 전체에서 점수 ≥ t를 "맞음"으로 볼 때의 정밀도·재현율
  console.log('\n## 하한 훑기 (전 질의, 쌍 단위 micro)');
  for (const v of VARIANTS) {
    const lines = [];
    for (let t = 0.2; t <= 0.601; t += 0.02) {
      let tp = 0;
      let fp = 0;
      let fn = 0;
      for (const { scored } of results) {
        for (const s of scored) {
          const hit = s[v] >= t;
          if (hit && s.relevant) tp += 1;
          else if (hit) fp += 1;
          else if (s.relevant) fn += 1;
        }
      }
      const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
      const recall = tp / (tp + fn);
      const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
      lines.push(`t=${t.toFixed(2)} P=${f3(precision)} R=${f3(recall)} F1=${f3(f1)} hits=${tp + fp}`);
    }
    console.log(`  ${v}\n    ${lines.join('\n    ')}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
