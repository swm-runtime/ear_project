import { test } from "node:test";
import assert from "node:assert/strict";

import { shortIntroVersion, shortSeriesFields, shortUploadFields } from "./short-publish";

// KAN-296 · KAN-298: 기존 판은 아무 필드도 더하지 않는다 — standard 에 variant_of_content_id 를 보내면 서버가 400
test("기존 판 — 필드 없음", () => {
  assert.deepEqual(shortUploadFields({ backlog_id: "C100", length_profile: "standard", remake_of_content_ref: "x" }, "single"), { fields: null, blocker: null });
  assert.deepEqual(shortUploadFields({ backlog_id: "C100" }, "series"), { fields: null, blocker: null });
});

test("짧은 판 단편 — 원본 content_id 를 variant_of_content_id 로, 훅 형태를 intro_version 으로", () => {
  assert.deepEqual(shortUploadFields({ backlog_id: "C610", length_profile: "short", remake_of_content_ref: "orig-1" }, "single"), {
    fields: { length_profile: "short", variant_of_content_id: "orig-1", intro_version: "hook-payoff" },
    blocker: null,
  });
});

test("짧은 판 단편 — 원본이 없으면 올리기 전에 막는다", () => {
  const r = shortUploadFields({ backlog_id: "C611", length_profile: "short", remake_of_content_ref: null }, "single");
  assert.equal(r.fields, null);
  assert.match(r.blocker ?? "", /C611/);
});

test("짧은 판 시리즈 편 — 원본은 선택", () => {
  assert.deepEqual(shortUploadFields({ backlog_id: "C625", length_profile: "short", remake_of_content_ref: "  " }, "series"), {
    fields: { length_profile: "short", intro_version: "hook-promise" },
    blocker: null,
  });
});

test("훅 형태 — 짝수는 선취형, 홀수는 약속형(shortHookFor 와 같은 값)", () => {
  assert.equal(shortIntroVersion("C636"), "hook-payoff");
  assert.equal(shortIntroVersion("C613"), "hook-promise");
  assert.match(shortIntroVersion("C613"), /^[a-z0-9][a-z0-9._-]{0,31}$/); // admin-api 4.6 intro_version 형식
});

test("짧은 판 시리즈 생성 — 원본 시리즈 제품 id 필수", () => {
  assert.deepEqual(shortSeriesFields("s-orig"), { fields: { length_profile: "short", variant_of_series_id: "s-orig" }, blocker: null });
  assert.equal(shortSeriesFields(null).fields, null);
  assert.ok(shortSeriesFields(" ").blocker);
});
