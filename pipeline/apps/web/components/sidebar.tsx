"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "대시보드", icon: Grid, exact: true },
  { href: "/jobs", label: "작업 기록", icon: List, note: "소요·비용" },
  { href: "/backlog", label: "백로그", icon: Inbox, note: "게이트 1" },
  { href: "/episodes", label: "에피소드", icon: Doc },
  { href: "/sweep", label: "스윕", icon: Radar },
  { href: "/domains", label: "소스 풀", icon: Globe },
  { href: "/topics", label: "주제", icon: Tag },
  { href: "/assets", label: "규칙 자산", icon: Book, note: "prompt_assets" },
  { href: "/publish", label: "제품 발행", icon: Ship, note: "게이트 2" },
];

export function Sidebar({ pending }: { pending?: { backlog?: number; review?: number } }) {
  const path = usePathname();
  const on = (href: string, exact?: boolean) => (exact ? path === href : path.startsWith(href));
  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex w-[188px] flex-col bg-side text-side-ink">
      <div className="flex h-14 items-center gap-2 px-5">
        <span className="grid h-7 w-7 place-items-center rounded bg-brand text-[13px] font-bold text-white">ear</span>
        <span className="text-[13px] font-semibold tracking-tight text-white">파이프라인</span>
      </div>
      <nav className="mt-2 flex-1 space-y-0.5 px-2">
        {NAV.map((n) => {
          const active = on(n.href, n.exact);
          const badge = n.href === "/backlog" ? (pending?.backlog ?? 0) + (pending?.review ?? 0) : 0;
          return (
            <Link key={n.href} href={n.href}
              className={`flex items-center gap-2.5 rounded px-3 py-2 text-[13px] transition ${active ? "bg-brand text-white shadow-[inset_3px_0_0_rgba(255,255,255,0.5)]" : "hover:bg-side-soft hover:text-white"}`}>
              <n.icon className="h-4 w-4 shrink-0 opacity-90" />
              <span>{n.label}</span>
              {badge > 0 && <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${active ? "bg-white/25 text-white" : "bg-amber-400 text-[#3a2c00]"}`}>{badge}</span>}
            </Link>
          );
        })}
      </nav>
      <Link href="/settings" className={`m-2 flex items-center gap-2.5 rounded px-3 py-2 text-[13px] ${on("/settings") ? "bg-brand text-white" : "hover:bg-side-soft hover:text-white"}`}>
        <Gear className="h-4 w-4 opacity-90" /> 설정
      </Link>
    </aside>
  );
}

type I = { className?: string };
function Grid({ className }: I) { return <svg className={className} viewBox="0 0 20 20" fill="currentColor"><path d="M3 3h6v6H3V3zm8 0h6v4h-6V3zM3 11h6v6H3v-6zm8 3h6v3h-6v-3zm0-5h6v3h-6V9z" /></svg>; }
function Inbox({ className }: I) { return <svg className={className} viewBox="0 0 20 20" fill="currentColor"><path d="M3 4h14l1 8v4H2v-4l1-8zm1.6 1L3.8 11H7l1 2h4l1-2h3.2l-.8-6H4.6z" /></svg>; }
function List({ className }: I) { return <svg className={className} viewBox="0 0 20 20" fill="currentColor"><path d="M3 4h2v2H3V4zm4 0h10v2H7V4zM3 9h2v2H3V9zm4 0h10v2H7V9zm-4 5h2v2H3v-2zm4 0h10v2H7v-2z" /></svg>; }
function Doc({ className }: I) { return <svg className={className} viewBox="0 0 20 20" fill="currentColor"><path d="M5 2h7l4 4v12H5V2zm7 1.5V7h3.5L12 3.5zM7 9h6v1.5H7V9zm0 3h6v1.5H7V12z" /></svg>; }
function Radar({ className }: I) { return <svg className={className} viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a8 8 0 108 8h-2a6 6 0 11-6-6V2z" /><circle cx="10" cy="10" r="2.5" /></svg>; }
function Globe({ className }: I) { return <svg className={className} viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a8 8 0 100 16 8 8 0 000-16zm5.9 7h-2.6a12 12 0 00-1-4.2A6 6 0 0115.9 9zM10 4c.7 1 1.2 2.6 1.4 5H8.6C8.8 6.6 9.3 5 10 4zM4.1 9a6 6 0 013.6-4.2 12 12 0 00-1 4.2H4.1zm0 2h2.6c.1 1.6.5 3 1 4.2A6 6 0 014.1 11zM10 16c-.7-1-1.2-2.6-1.4-5h2.8c-.2 2.4-.7 4-1.4 5zm2.3-.8c.5-1.2.9-2.6 1-4.2h2.6a6 6 0 01-3.6 4.2z" /></svg>; }
function Tag({ className }: I) { return <svg className={className} viewBox="0 0 20 20" fill="currentColor"><path d="M10 2l8 8-8 8-8-8V2h8zM6.5 6.5a1.5 1.5 0 100-.1z" /></svg>; }
function Book({ className }: I) { return <svg className={className} viewBox="0 0 20 20" fill="currentColor"><path d="M4 3h5a2 2 0 012 2v12a1.5 1.5 0 00-1.5-1.5H4V3zm12 0h-5a2 2 0 00-2 2v12a1.5 1.5 0 011.5-1.5H16V3zM5.5 6h3v1.2h-3V6zm0 3h3v1.2h-3V9zm6-3h3v1.2h-3V6zm0 3h3v1.2h-3V9z" /></svg>; }
function Ship({ className }: I) { return <svg className={className} viewBox="0 0 20 20" fill="currentColor"><path d="M10 2l1 1v2h4l1 6-6 2-6-2 1-6h4V3l1-1zm-7 12l2 2h10l2-2 1 2-2 3H4l-2-3 1-2z" /></svg>; }
function Gear({ className }: I) { return <svg className={className} viewBox="0 0 20 20" fill="currentColor"><path d="M10 6.5A3.5 3.5 0 1010 13.5 3.5 3.5 0 0010 6.5zm7 3.5l1.8 1.4-1.7 2.9-2.2-.7a6.7 6.7 0 01-1.5.9l-.4 2.3H8.9l-.4-2.3a6.7 6.7 0 01-1.5-.9l-2.2.7-1.7-2.9L4.9 10 3.1 8.6l1.7-2.9 2.2.7c.5-.4 1-.7 1.5-.9L8.9 3h3.1l.4 2.3c.5.2 1 .5 1.5.9l2.2-.7 1.7 2.9L17 10z" /></svg>; }
