import Link from "next/link";
import { LogoMark } from "./Logo";
import { navRoutes } from "@/content/routes";
import { releaseMailto, site } from "@/content/site";
import s from "./Header.module.css";

/**
 * 상단 고정 헤더. 모든 페이지가 루트 레이아웃을 통해 공유한다.
 *
 * 자바스크립트를 쓰지 않는다. 좁은 화면의 메뉴는 native <details>로 열고 닫으며,
 * 그 안의 링크만 next/link 대신 평범한 <a>를 쓴다 — 클라이언트 전환으로 이동하면
 * 열린 <details>가 그대로 남아 다음 화면 위에 메뉴가 덮이기 때문이다.
 */
export function Header() {
  return (
    <header className={s.header}>
      <div className={`container ${s.inner}`}>
        <Link href="/" className={s.brand} aria-label={`${site.name} 홈`}>
          <LogoMark className={s.mark} />
          <span className={s.brandName}>{site.name}</span>
        </Link>

        <nav className={s.nav} aria-label="주요 메뉴">
          {navRoutes.map((r) => (
            <Link key={r.path} href={r.path} className={s.navLink}>
              {r.navLabel ?? r.label}
            </Link>
          ))}
        </nav>

        <a href={releaseMailto} className={`btn btnPrimary ${s.cta}`}>
          <span className={s.ctaFull}>출시 소식 받기</span>
          <span className={s.ctaShort}>출시 알림</span>
        </a>

        <details className={s.menu}>
          <summary className={s.menuBtn} aria-label="메뉴 열기">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
              <path
                d="M4 7h16M4 12h16M4 17h16"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
              />
            </svg>
          </summary>
          <nav className={s.menuPanel} aria-label="전체 메뉴">
            {navRoutes.map((r) => (
              <a key={r.path} href={r.path} className={s.menuLink}>
                {r.label}
              </a>
            ))}
          </nav>
        </details>
      </div>
    </header>
  );
}
