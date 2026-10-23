import { redirect } from "next/navigation";

/** 옛 위치(서비스 지표 › 추천 검증) — 추천 검증 콘솔의 사용자별 추천으로 옮겼다(2026-10-22) */
export default function MovedRecommendationInspectorPage() {
  redirect("/drip-check/users");
}
