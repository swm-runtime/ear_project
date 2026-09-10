import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase-server";
import { getBytes, getText } from "@/lib/storage";

/**
 * 발행 프리필 데이터 — 패키지 산출물을 브라우저에 내준다 (Supabase 로그인 필수).
 * - GET /api/publish/<episodeId>              → upload-meta.json (+ dist.mp3 · thumbnail.png 존재 여부)
 * - GET /api/publish/<episodeId>?audio=1      → dist.mp3 바이트 (제품 업로드 폼이 File 로 감싼다)
 * - GET /api/publish/<episodeId>?thumbnail=1  → thumbnail.png 바이트 (같은 방식)
 * 서버가 중계하는 이유: 파이프라인 S3 에 브라우저 CORS 를 열지 않기 위해서다.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ episodeId: string }> }) {
  const user = await currentUser().catch(() => null);
  if (!user) return NextResponse.json({ message: "로그인이 필요합니다" }, { status: 401 });

  const { episodeId } = await ctx.params;
  if (!/^[A-Za-z0-9-]{1,64}$/.test(episodeId)) return NextResponse.json({ message: "잘못된 id" }, { status: 400 });
  const base = `episodes/${episodeId}`;

  if (req.nextUrl.searchParams.get("audio")) {
    const bytes = await getBytes(`${base}/audio/dist.mp3`);
    if (!bytes) return NextResponse.json({ message: "dist.mp3 없음 — TTS 이후에" }, { status: 404 });
    return new NextResponse(Buffer.from(bytes), {
      headers: { "content-type": "audio/mpeg", "content-disposition": `attachment; filename="${episodeId}.mp3"` },
    });
  }

  if (req.nextUrl.searchParams.get("thumbnail")) {
    const bytes = await getBytes(`${base}/thumbnail.png`);
    if (!bytes) return NextResponse.json({ message: "thumbnail.png 없음 — 썸네일 생성 이후에" }, { status: 404 });
    return new NextResponse(Buffer.from(bytes), {
      headers: { "content-type": "image/png", "content-disposition": `attachment; filename="${episodeId}.png"` },
    });
  }

  const metaText = await getText(`${base}/upload-meta.json`);
  if (!metaText) return NextResponse.json({ message: "upload-meta.json 없음 — 패키지 단계 이후에" }, { status: 404 });
  const [audio, thumbnail] = await Promise.all([
    getBytes(`${base}/audio/dist.mp3`, true),
    getBytes(`${base}/thumbnail.png`, true),
  ]);
  return NextResponse.json({ meta: JSON.parse(metaText), has_audio: audio !== null, has_thumbnail: thumbnail !== null });
}
