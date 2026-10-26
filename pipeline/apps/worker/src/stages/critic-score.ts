import { readFile } from "node:fs/promises";
import { cfg } from "../config.js";
import type { Executor } from "../executors/index.js";
import { assetPaths, buildCriticPromptInlinePartsEn, CRITIC_INLINE_SCHEMA_EN } from "@ear/pipeline";

/** 비평 v2 출력(critic.ts CriticV2Out 와 같은 모양) — 점수 부분만 */
interface CriticV2Scores { scores: { content: { value: number; argument: number; perspective: number; resonance: number }; structure: { opening: number; flow: number; ending: number }; naturalness: { spoken: number; exchange: number }; immersion: number; persona: { voice: number; listener: number } }; total: number }

export const criticV2Sums = (s: CriticV2Scores["scores"]) => {
  const sum = { content: s.content.value + s.content.argument + s.content.perspective + s.content.resonance, structure: s.structure.opening + s.structure.flow + s.structure.ending, naturalness: s.naturalness.spoken + s.naturalness.exchange, immersion: s.immersion, persona: s.persona.voice + s.persona.listener };
  return { ...sum, total: sum.content + sum.structure + sum.naturalness + sum.immersion + sum.persona };
};

/**
 * 글로벌 비평 v2 채점만 — 판정 루프의 발행 관문용 (2026-10-26 박수헌: "비평 60점 이상으로 바꾸자. 서비스가 이미 나갔고 점수를 비약적으로 올릴 수 없는 게 현실").
 * 운영 비평(critic.ts runCriticV2, 단발)과 같은 프롬프트·루브릭·모델·effort 로 돌려 합계만 돌려준다 — 리포트 파일·runs 는 남기지 않는다(비평 단계가 남긴다).
 * 재작성 회차의 대본은 비평 단계가 본 적이 없으므로 루프가 회차마다 여기로 다시 잰다.
 */
export async function scoreCriticV2En(ex: Executor, e: { episodeId: string; title: string; midTopic: string; assetRoot: string; scriptMd: string; label?: string; timeoutMin?: number }): Promise<{ total: number; sums: ReturnType<typeof criticV2Sums>; model: string | null; costUsd: number; durationMs: number }> {
  const ap = assetPaths(e.assetRoot, cfg.workRoot);
  const [rubricV2Md, guidelines] = await Promise.all([ap.criticRubricV2, ap.guidelines].map((p) => readFile(p, "utf8")));
  const parts = buildCriticPromptInlinePartsEn({ episodeId: e.episodeId, title: e.title, midTopic: e.midTopic, rubricV2Md, guidelines, scriptMd: e.scriptMd });
  const r = await ex.run<CriticV2Scores>({ prompt: parts.user, systemPrompt: parts.system, schema: CRITIC_INLINE_SCHEMA_EN, tools: [], allowedTools: [], cwd: cfg.workRoot, timeoutMs: (e.timeoutMin ?? 30) * 60_000, model: cfg.criticModel, maxThinkingTokens: cfg.thinkingCritic, effort: cfg.effortCritic, background: true });
  const sums = criticV2Sums(r.output.scores);
  return { total: sums.total, sums, model: r.model ?? null, costUsd: r.listCostUsd ?? 0, durationMs: r.durationMs ?? 0 };
}
