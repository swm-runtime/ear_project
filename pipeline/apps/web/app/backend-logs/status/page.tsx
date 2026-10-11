import { redirect } from "next/navigation";

/** 서버 상태 탭은 2026-10-08 대시보드에 합쳤다 — 북마크·문서 링크를 위해 경로만 남겨 돌려보낸다 */
export default function BackendStatusPage() {
  redirect("/backend-logs/dashboard");
}
