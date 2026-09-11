// 시나리오 3 — 삭제·실행 취소
// 라이브러리 e2e "삭제하면 목록에서 사라지고, 실행 취소하면 원래 순서로 돌아온다"에서 따왔다.
// 두 호출이 모두 멱등이라 여러 번 돌려도 계정 상태가 망가지지 않는다(마지막 요청이 최종 상태).
//
//   GET    /users/me/library-items?filter=all
//   DELETE /users/me/library-items/:itemId      소프트 삭제 → 204
//   GET    /users/me/library-items?filter=all   → 사라졌는지
//   POST   /users/me/library-items/:itemId/restore
//   GET    /users/me/library-items?filter=all   → 돌아왔는지
import { check } from 'k6';

import { COMMON_THRESHOLDS, TOKENS, VUS, rampStages, tokenForVu, warnIfAccountsOverlap } from '../lib/config.js';
import { authDel, authGet, authPost, expectJson, pick, think } from '../lib/http.js';

export const options = {
  scenarios: {
    deleteUndo: { executor: 'ramping-vus', stages: rampStages(), gracefulRampDown: '30s', exec: 'deleteUndoJourney' },
  },
  thresholds: COMMON_THRESHOLDS,
};

export function setup() {
  warnIfAccountsOverlap(TOKENS, VUS, 'delete-undo');
  return {};
}

export function deleteUndoJourney() {
  const { token } = tokenForVu();

  const before = expectJson(authGet(token, '/users/me/library-items?filter=all&limit=50'), 200, 'library before');
  if (!before || !before.items || before.items.length === 0) return;
  const target = pick(before.items);
  think(0.5, 1.5);

  // 삭제는 본문 없는 204다(library-api.md 4.6) — expectJson은 상태만 보고 빈 본문은 {}로 넘긴다
  if (!expectJson(authDel(token, `/users/me/library-items/${target.id}`), 204, 'delete')) return;

  const afterDelete = expectJson(authGet(token, '/users/me/library-items?filter=all&limit=50'), 200, 'library after delete');
  if (afterDelete) {
    check(afterDelete, { 'deleted item is gone': (b) => !b.items.some((i) => i.id === target.id) });
  }
  think(1, 2); // 실행 취소 스낵바를 보고 누르는 시간

  const restored = expectJson(authPost(token, `/users/me/library-items/${target.id}/restore`), 200, 'restore');
  if (!restored) return;

  const afterRestore = expectJson(authGet(token, '/users/me/library-items?filter=all&limit=50'), 200, 'library after restore');
  if (afterRestore) {
    check(afterRestore, { 'restored item is back': (b) => b.items.some((i) => i.id === target.id) });
  }
  think();
}

export default deleteUndoJourney;
