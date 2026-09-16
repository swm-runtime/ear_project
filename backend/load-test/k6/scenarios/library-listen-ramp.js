// 시나리오 1-R — 청취 여정을 천천히 올려 한계 지점을 찾는다 (임계값이 어디서 깨지는지 보는 용도).
// 여정은 library-listen.js 그대로, 부하 곡선만 다르다: MAX_VUS 까지 STEP 명씩 STEP_DURATION 마다 계단식으로 올리고
// 마지막에 HOLD 만큼 유지한 뒤 30초에 내린다. 임계값을 어겨도 중단하지 않는다 — 어디부터 깨지는지 보는 게 목적이다.
//
//   K6_WEB_DASHBOARD=true k6 run -e BASE_URL=https://api-dev.earcast.co.kr/api/v1 -e MAX_VUS=300 -e STEP=50 \
//     -e STEP_DURATION=1m -e HOLD=1m k6/scenarios/library-listen-ramp.js
//
// 계정 수 ≥ MAX_VUS 이어야 한다(사용자당 분당 300회 제한 — config.js 주석).
import { listenJourney } from './library-listen.js';
import { COMMON_THRESHOLDS, TOKENS, warnIfAccountsOverlap } from '../lib/config.js';

const MAX_VUS = Number(__ENV.MAX_VUS || 300);
const STEP = Number(__ENV.STEP || 50);
const STEP_DURATION = __ENV.STEP_DURATION || '1m';
const HOLD = __ENV.HOLD || '1m';

const stages = [];
for (let v = STEP; v < MAX_VUS; v += STEP) stages.push({ duration: STEP_DURATION, target: v });
stages.push({ duration: STEP_DURATION, target: MAX_VUS });
stages.push({ duration: HOLD, target: MAX_VUS });
stages.push({ duration: '30s', target: 0 });

export const options = {
  scenarios: {
    ramp: { executor: 'ramping-vus', startVUs: 0, stages, gracefulRampDown: '30s', exec: 'journey' },
  },
  thresholds: {
    ...COMMON_THRESHOLDS,
    'http_req_duration{name:/contents/:id/play}': ['p(95)<700'],
    'http_req_duration{name:/users/me/playback-progresses/:id}': ['p(95)<300'],
  },
};

export function setup() {
  warnIfAccountsOverlap(TOKENS, MAX_VUS, 'listen-ramp');
  console.log(`ramp: ${stages.map((s) => `${s.target}@${s.duration}`).join(' → ')}`);
  return {};
}

export const journey = listenJourney;
export default listenJourney;
