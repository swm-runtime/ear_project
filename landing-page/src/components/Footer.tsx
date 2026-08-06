import { LogoMark } from "./Logo";
import { nav, site } from "@/content/site";
import s from "./Footer.module.css";

export function Footer() {
  const year = 2026; // 정적 빌드라 렌더 시각에 의존하지 않는다. 연말에 한 번 갱신한다.

  return (
    <footer className={s.footer}>
      <div className={`container ${s.inner}`}>
        <div className={s.brandCol}>
          <div className={s.brand}>
            <LogoMark className={s.mark} />
            <span className={s.brandName}>{site.name}</span>
          </div>
          <p className={s.desc}>{site.shortDescription}</p>
        </div>

        <nav className={s.links} aria-label="바닥글 내비게이션">
          <p className={s.colTitle}>둘러보기</p>
          <ul>
            {nav.map((item) => (
              <li key={item.href}>
                <a href={item.href}>{item.label}</a>
              </li>
            ))}
          </ul>
        </nav>

        <div className={s.links}>
          <p className={s.colTitle}>문의</p>
          <ul>
            <li>
              <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
            </li>
          </ul>
        </div>
      </div>

      <div className={`container ${s.bottom}`}>
        <p>
          © {year} {site.name}. All rights reserved.
        </p>
        {/* 정식 출시 전 이용약관·개인정보 처리방침 링크를 여기에 추가한다.
            페이지가 없는 상태로 링크만 걸면 크롤러에 404가 잡히므로 지금은 비워 둔다. */}
      </div>
    </footer>
  );
}
