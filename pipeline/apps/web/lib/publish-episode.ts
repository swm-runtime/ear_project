/**
 * 에피소드 발행 파일 모으기 (브라우저) — 단일 편 업로드 화면과 [시리즈 발행]이 같이 쓴다.
 * 오디오·무손실·썸네일은 `/api/publish/<id>` 가 S3 에서 중계하고, 추천 메타·자막은 있을 때만 붙인다(없어도 발행은 막지 않는다 — 시리즈는 추천 메타를 막는다, spec/11 7장).
 */
import { fetchDistAudio, fetchLosslessAudio } from "./publish-files";

export interface EpisodeFiles { audio: File; lossless: File | null; thumbnail: File; enrichment: File | null; embeddingNote: string; script: File | null }

export async function episodePublishFiles(episodeId: string, want: { enrichment: boolean; script: boolean }, override: { audio?: File | null; thumbnail?: File | null } = {}): Promise<EpisodeFiles> {
  const audio = override.audio ?? (await fetchDistAudio(episodeId));
  if (!audio) throw new Error(`${episodeId} 발행 오디오(dist.m4a·dist.mp3)를 읽지 못했어요`);
  // 무손실(Pro, KAN-141·142) — 에피소드 발행본을 쓸 때만. 서버 스위치(lib/audio-file.ts)가 꺼져 있거나 파일이 없으면 압축만 보낸다
  const lossless = override.audio ? null : await fetchLosslessAudio(episodeId);
  let thumbnail = override.thumbnail ?? null;
  if (!thumbnail) {
    const res = await fetch(`/api/publish/${episodeId}?thumbnail=1`);
    if (!res.ok) throw new Error(`${episodeId} 썸네일(thumbnail.png)을 읽지 못했어요`);
    thumbnail = new File([await res.blob()], `${episodeId}.png`, { type: "image/png" });
  }
  let enrichment: File | null = null; let embeddingNote = "";
  if (want.enrichment) {
    const res = await fetch(`/api/publish/${episodeId}?enrichment=1`);
    if (res.ok) { enrichment = new File([await res.blob()], "enrichment.json", { type: "application/json" }); embeddingNote = decodeURIComponent(res.headers.get("x-embedding-note") ?? ""); } // 임베딩 보완 결과 (lib/embedding.ts)
  }
  let script: File | null = null;
  if (want.script) {
    const res = await fetch(`/api/publish/${episodeId}?script=1`);
    if (res.ok) script = new File([await res.blob()], "script-segments.json", { type: "application/json" });
  }
  return { audio, lossless, thumbnail, enrichment, embeddingNote, script };
}
