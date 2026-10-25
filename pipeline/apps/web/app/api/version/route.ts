import { NextResponse } from "next/server";

/**
 * 콘솔 서버 인스턴스 표식 (2026-10-26) — 배포(dev 머지)마다 컨테이너가 다시 뜨면 값이 바뀐다.
 * 열어 둔 탭은 옛 서버 액션 ID 를 들고 있어 배포 뒤 버튼이 "Failed to find Server Action … older or newer deployment" 로 실패하고
 * 화면에는 "Failed to fetch" 로 보였다(2026-10-26 팀원). <DeployBanner> 가 1분마다 이 값을 읽어 바뀌면 새로고침을 권한다.
 */
const STARTED_AT = new Date().toISOString();
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ started_at: STARTED_AT }, { headers: { "cache-control": "no-store" } });
}
