/**
 * Vercel "Ignored Build Step"(`vercel.json` ignoreCommand) — **종료 코드 1 = 빌드, 0 = 건너뜀**(Unix 관례와 반대).
 *
 * 2026-10-07 "랜딩이 바뀐 커밋만 배포"(`git diff HEAD^ HEAD -- .`)로 바꿨더니 **매일 아침 재빌드 훅까지 건너뛰었다.**
 * 훅 배포도 같은 판정을 타고, Vercel 은 훅과 git 푸시를 구분할 값을 주지 않는다 — 그날 이후 랜딩이 한 번도 다시
 * 빌드되지 않았다(2026-10-08 발견). 그래서 "왜 빌드하는가"를 직접 본다.
 *
 * 1. 랜딩 파일이 바뀌었다 — 마지막 성공 배포(`VERCEL_GIT_PREVIOUS_SHA`)부터 지금까지(머지 커밋이 여러 개여도). 그 SHA 가
 *    얕은 클론에 없으면 직전 커밋과 비교한다
 * 2. (운영 배포만) 빌드 때 굽는 데이터(`/public/topics`)가 운영 사이트에 구워진 것과 다르다 — 운영 사이트의
 *    `build-meta.json`이 없거나 읽히지 않으면 빌드한다(처음 한 번)
 * 3. 그 밖은 건너뛴다. API 가 응답하지 않으면 건너뛴다 — 기본 목록으로 덮어쓰는 빌드를 만들지 않는다
 *
 * 그래서 dev 머지마다 빌드하지 않으면서, 매일 훅(05:30)은 주제가 바뀐 날에만 실제로 빌드한다.
 */
import { execSync } from "node:child_process";
import { topicsFingerprint } from "./topics-fingerprint.mjs";

const BUILD = 1;
const SKIP = 0;
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://earcast.co.kr").replace(/\/$/, "");

function landingChanged() {
  const prev = process.env.VERCEL_GIT_PREVIOUS_SHA;
  let base = "HEAD^";
  if (prev) {
    try {
      execSync(`git cat-file -e ${prev}^{commit}`, { stdio: "ignore" });
      base = prev;
    } catch {
      // 얕은 클론에 없다 — 직전 커밋으로
    }
  }
  try {
    execSync(`git diff --quiet ${base} HEAD -- .`, { stdio: "ignore" });
    return { changed: false, base };
  } catch {
    return { changed: true, base };
  }
}

async function main() {
  const { changed, base } = landingChanged();
  if (changed) {
    console.log(`[should-build] 랜딩 파일 변경(${base.slice(0, 8)}..HEAD) — 빌드`);
    return BUILD;
  }
  if (process.env.VERCEL_ENV !== "production") {
    console.log("[should-build] 랜딩 변경 없음(미리보기) — 건너뜀");
    return SKIP;
  }

  const current = await topicsFingerprint();
  if (current === null) {
    console.log("[should-build] 주제 API 응답 없음 — 건너뜀(기본 목록으로 덮지 않는다)");
    return SKIP;
  }

  let deployed = null;
  try {
    const response = await fetch(`${SITE_URL}/build-meta.json`, { signal: AbortSignal.timeout(5_000), cache: "no-store" });
    if (response.ok) deployed = (await response.json()).topics ?? null;
  } catch {
    // 아래에서 빌드
  }
  if (deployed !== current) {
    console.log(`[should-build] 주제 데이터 변경(${deployed ?? "기록 없음"} → ${current}) — 빌드`);
    return BUILD;
  }
  console.log("[should-build] 랜딩·주제 모두 그대로 — 건너뜀");
  return SKIP;
}

process.exit(await main());
