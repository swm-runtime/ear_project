import Link from "next/link";
import { LogoMark } from "./Logo";
import { enRoutes } from "@/content/en/routes";
import { footerGroups } from "@/content/routes";
import { androidStoreUrl, iosStoreUrl, site } from "@/content/site";
import s from "./Footer.module.css";

export function Footer() {
  const year = 2026; // 정적 빌드라 렌더 시각에 의존하지 않는다. 연말에 한 번 갱신한다.

  return (
    <footer className={s.footer}>
      <div className={`container ${s.inner}`}>
        <div className={s.brandCol}>
          <Link href="/" className={s.brand} aria-label={`${site.name} 홈`}>
            <LogoMark className={s.mark} />
            <span className={s.brandName}>{site.name}</span>
          </Link>
          <p className={s.desc}>{site.shortDescription}</p>
          <p className={s.contact}>
            <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
          </p>
        </div>

        {footerGroups.map((group) => (
          <nav key={group.title} className={s.links} aria-label={group.title}>
            <p className={s.colTitle}>{group.title}</p>
            <ul>
              {group.items.map((r) => (
                <li key={r.path}>
                  <Link href={r.path}>{r.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className={`container ${s.bottom}`}>
        <p>
          © {year} {site.name}. All rights reserved.
        </p>
        <p className={s.stores}>
          <a href={iosStoreUrl} target="_blank" rel="noopener noreferrer">
            App Store
          </a>
          <span aria-hidden="true"> · </span>
          <a href={androidStoreUrl} target="_blank" rel="noopener noreferrer">
            Google Play
          </a>
          {/* 영어판(소개·약관·개인정보·계정 삭제 — KAN-199)으로 가는 링크. 영어판은 루트 레이아웃이 달라
              클라이언트 전환이 되지 않으므로 평범한 <a>를 쓴다. 이름은 관례대로 그 언어로 적는다 */}
          <span aria-hidden="true"> · </span>
          <a href={enRoutes.home.path} hrefLang="en" lang="en">
            English
          </a>
        </p>
      </div>
    </footer>
  );
}
