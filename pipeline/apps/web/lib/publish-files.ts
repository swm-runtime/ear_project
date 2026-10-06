/**
 * 발행 화면(브라우저)이 `/api/publish/<id>` 에서 오디오를 받아 File 로 감싼다 — 신규 발행·에피소드 재발행·구형 일괄 재발행이 같이 쓴다.
 * 압축 배포본의 형식(m4a·mp3)은 응답 Content-Type 으로 정한다. 무손실은 서버 스위치(lib/audio-file.ts)가 꺼져 있거나 파일이 없으면 404 → null.
 */
export async function fetchDistAudio(episodeId: string): Promise<File | null> {
  const res = await fetch(`/api/publish/${episodeId}?audio=1`);
  if (!res.ok) return null;
  const type = res.headers.get("content-type") ?? "audio/mpeg";
  return new File([await res.blob()], `${episodeId}.${type.includes("mp4") ? "m4a" : "mp3"}`, { type });
}

/**
 * 재발행 확인창 경고 (KAN-145) — 백엔드는 오디오를 바꾸는 재발행을 음질 세트로 보고 **안 보낸 음질의 행을 지운다**(admin-api 4.10).
 * 무손실 전송이 켜져 있는데 이 에피소드에 lossless.flac 이 없으면 압축만 나가므로, 서버에 무손실이 있었다면 지워진다.
 * 서버에 실제로 무손실이 있는지는 관리자 목록 응답에 음질 정보가 없어 가리지 못한다 — 그래서 "있었다면"이다.
 */
export const LOSSLESS_DROP_WARNING = "압축 음원만 보냅니다 — 서버에 무손실이 있었다면 지워집니다";

export function wouldDropLossless(info: { lossless_enabled: boolean; has_lossless: boolean | null }): boolean {
  return info.lossless_enabled && info.has_lossless === false;
}

/** `/api/publish/<id>?audioinfo=1` 로 판정한다. 정보를 못 받으면 경고하지 않는다 — 그때는 재발행 자체도 같은 경로에서 실패한다 */
export async function losslessWouldDrop(episodeId: string): Promise<boolean> {
  const res = await fetch(`/api/publish/${episodeId}?audioinfo=1`).catch(() => null);
  if (!res?.ok) return false;
  return wouldDropLossless(await res.json());
}

export async function fetchLosslessAudio(episodeId: string): Promise<File | null> {
  const res = await fetch(`/api/publish/${episodeId}?lossless=1`);
  if (!res.ok) return null;
  return new File([await res.blob()], `${episodeId}.flac`, { type: "audio/flac" });
}
