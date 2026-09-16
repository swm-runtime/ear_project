// smoke — 시나리오 전부를 1명이 1회씩 밟는다. 부하가 아니라 "스크립트와 계정이 실서버에 맞는가" 확인용.
// 부하를 걸기 전에 반드시 이걸 먼저 통과시킨다. 실패하면 임계값이 아니라 여정(경로·필드·계정 상태) 문제다.
//
//   k6 run k6/scenarios/smoke.js
import { browseJourney } from './library-browse.js';
import { deleteUndoJourney } from './library-delete-undo.js';
import { listenJourney } from './library-listen.js';
import { paywallJourney } from './paywall-limit.js';
import { tokensByTier } from '../lib/config.js';

// 청취는 위치 저장 6회(30초)를 그대로 밟게 둔다 — 실서버 계약과 페이싱을 한 번은 실제 값으로 확인해야 한다
const scenarios = {
  smoke_browse: { executor: 'per-vu-iterations', vus: 1, iterations: 1, exec: 'browse', maxDuration: '2m' },
  smoke_listen: { executor: 'per-vu-iterations', vus: 1, iterations: 1, exec: 'listen', maxDuration: '3m' },
  smoke_delete_undo: { executor: 'per-vu-iterations', vus: 1, iterations: 1, exec: 'deleteUndo', maxDuration: '2m', startTime: '10s' },
};
// light 계정이 있을 때만 페이월도 밟는다(하루 한 계정 한 번이라 smoke에서 쓰면 그날 그 계정은 소진된다)
if (tokensByTier('light').length > 0 && __ENV.SMOKE_PAYWALL === '1') {
  scenarios.smoke_paywall = { executor: 'per-vu-iterations', vus: 1, iterations: 1, exec: 'paywall', maxDuration: '2m' };
}

export const options = {
  scenarios,
  thresholds: { checks: ['rate>0.99'] },
};

export const browse = browseJourney;
export const listen = listenJourney;
export const deleteUndo = deleteUndoJourney;
export const paywall = paywallJourney;
