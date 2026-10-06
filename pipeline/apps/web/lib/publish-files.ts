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

export async function fetchLosslessAudio(episodeId: string): Promise<File | null> {
  const res = await fetch(`/api/publish/${episodeId}?lossless=1`);
  if (!res.ok) return null;
  return new File([await res.blob()], `${episodeId}.flac`, { type: "audio/flac" });
}
