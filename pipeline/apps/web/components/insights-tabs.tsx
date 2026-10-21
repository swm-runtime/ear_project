import Link from "next/link";

const TABS = [
  { href: "/backend-logs/insights", label: "지표 요약" },
  { href: "/backend-logs/insights/recommendations", label: "추천 검증" },
] as const;

/** 서비스 지표 화면의 보기 전환 — 지표 요약(전체 집계) ↔ 추천 검증(가명 사용자 한 명, 2026-10-22) */
export function InsightsTabs({ active }: { active: (typeof TABS)[number]["href"] }) {
  return (
    <nav className="flex gap-1" aria-label="서비스 지표 보기">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === active ? "page" : undefined}
          className={`rounded-full border px-3 py-1 text-xs ${t.href === active ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:bg-[#f7f9fb]"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
