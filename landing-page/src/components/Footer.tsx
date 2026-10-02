import Link from "next/link";
import { LogoMark } from "./Logo";
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
        </p>
      </div>
    </footer>
  );
}
