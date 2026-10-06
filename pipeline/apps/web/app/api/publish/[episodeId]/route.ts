import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/supabase-server";
import { getBytes, getText } from "@/lib/storage";
import { ensureEmbedding } from "@/lib/embedding";
import { readScriptFileBody, readScriptSections, SEND_SCRIPT_SECTIONS } from "@/lib/script-file";
import { findDistAudio, hasLosslessAudio, LOSSLESS_FILE, SEND_LOSSLESS_AUDIO } from "@/lib/audio-file";

/**
 * 발행 프리필 데이터 — 패키지 산출물을 브라우저에 내준다 (Supabase 로그인 필수).
 * - GET /api/publish/<episodeId>              → upload-meta.json (+ 배포본 · 무손실 · thumbnail.png 존재 여부)
 * - GET /api/publish/<episodeId>?audio=1      → 압축 배포본 바이트 — dist.m4a(AAC 192k) 우선, 없으면 구 dist.mp3. Content-Type 으로 형식을 알린다
 * - GET /api/publish/<episodeId>?lossless=1   → lossless.flac (무손실, Pro) — lib/audio-file.ts 스위치가 꺼져 있으면 404
 * - GET /api/publish/<episodeId>?thumbnail=1  → thumbnail.png 바이트 (같은 방식)
 * - GET /api/publish/<episodeId>?enrichment=1 → enrichment.json (추천 메타 — 업로드 화면의 [추천 메타 뽑기]가 건 enrich 작업이 만든다(2026-09-23 개정), 발행 때 enrichment_file 로 첨부)
 * - GET /api/publish/<episodeId>?script=1     → script_file 본문 (자막 세그먼트, TTS 단계가 만든다 — 발행 때 script_file 로 첨부, KAN-72. 구간 제목 포함 여부는 lib/script-file.ts, KAN-137)
 * 서버가 중계하는 이유: 파이프라인 S3 에 브라우저 CORS 를 열지 않기 위해서다.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ episodeId: string }> }) {
  const user = await currentUser().catch(() => null);
  if (!user) return NextResponse.json({ message: "로그인이 필요합니다" }, { status: 401 });

  const { episodeId } = await ctx.params;
  if (!/^[A-Za-z0-9-]{1,64}$/.test(episodeId)) return NextResponse.json({ message: "잘못된 id" }, { status: 400 });
  const base = `episodes/${episodeId}`;

  if (req.nextUrl.searchParams.get("audio")) {
    const dist = await findDistAudio(episodeId);
    const bytes = dist ? await getBytes(`${base}/audio/${dist.file}`) : null;
    if (!dist || !bytes) return NextResponse.json({ message: "배포본(dist.m4a·dist.mp3) 없음 — TTS 이후에" }, { status: 404 });
    return new NextResponse(Buffer.from(bytes), {
      headers: { "content-type": dist.type, "content-disposition": `attachment; filename="${episodeId}.${dist.ext}"` },
    });
  }

  // 재발행 확인창의 무손실 경고 판정용 (KAN-145) — 업로드 패키지(upload-meta.json)가 없어도 답한다. 스위치가 꺼져 있으면 S3 를 보지 않는다
  if (req.nextUrl.searchParams.get("audioinfo")) {
    return NextResponse.json({ lossless_enabled: SEND_LOSSLESS_AUDIO, has_lossless: SEND_LOSSLESS_AUDIO ? await hasLosslessAudio(episodeId) : null });
  }

  if (req.nextUrl.searchParams.get("lossless")) {
    if (!SEND_LOSSLESS_AUDIO) return NextResponse.json({ message: "무손실 전송 꺼짐 — 백엔드가 flac 을 받게 되면 켠다 (lib/audio-file.ts)" }, { status: 404 });
    const bytes = await getBytes(`${base}/audio/${LOSSLESS_FILE.file}`);
    if (!bytes) return NextResponse.json({ message: "lossless.flac 없음 — 2026-10-06 이전 음원이거나 재인코딩 전" }, { status: 404 });
    return new NextResponse(Buffer.from(bytes), {
      headers: { "content-type": LOSSLESS_FILE.type, "content-disposition": `attachment; filename="${episodeId}.${LOSSLESS_FILE.ext}"` },
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
    if (!text) return NextResponse.json({ message: "enrichment.json 없음 — 업로드 화면의 [추천 메타 뽑기] 이후에" }, { status: 404 });
    // 임베딩이 비어 있으면 발행 시점에 AI 서버에서 받아 합친다 (lib/embedding.ts) — 헤더 x-embedding-note 로 결과를 알린다
    const merged = await ensureEmbedding(text, await getText(`${base}/script.md`));
    return new NextResponse(merged.text, { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="enrichment.json"`, "x-embedding-note": encodeURIComponent(merged.note) } });
  }

  if (req.nextUrl.searchParams.get("script")) {
    const text = await readScriptFileBody(episodeId);
    if (!text) return NextResponse.json({ message: "script-segments.json 없음 — TTS 이후에 (턴 경계를 못 잡은 편은 만들지 않는다)" }, { status: 404 });
    return new NextResponse(text, { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="script-segments.json"` } });
  }

  const metaText = await getText(`${base}/upload-meta.json`);
  if (!metaText) return NextResponse.json({ message: "upload-meta.json 없음 — 패키지 단계 이후에" }, { status: 404 });
  const [audio, lossless, thumbnail, enrichment, script] = await Promise.all([
    findDistAudio(episodeId),
    hasLosslessAudio(episodeId),
    getBytes(`${base}/thumbnail.png`, true),
    getText(`${base}/enrichment.json`),
    getText(`${base}/script-segments.json`),
  ]);
  let scriptSegments: number | null = null;
  try { scriptSegments = script ? (JSON.parse(script) as unknown[]).length : null; } catch { scriptSegments = null; }
  const scriptSections = scriptSegments !== null ? (await readScriptSections(episodeId)).length : 0; // 구간 제목 수 (KAN-137) — 업로드 화면 안내용
  let enrichmentVersion: number | null = null;
  try { enrichmentVersion = enrichment ? Number((JSON.parse(enrichment) as { schema_version?: number }).schema_version ?? 1) : null; } catch { enrichmentVersion = null; }
  return NextResponse.json({ meta: JSON.parse(metaText), has_audio: audio !== null, audio_ext: audio?.ext ?? null, has_lossless: lossless, lossless_sent: SEND_LOSSLESS_AUDIO && lossless, has_thumbnail: thumbnail !== null, has_enrichment: enrichment !== null, enrichment_version: enrichmentVersion, has_script: scriptSegments !== null, script_segments: scriptSegments, script_sections: scriptSections, script_sections_sent: SEND_SCRIPT_SECTIONS });
}
