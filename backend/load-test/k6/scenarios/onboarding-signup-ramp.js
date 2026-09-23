// 시나리오 6 — 가입 몰림(온보딩 여정)을 분당 가입 수로 계단식 올려 한계 지점을 찾는다.
// 광고 직후 "설치 → 온보딩 → 첫 드립 편성"이 몇 분 안에 몰리는 상황이다. 청취 램프(1-R)와 달리
// 동시 사용자가 아니라 **분당 도착 수(arrival rate)** 로 부하를 건다 — 가입은 한 계정에 한 번뿐이라
// VU 를 오래 붙잡지 않고, 계정 수 = 가입 시도 총 수다(server/seed-signups.js).
//
//   GET   /onboarding/state                     스플래시 뒤 재개 지점
//   GET   /onboarding/topics                    1단계 주제 목록
//   PUT   /onboarding/interests                 관심 주제 3개 저장
//   PATCH /onboarding/career                    2단계 저장(절반은 건너뛰기)
//   GET   /onboarding/recommendations           3단계 추천
//   POST  /onboarding/picks                     (PICKS>0 일 때만) 담기 — Idempotency-Key
//   POST  /onboarding/complete                  완료 + 첫 드립 편성 트리거 ← 무거운 지점
//   GET   /onboarding/first-drip × N            0건 담기면 1초 간격 폴링(최대 15초, 앱과 동일)
//
//   k6 run -e BASE_URL=https://api-dev.earcast.co.kr/api/v1 -e RATES=50,100,200,400 -e STEP_DURATION=2m \
//     -e ACCOUNT_OFFSET=10 k6/scenarios/onboarding-signup-ramp.js
//   k6 run -e BASE_URL=… -e SMOKE=1 k6/scenarios/onboarding-signup-ramp.js        # 1명 1회 — 여정 확인
//
// 환경변수: RATES(분당 가입 수 단계, 기본 50,100,200,400) · STEP_DURATION(기본 2m) · PICKS(3단계 담기 수, 기본 0 — 첫 드립 대기 경로)
//          ACCOUNT_OFFSET(계정 시작 순번 — 한 번 완료한 계정은 다시 못 쓰므로 실행마다 다르게 준다) · SMOKE=1
//          PREALLOC_VUS/MAX_VUS(기본 60/400 — 여정이 약 11초라 분당 가입 수 × 11 ÷ 60 만큼 VU 가 동시에 산다. 모자라면 dropped_iterations)
// 임계값을 어겨도 중단하지 않는다 — 어디부터 깨지는지 보는 게 목적이다.
import { check } from 'k6';
import exec from 'k6/execution';
import http from 'k6/http';
import { Counter, Trend } from 'k6/metrics';

import { BASE_URL, COMMON_THRESHOLDS, TOKENS } from '../lib/config.js';
import { authGet, authPut, expectJson, pick, think } from '../lib/http.js';

const RATES = String(__ENV.RATES || '50,100,200,400').split(',').map(Number);
const STEP_DURATION = __ENV.STEP_DURATION || '2m';
const PICKS = Number(__ENV.PICKS || 0);
const ACCOUNT_OFFSET = Number(__ENV.ACCOUNT_OFFSET || 0);
const SMOKE = __ENV.SMOKE === '1';
const POLL_INTERVAL_SEC = 1;
const POLL_MAX_SEC = 15;

const completeLatency = new Trend('ear_complete_latency', true);
/** 완료 요청부터 첫 드립 종료 상태까지 — 폴링 왕복 포함(앱이 로딩 화면을 보는 시간) */
const firstDripWait = new Trend('ear_first_drip_wait', true);
const firstDripStatus = new Counter('ear_first_drip_status');
const noAccount = new Counter('ear_no_account');
const journeyDone = new Counter('ear_signups_completed');

/** http.js 에 없는 PATCH·멱등키 POST — 태그 규칙은 같게 맞춘다 */
function raw(method, token, path, body, extraHeaders = {}) {
  return http.request(method, `${BASE_URL}${path}`, JSON.stringify(body), {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json', ...extraHeaders },
    tags: { name: path },
  });
}

const stages = RATES.map((r) => ({ duration: STEP_DURATION, target: r }));
stages.push({ duration: '30s', target: 0 });

export const options = {
  scenarios: SMOKE
    ? { smoke: { executor: 'per-vu-iterations', vus: 1, iterations: 1, exec: 'signupJourney', maxDuration: '2m' } }
    : {
        signup: {
          executor: 'ramping-arrival-rate',
          startRate: RATES[0],
          timeUnit: '1m',
          preAllocatedVUs: Number(__ENV.PREALLOC_VUS || 60),
          maxVUs: Number(__ENV.MAX_VUS || 400),
          stages,
          exec: 'signupJourney',
        },
      },
  thresholds: {
    ...COMMON_THRESHOLDS,
    'http_req_duration{name:/onboarding/complete}': ['p(95)<700'],
    'http_req_duration{name:/onboarding/recommendations}': ['p(95)<800'],
  },
};

export function setup() {
  const minutes = parseInt(STEP_DURATION, 10) || 1;
  const total = SMOKE ? 1 : RATES.reduce((a, r) => a + r, 0) * minutes;
  const available = Math.max(0, TOKENS.length - ACCOUNT_OFFSET);
  console.log(
    `signup ramp: ${SMOKE ? 'smoke 1회' : RATES.map((r) => `${r}/min@${STEP_DURATION}`).join(' → ')} · 계정 ${available}개(offset ${ACCOUNT_OFFSET}) · 필요 약 ${total}`,
  );
  if (available < total) console.warn(`계정이 모자란다 — 약 ${total - available}건은 실행되지 않는다(ear_no_account)`);
  return {};
}

export function signupJourney() {
  // 가입 1건 = 계정 1개. 전체 테스트에서 유일한 순번으로 계정을 집는다
  const idx = ACCOUNT_OFFSET + exec.scenario.iterationInTest;
  if (idx >= TOKENS.length) {
    noAccount.add(1);
    return;
  }
  const { token } = TOKENS[idx];
  const keyBase = `k6-signup-${idx}`;

  if (!expectJson(authGet(token, '/onboarding/state'), 200, 'state')) return;
  think();

  const topics = expectJson(authGet(token, '/onboarding/topics'), 200, 'topics');
  if (!topics || !Array.isArray(topics.items) || topics.items.length === 0) return;
  const chosen = [];
  while (chosen.length < Math.min(3, topics.items.length)) {
    const t = pick(topics.items);
    if (!chosen.includes(t.topic_id)) chosen.push(t.topic_id);
  }
  think();

  if (!expectJson(authPut(token, '/onboarding/interests', { topic_ids: chosen }), 200, 'interests')) return;
  think();

  // 절반은 커리어 입력, 절반은 건너뛰기 — 실제 분포를 흉내 낸다
  const careerBody = idx % 2 === 0 ? {} : { job_category: '개발', job_title: '백엔드 엔지니어', years_of_experience: '2-3' };
  if (!expectJson(raw('PATCH', token, '/onboarding/career', careerBody), 200, 'career')) return;
  think();

  const rec = expectJson(authGet(token, '/onboarding/recommendations'), 200, 'recommendations');
  if (!rec) return;
  think();

  if (PICKS > 0) {
    const ids = [];
    for (const s of rec.sections || []) for (const c of s.items || []) if (ids.length < PICKS) ids.push(c.content_id);
    if (ids.length > 0) {
      if (!expectJson(raw('POST', token, '/onboarding/picks', { content_ids: ids }, { 'Idempotency-Key': `${keyBase}-picks` }), 200, 'picks')) return;
      think();
    }
  }

  const t0 = Date.now();
  const done = raw('POST', token, '/onboarding/complete', {}, { 'Idempotency-Key': `${keyBase}-complete` });
  completeLatency.add(Date.now() - t0);
  const body = expectJson(done, 200, 'complete');
  if (!body) return;
  check(body, { 'complete → onboarding_completed': (b) => b.onboarding_completed === true });

  // 앱과 같은 대기 규칙 — 1초 간격, 최대 15초. 종료 상태(completed·no_candidates·queued)면 멈춘다
  let status = body.first_drip && body.first_drip.status;
  if (body.awaits_first_drip) {
    const deadline = Date.now() + POLL_MAX_SEC * 1000;
    while (status === 'pending' && Date.now() < deadline) {
      think(POLL_INTERVAL_SEC, POLL_INTERVAL_SEC);
      const fd = expectJson(authGet(token, '/onboarding/first-drip'), 200, 'first-drip');
      if (!fd) break;
      status = fd.status;
    }
  }
  firstDripWait.add(Date.now() - t0);
  firstDripStatus.add(1, { status: status || 'unknown' });
  check(status, { 'first drip settled within 15s': (s) => !!s && s !== 'pending' });
  journeyDone.add(1);
}

export default signupJourney;
