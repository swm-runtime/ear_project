import fs from "node:fs/promises";
import path from "node:path";

/** 산출물 읽기 — S3 이관 전에는 local: 키를 산출물 작업 루트(WORK_ROOT — 워커와 같은 곳)에서 읽는다 (spec/08 2장). M4 에서 s3: 키 지원 추가. */
export async function readArtifact(key: string | null | undefined): Promise<string | null> {
  if (!key) return null;
  if (key.startsWith("local:")) {
    const root = process.env.WORK_ROOT ?? process.env.REPO_ROOT;
    if (!root) return null;
    const p = path.resolve(root, key.slice(6));
    if (!p.startsWith(path.resolve(root))) return null;
    try { return await fs.readFile(p, "utf-8"); } catch { return null; }
  }
  return null;
}

export interface Turn { kind: "E" | "Y" | "plain" | "meta" | "section"; n?: number; speaker?: string; text: string; section?: string }

/** 대본 md → 턴 목록 (E/Y 라벨 규격, spec/04). 번호 없는 발화(콜드오픈·인트로·클로징)는 구역 이름을 라벨로 쓴다. */
export function parseScript(md: string): Turn[] {
  const out: Turn[] = [];
  let section = "";
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      const t = line.replace(/^#+\s*/, "");
      section = (t.match(/\[([^\]]+)\]/)?.[1] ?? t).trim();
      out.push({ kind: "section", text: t });
      continue;
    }
    // A형(정규 형식, 2026-09-01 통일): [윤아] E12 · 본문
    let m = line.match(/^\[(윤아|이음)\]\s*([EY])(\d+)\s*·\s*(.*)$/);
    if (m) { out.push({ kind: m[2] as "E" | "Y", n: Number(m[3]), speaker: m[1], text: m[4], section }); continue; }
    // B형(구형): E12 [윤아] 본문
    m = line.match(/^([EY])(\d+)\s+\[(윤아|이음)\]\s*(.*)$/);
    if (m) { out.push({ kind: m[1] as "E" | "Y", n: Number(m[2]), speaker: m[3], text: m[4], section }); continue; }
    m = line.match(/^\[(윤아|이음)\]\s*(.*)$/);
    if (m) { out.push({ kind: "plain", speaker: m[1], text: m[2], section: section || "발췌" }); continue; }
    out.push({ kind: "meta", text: line });
  }
  return out;
}

export interface CriticFlag { n: string; where: string; item: string; strength?: string; note: string }

/**
 * 비평 리포트의 플래그 표·⭐ 표를 파싱한다.
 * 표의 열 구성이 리포트마다 다르므로(위치/턴, 강도 유무 등) **헤더 이름으로 열을 찾는다**.
 */
export function parseCriticReport(md: string): { flags: CriticFlag[]; stars: CriticFlag[] } {
  const flags: CriticFlag[] = [];
  const stars: CriticFlag[] = [];
  let section: "flags" | "stars" | null = null;
  let cols: string[] = [];

  const cells = (line: string) => line.split("|").slice(1, -1).map((c) => c.trim());
  const pick = (row: string[], names: string[]) => {
    for (const nm of names) {
      const i = cols.findIndex((c) => c.includes(nm));
      if (i >= 0 && row[i]) return row[i];
    }
    return "";
  };

  for (const line of md.split("\n")) {
    if (line.startsWith("## ")) {
      section = /플래그|문제 지점/.test(line) ? "flags" : /잘된 지점|⭐/.test(line) ? "stars" : null;
      cols = [];
      continue;
    }
    if (!section || !line.trim().startsWith("|")) continue;
    const row = cells(line);
    if (row.length < 3) continue;
    if (/^-+$/.test(row[0].replace(/[-: ]/g, "-"))) continue;      // 구분선
    if (row[0] === "#" || row.some((c) => c === "판정(사람)")) { cols = row; continue; }  // 헤더
    if (!cols.length) continue;

    const num = row[0].replace(/[⭐#\s]/g, "");
    if (!/^\d+$/.test(num)) continue;
    const item = {
      n: num,
      where: pick(row, ["턴", "위치"]),
      item: section === "flags" ? pick(row, ["항목"]) : "⭐",
      strength: pick(row, ["강도"]) || undefined,
      note: pick(row, ["지적", "무엇이 좋은가", "내용"]),
    };
    (section === "flags" ? flags : stars).push(item);
  }
  return { flags, stars };
}

/** 대본 파일에서 특정 턴(E12·Y7 등)의 본문만 교체한다. 원문 그대로의 라인 치환이라 나머지는 손대지 않는다. */
export function replaceTurn(md: string, turn: string, after: string): { md: string; before: string } | null {
  const lines = md.split("\n");
  const reA = new RegExp(`^\\[(윤아|이음)\\]\\s*${turn}\\s*·\\s*(.*)$`); // A형 (정규)
  const reB = new RegExp(`^${turn}\\s+\\[(윤아|이음)\\]\\s*(.*)$`);        // B형 (구형)
  for (let i = 0; i < lines.length; i++) {
    let m = lines[i].match(reA);
    if (m) { const before = m[2]; lines[i] = `[${m[1]}] ${turn} · ${after}`; return { md: lines.join("\n"), before }; }
    m = lines[i].match(reB);
    if (m) { const before = m[2]; lines[i] = `${turn} [${m[1]}] ${after}`; return { md: lines.join("\n"), before }; }
  }
  return null;
}

export interface ScoreRow { key: string; axis: string; item: string; ai: number | null; max: number | null; evidence: string }
/** critic-v2 리포트 1장 점수표 → 행 배열 + 합계 문자열. 헤더 "축 | 항목 | 점수 | 근거 …" 기준, 합계 행은 total로. */
export function parseCriticScores(md: string): { rows: ScoreRow[]; total: string | null } {
  const rows: ScoreRow[] = []; let total: string | null = null; let inTable = false;
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    if (/^##\s*1\./.test(line)) { inTable = true; continue; }
    if (/^##\s*[2-9]\./.test(line)) { if (inTable) break; continue; }
    if (!inTable || !line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 3 || /^-+$/.test(cells[0]) || cells[0] === "축") continue;
    if (/합계/.test(cells[0] + cells[1])) { total = cells[2].replace(/\*/g, "") || null; continue; }
    const sm = cells[2].match(/(\d+)\s*\/\s*(\d+)/);
    rows.push({ key: cells[1].match(/^\d+\.\d+/)?.[0] ?? cells[1], axis: cells[0].replace(/\*/g, ""), item: cells[1].replace(/^\d+\.\d+\s*/, ""), ai: sm ? Number(sm[1]) : null, max: sm ? Number(sm[2]) : null, evidence: cells[3] ?? "" });
  }
  return { rows, total };
}

/** 콜드오픈이 본편 턴의 부분 문자열인지 (spec/04 규격) — 사람 수정 후 깨졌는지 검사 */
export function coldOpenStatus(md: string): { turn: string | null; ok: boolean } {
  const turn = md.match(/본편\s*(E\d+)에서 발췌/)?.[1] ?? null;
  const cold = md.split("\n").find((l) => /^\[(윤아|이음)\]/.test(l.trim()))?.replace(/^\[(윤아|이음)\]\s*/, "").trim();
  if (!turn || !cold) return { turn, ok: false };
  const body = md.split("\n").map((l) => l.trim()).find((l) => l.startsWith(`${turn} `) || new RegExp(`^\\[(윤아|이음)\\]\\s*${turn}\\s*·`).test(l))
    ?.replace(/^E\d+\s+\[(윤아|이음)\]\s*/, "").replace(/^\[(윤아|이음)\]\s*E\d+\s*·\s*/, "") ?? "";
  return { turn, ok: body.includes(cold) };
}
