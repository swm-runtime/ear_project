import fs from "node:fs/promises";
import path from "node:path";
import { cfg } from "./config.js";

/**
 * 워커 디스크 관리 (2026-10-02 — ENOSPC 로 발행분 일괄 음원 다시 변환 38편 실패, 9편은 합성까지 마치고 조립·쓰기에서 죽어 크레딧만 썼다).
 * 서버 디스크는 20GB 이고 WORK_ROOT 는 S3 캐시인데, 단계마다 episodes/{id}/ 를 통째로 내려받고 지우지 않아 오디오(편당 master.wav 약 100MB +
 * dist.mp3 약 27MB + 디버그 정렬)가 쌓였다.
 */

/** WORK_ROOT 가 있는 파일시스템의 여유 공간(GB) */
export async function freeGb(dir = cfg.workRoot): Promise<number> {
  const s = await fs.statfs(dir);
  return (Number(s.bavail) * Number(s.bsize)) / 1e9;
}

/**
 * 작업이 끝나면(성공·실패 모두) 그 에피소드의 오디오 캐시를 지운다 — 원본은 S3 다(spec/10 3.3). 오디오만 지우는 이유: 대본·리포트는 작고,
 * 오디오는 TTS·패키지·자막 정렬만 쓰며 각 단계가 시작할 때 다시 내려받는다. 실패한 합성의 미업로드분이 다음 push 로 올라가는 것도 막는다.
 * 워커는 작업을 한 번에 하나만 돌리므로 다른 작업과 겹치지 않는다.
 */
export async function evictEpisodeAudio(payload: Record<string, unknown> | null | undefined): Promise<void> {
  const id = String(payload?.episode_id ?? "");
  if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) return;
  await fs.rm(path.join(cfg.workRoot, "episodes", id, "audio"), { recursive: true, force: true });
}
