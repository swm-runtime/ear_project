/**
 * 빌드 메타 — `public/build-meta.json`에 이 빌드가 구운 데이터의 지문을 남긴다. 다음 빌드 판정(`should-build.mjs`)이
 * 운영 사이트의 이 파일과 지금 API 의 지문을 비교해 "데이터가 바뀌었으니 다시 빌드"를 판단한다(2026-10-08).
 * 실패해도 빌드를 멈추지 않는다 — 지문이 null 이면 다음 판정이 빌드 쪽으로 기운다.
 */
import { writeFileSync } from "node:fs";
import { topicsFingerprint } from "./topics-fingerprint.mjs";

const topics = await topicsFingerprint();
writeFileSync(
  new URL("../public/build-meta.json", import.meta.url),
  `${JSON.stringify({ topics, commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null, builtAt: new Date().toISOString() })}\n`,
);
console.log(`[build-meta] topics=${topics ?? "unavailable"}`);
