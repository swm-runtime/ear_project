import { test } from "node:test";
import assert from "node:assert/strict";

import { wouldDropLossless } from "./publish-files";

// KAN-145: 무손실 전송이 켜져 있고 이 에피소드에 lossless.flac 이 없을 때만 — 오디오 교체 재발행이 서버 무손실을 지울 수 있다
test("무손실 경고 — 전송이 켜져 있고 무손실 파일이 없을 때만", () => {
  assert.equal(wouldDropLossless({ lossless_enabled: true, has_lossless: false }), true);
  assert.equal(wouldDropLossless({ lossless_enabled: true, has_lossless: true }), false);
  assert.equal(wouldDropLossless({ lossless_enabled: false, has_lossless: null }), false); // 스위치가 꺼져 있으면 무손실을 보내지도 않고, 서버에도 지워질 무손실이 없다
  assert.equal(wouldDropLossless({ lossless_enabled: false, has_lossless: false }), false);
});
