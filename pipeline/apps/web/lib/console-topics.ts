/**
 * 콘솔의 제품 주제 목록 — 이 콘솔 시장의 주제만 (2026-10-20). 서버 목록(admin-api 4.1)은 두 시장 주제를 섞어 주고 시장 칸이 없어
 * 발행·주제 관리 화면에 국내·글로벌 주제가 함께 보였다. 가르는 규칙은 lib/ear splitConsoleTopics.
 */
import { consoleMarketValue, listEarTopics, splitConsoleTopics, type EarTopic } from "./ear";
import { listPipelineTopicNames } from "@/app/actions";

export async function listConsoleTopics(): Promise<{ mine: EarTopic[]; others: EarTopic[] }> {
  const [{ items }, names] = await Promise.all([listEarTopics(), listPipelineTopicNames()]);
  return splitConsoleTopics(items, consoleMarketValue(), names);
}
