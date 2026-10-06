import { getBytes } from "@/lib/storage";

/**
 * 발행 오디오 파일 (2026-10-06 음질 확정, KAN-141·142) — 서버(라우트) 전용.
 *
 * - 압축(`audio`): `dist.m4a`(AAC 192k — Light·Daily, 2026-10-06~)가 있으면 그것, 없으면 구 형식 `dist.mp3`.
 * - 무손실(`audio_lossless`): `lossless.flac`(Pro). **백엔드가 flac 을 받기 전(KAN-141 코멘트 2026-10-06 요청)에는 켜지 않는다** —
 *   wav 만 받는 서버에 flac 을 보내면 업로드가 거부된다. 켜도 파일이 없는 편(구 음원)은 압축만 보낸다.
 * 백엔드는 오디오를 바꾸는 재발행을 음질 세트로 본다 — 안 보낸 음질의 행은 지운다(admin-api 4.10).
 */
export const SEND_LOSSLESS_AUDIO = false;

export const DIST_FILES = [
  { file: "dist.m4a", ext: "m4a", type: "audio/mp4" },
  { file: "dist.mp3", ext: "mp3", type: "audio/mpeg" },
] as const;
export const LOSSLESS_FILE = { file: "lossless.flac", ext: "flac", type: "audio/flac" } as const;

export type DistFile = (typeof DIST_FILES)[number];

/** 이 에피소드의 압축 배포본 — m4a 우선, 없으면 mp3, 둘 다 없으면 null */
export async function findDistAudio(episodeId: string): Promise<DistFile | null> {
  for (const d of DIST_FILES) if (await getBytes(`episodes/${episodeId}/audio/${d.file}`, true)) return d;
  return null;
}

export async function hasLosslessAudio(episodeId: string): Promise<boolean> {
  return !!(await getBytes(`episodes/${episodeId}/audio/${LOSSLESS_FILE.file}`, true));
}
