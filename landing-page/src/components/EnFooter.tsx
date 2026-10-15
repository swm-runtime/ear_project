import Link from "next/link";
import { LogoMark } from "./Logo";
import { enChrome, enSite } from "@/content/en/site";
import { enRoutes } from "@/content/en/routes";
import { routes } from "@/content/routes";
import { androidStoreUrl, iosStoreUrl } from "@/content/site";
import s from "./Footer.module.css";

/**
 * 영어 페이지(`/en/`)의 바닥글(2026-10-15 — KAN-199). 한국어 `Footer`와 같은 스타일이다.
 *
 * 언어 전환은 바닥줄의 링크 하나로 둔다 — 지금 보는 페이지의 한국어 짝으로 보낸다(`koPath`). 두 판본은 루트 레이아웃이
 * 달라 클라이언트 전환이 되지 않으므로 next/link 대신 평범한 <a>를 쓴다.
 */
export function EnFooter({ koPath = routes.home.path }: { koPath?: string }) {
  const year = 2026; // 정적 빌드라 렌더 시각에 의존하지 않는다. 연말에 한 번 갱신한다(한국어 Footer와 같이).
  const legal = [enRoutes.terms, enRoutes.privacy, enRoutes.accountDeletion];

  return (
    <footer className={s.footer}>
      <div className={`container ${s.inner}`}>
        <div className={s.brandCol}>
          <Link href={enRoutes.home.path} className={s.brand} aria-label={enChrome.homeAria}>
            <LogoMark className={s.mark} />
            <span className={s.brandName}>{enSite.name}</span>
          </Link>
          <p className={s.desc}>{enSite.shortDescription}</p>
          <p className={s.contact}>
            <a href={`mailto:${enSite.contactEmail}`}>{enSite.contactEmail}</a>
          </p>
        </div>

        <nav className={s.links} aria-label={enChrome.footerLegal}>
          <p className={s.colTitle}>{enChrome.footerLegal}</p>
          <ul>
            {legal.map((r) => (
              <li key={r.path}>
                <Link href={r.path}>{r.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className={`container ${s.bottom}`}>
        <p>
          © {year} {enSite.name}. All rights reserved.
        </p>
        <p className={s.stores}>
          <a href={iosStoreUrl} target="_blank" rel="noopener noreferrer">
            App Store
          </a>
          <span aria-hidden="true"> · </span>
          <a href={androidStoreUrl} target="_blank" rel="noopener noreferrer">
            Google Play
          </a>
          <span aria-hidden="true"> · </span>
          <a href={koPath} hrefLang="ko" lang="ko">
            {enChrome.koreanLinkLabel}
          </a>
        </p>
      </div>
    </footer>
  );
}
