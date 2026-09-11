// 시나리오 1 — 청취 여정 (핵심 부하)
// 라이브러리 e2e "온보딩을 마치면 라이브러리에 드립이 보이고, 탭 한 번으로 재생·완청까지"에서 따왔다.
//
//   GET  /users/me/library-items?filter=unplayed      목록 진입
//   GET  /users/me/library-items/resume               이어듣기 카드
//   GET  /contents/:id                                상세
//   POST /contents/:id/audio-urls                     서명 URL 발급(플레이어 진입)
//   POST /contents/:id/play                           재생 시작 — 한도 판정·카운트
//   PUT  /users/me/playback-progresses/:id  × N       위치 저장(앱은 5초마다) ← 호출량의 대부분
//   POST /users/me/library-items/:itemId/complete     완청(서버가 max_reached ≥ 90%로 재판정)
//   GET  /users/me/library-items?filter=completed     완료 탭 확인
//
// 계정은 pro 티어를 우선 쓴다(한도 없음 — 여정이 403으로 끊기지 않게). pro가 없으면 전체 풀을 쓰되
// light는 하루 2편 뒤 403(PLAY_LIMIT_EXCEEDED)이 나며, 그 403은 "기대한 거절"로 따로 센다.
//
// 환경변수: SAVE_INTERVAL_SEC(기본 5 — 앱과 동일) · SAVES_PER_PLAY(기본 6 → 재생 1편 ≈ 30초)
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

import {
  COMMON_THRESHOLDS,
  TOKENS,
  VUS,
  rampStages,
  tokenForVu,
  tokensByTier,
  warnIfAccountsOverlap,
} from '../lib/config.js';
import { authGet, authPost, authPut, expectedDenials, expectJson, think } from '../lib/http.js';

const SAVE_INTERVAL_SEC = Number(__ENV.SAVE_INTERVAL_SEC || 5);
const SAVES_PER_PLAY = Number(__ENV.SAVES_PER_PLAY || 6);
const DEVICE_ID = 'k6-load-test';

const playLatency = new Trend('ear_play_latency', true);
const progressLatency = new Trend('ear_progress_latency', true);

const pool = tokensByTier('pro').length > 0 ? tokensByTier('pro') : TOKENS;

export const options = {
  scenarios: {
    listen: { executor: 'ramping-vus', stages: rampStages(), gracefulRampDown: '30s', exec: 'listenJourney' },
  },
  thresholds: {
    ...COMMON_THRESHOLDS,
    // 재생 시작은 트랜잭션(판정·play_records·라이브러리 전이·신호)이라 따로 본다
    'http_req_duration{name:/contents/:id/play}': ['p(95)<700'],
    // 위치 저장은 가장 잦은 쓰기 — 여기가 병목의 첫 후보다
    'http_req_duration{name:/users/me/playback-progresses/:id}': ['p(95)<300'],
  },
};

export function setup() {
  warnIfAccountsOverlap(pool, VUS, 'listen');
  return {};
}

export function listenJourney() {
  const { token } = tokenForVu(pool);

  // 1. 목록 진입 — 아직 안 들은 것부터
  const list = expectJson(authGet(token, '/users/me/library-items?filter=unplayed&limit=20'), 200, 'library list');
  if (!list) return;
  authGet(token, '/users/me/library-items/resume');
  think();

  // 재생할 항목: 안 들은 것이 없으면(다 완청) 전체 목록에서 아무거나 — 재청취 창(15일) 안이라 차감 없이 허용된다
  let item = list.items && list.items[0];
  if (!item) {
    const all = expectJson(authGet(token, '/users/me/library-items?filter=all&limit=20'), 200, 'library list(all)');
    item = all && all.items && all.items[Math.floor(Math.random() * all.items.length)];
    if (!item) {
      console.error('라이브러리가 비어 있다 — seed-users.js의 --items를 확인');
      return;
    }
  }
  const contentId = item.content.id;

  // 2. 상세 → 플레이어 진입(서명 URL) → 재생 시작
  expectJson(authGet(token, `/contents/${contentId}`), 200, 'content detail');
  think(0.5, 1.5);

  const issued = expectJson(authPost(token, `/contents/${contentId}/audio-urls`, { device_id: DEVICE_ID }), 201, 'audio-urls');
  if (!issued) return;
  const durationSec = issued.content.duration_sec;
  const contentVersion = issued.content.content_version;

  const playRes = authPost(token, `/contents/${contentId}/play`, { entry_point: 'library' });
  playLatency.add(playRes.timings.duration);
  if (playRes.status === 403) {
    // light 계정의 한도 소진 — 규칙대로 동작한 것이라 실패로 세지 않는다
    expectedDenials.add(1);
    check(playRes, { 'play 403 = PLAY_LIMIT_EXCEEDED': (r) => String(r.body).includes('PLAY_LIMIT') });
    return;
  }
  const played = expectJson(playRes, 200, 'play');
  if (!played) return;

  // 3. 위치 저장 — 앱이 5초마다 보내는 것을 그대로 흉내낸다
  const startSec = (played.progress && played.progress.position_sec) || 0;
  let position = startSec;
  for (let i = 0; i < SAVES_PER_PLAY; i++) {
    sleep(SAVE_INTERVAL_SEC);
    position = Math.min(durationSec, position + SAVE_INTERVAL_SEC);
    const res = authPut(token, `/users/me/playback-progresses/${contentId}`, {
      position_sec: position,
      max_reached_sec: position,
      listened_sec_delta: SAVE_INTERVAL_SEC,
      content_version: contentVersion,
    });
    progressLatency.add(res.timings.duration);
    if (!expectJson(res, 200, 'progress save')) return;
  }

  // 4. 끝까지 들은 것으로 — 90% 지점을 넘긴 도달 위치를 저장한 뒤 완청 호출
  const reached = Math.ceil(durationSec * 0.95);
  if (!expectJson(authPut(token, `/users/me/playback-progresses/${contentId}`, {
    position_sec: reached,
    max_reached_sec: reached,
    listened_sec_delta: SAVE_INTERVAL_SEC,
    content_version: contentVersion,
  }), 200, 'progress save(final)')) return;

  if (item.status !== 'completed') {
    const done = expectJson(authPost(token, `/users/me/library-items/${item.id}/complete`), 200, 'complete');
    if (done) check(done, { 'complete → status completed': (b) => b.status === 'completed' });
  }

  // 5. 완료 탭
  expectJson(authGet(token, '/users/me/library-items?filter=completed&limit=20'), 200, 'library list(completed)');
  think();
}

export default listenJourney;
