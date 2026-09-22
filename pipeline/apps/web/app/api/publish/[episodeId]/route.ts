import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase-server";
import { getBytes, getText } from "@/lib/storage";
import { ensureEmbedding } from "@/lib/embedding";

/**
 * 발행 프리필 데이터 — 패키지 산출물을 브라우저에 내준다 (Supabase 로그인 필수).
 * - GET /api/publish/<episodeId>              → upload-meta.json (+ dist.mp3 · thumbnail.png 존재 여부)
 * - GET /api/publish/<episodeId>?audio=1      → dist.mp3 바이트 (제품 업로드 폼이 File 로 감싼다)
 * - GET /api/publish/<episodeId>?thumbnail=1  → thumbnail.png 바이트 (같은 방식)
 * - GET /api/publish/<episodeId>?enrichment=1 → enrichment.json (추천 메타, 패키지 직후 enrich 작업이 만든다 — 발행 때 enrichment_file 로 첨부)
 * - GET /api/publish/<episodeId>?script=1     → script-segments.json (자막 세그먼트, TTS 단계가 만든다 — 발행 때 script_file 로 첨부, KAN-72)
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

  if (req.nextUrl.searchParams.get("enrichment")) {
    const text = await getText(`${base}/enrichment.json`);
    if (!text) return NextResponse.json({ message: "enrichment.json 없음 — 패키지 직후 메타 부여 작업 이후에" }, { status: 404 });
    // 임베딩이 비어 있으면 발행 시점에 AI 서버에서 받아 합친다 (lib/embedding.ts) — 헤더 x-embedding-note 로 결과를 알린다
    const merged = await ensureEmbedding(text, await getText(`${base}/script.md`));
    return new NextResponse(merged.text, { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="enrichment.json"`, "x-embedding-note": encodeURIComponent(merged.note) } });
  }

  if (req.nextUrl.searchParams.get("script")) {
    const text = await getText(`${base}/script-segments.json`);
    if (!text) return NextResponse.json({ message: "script-segments.json 없음 — TTS 이후에 (턴 경계를 못 잡은 편은 만들지 않는다)" }, { status: 404 });
    return new NextResponse(text, { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="script-segments.json"` } });
  }

  const metaText = await getText(`${base}/upload-meta.json`);
  if (!metaText) return NextResponse.json({ message: "upload-meta.json 없음 — 패키지 단계 이후에" }, { status: 404 });
  const [audio, thumbnail, enrichment, script] = await Promise.all([
    getBytes(`${base}/audio/dist.mp3`, true),
    getBytes(`${base}/thumbnail.png`, true),
    getText(`${base}/enrichment.json`),
    getText(`${base}/script-segments.json`),
  ]);
  let scriptSegments: number | null = null;
  try { scriptSegments = script ? (JSON.parse(script) as unknown[]).length : null; } catch { scriptSegments = null; }
  let enrichmentVersion: number | null = null;
  try { enrichmentVersion = enrichment ? Number((JSON.parse(enrichment) as { schema_version?: number }).schema_version ?? 1) : null; } catch { enrichmentVersion = null; }
  return NextResponse.json({ meta: JSON.parse(metaText), has_audio: audio !== null, has_thumbnail: thumbnail !== null, has_enrichment: enrichment !== null, enrichment_version: enrichmentVersion, has_script: scriptSegments !== null, script_segments: scriptSegments });
}
