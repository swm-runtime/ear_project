import { NextRequest, NextResponse } from "next/server";
import { getBytes } from "@/lib/storage";

/**
 * 시리즈 표지 (spec/11 7장, 2026-10-28) — GET /api/series/<id>?cover=1 → 파이프라인 S3 `datasets/series/<id>/thumb-cover.png` 바이트.
 * [시리즈 발행]이 제품 시리즈를 만든 직후 표지를 올리고, 시리즈 화면 [표지 서버에 올리기]가 뒤늦게 올릴 때 브라우저가 이 경로로 받아 PUT /admin/series/:id/cover 로 보낸다.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ message: "시리즈 id 형식이 아니다" }, { status: 400 });
  if (req.nextUrl.searchParams.get("cover")) {
    const bytes = await getBytes(`datasets/series/${id}/thumb-cover.png`);
    if (!bytes) return NextResponse.json({ message: "thumb-cover.png 없음 — 편 썸네일이 하나라도 만들어진 뒤에 생긴다(키워드·회화집 디자인만)" }, { status: 404 });
    return new NextResponse(Buffer.from(bytes), { headers: { "content-type": "image/png", "content-disposition": `attachment; filename="series-${id}-cover.png"` } });
  }
  return NextResponse.json({ message: "?cover=1 만 지원" }, { status: 400 });
}
