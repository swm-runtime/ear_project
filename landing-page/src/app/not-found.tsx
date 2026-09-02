import type { Metadata } from "next";
import Link from "next/link";
import { navRoutes } from "@/content/routes";
import s from "./not-found.module.css";

export const metadata: Metadata = {
  title: "페이지를 찾을 수 없어요",
  // 404는 색인 대상이 아니다.
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className={s.wrap}>
      <div className="container">
        <p className={s.code}>404</p>
        <h1 className={s.title}>찾으시는 페이지가 없어요</h1>
        <p className={s.lede}>
          주소가 바뀌었거나 삭제된 페이지일 수 있습니다. 아래에서 다시 찾아봐 주세요.
        </p>

        <Link href="/" className="btn btnPrimary">
          첫 화면으로
        </Link>

        <nav className={s.links} aria-label="주요 페이지">
          {navRoutes.map((r) => (
            <Link key={r.path} href={r.path}>
              {r.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
