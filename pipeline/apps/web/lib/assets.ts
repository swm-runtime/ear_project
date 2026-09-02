/** 규칙 자산 목록 (spec/10 3.2) — 워커 apps/worker/src/assets.ts 의 DB_ASSET_KEYS 와 같은 7개. 순서 = 화면 순서 */
export const ASSET_KEYS: { key: string; label: string; group: string }[] = [
  { key: "skills/draft/guidelines.md", label: "대본 가이드라인", group: "생성" },
  { key: "skills/draft/examples/gold-T260820-001-short.md", label: "골드 — 숏폼 (T260820-001)", group: "생성" },
  { key: "skills/draft/examples/gold-T260820-002-full.md", label: "골드 — 본편 이음 해설 (T260820-002)", group: "생성" },
  { key: "skills/draft/examples/gold-T260828-001-full.md", label: "골드 — 본편 윤아 해설 (T260828-001)", group: "생성" },
  { key: "skills/qa/prompt.md", label: "QA 프롬프트", group: "검수" },
  { key: "skills/critic/rubric.md", label: "비평 루브릭 v1", group: "검수" },
  { key: "skills/critic/rubric-v2.md", label: "비평 루브릭 v2 (초안)", group: "검수" },
];

export const assetLabel = (key: string) => ASSET_KEYS.find((a) => a.key === key)?.label ?? key;

/** 다음 버전 라벨 제안 — full-v5.1 → full-v5.2 · critic-v2 → critic-v2.1 · gold@2026-08-28 → gold@오늘 */
export function bumpVersion(v: string, today = new Date().toISOString().slice(0, 10)): string {
  if (v.startsWith("gold@")) return `gold@${today}`;
  const m = v.match(/^(.*?v)(\d+)(?:\.(\d+))?(.*)$/);
  if (!m) return `${v}-next`;
  return `${m[1]}${m[2]}.${m[3] ? Number(m[3]) + 1 : 1}`;
}

export type DiffLine = { type: "same" | "add" | "del"; text: string };

/** 줄 단위 diff (LCS). 자산은 수백 줄이라 O(n·m) 으로 충분하다 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n"), b = after.split("\n");
  const n = a.length, m = b.length;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: "same", text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: "del", text: a[i] }); i++; }
    else { out.push({ type: "add", text: b[j] }); j++; }
  }
  while (i < n) out.push({ type: "del", text: a[i++] });
  while (j < m) out.push({ type: "add", text: b[j++] });
  return out;
}
