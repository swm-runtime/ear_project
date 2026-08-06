import { LogoMark } from "./Logo";
import { nav, site } from "@/content/site";
import s from "./Header.module.css";

/**
 * 상단 고정 헤더.
 *
 * 자바스크립트를 쓰지 않는다 — 스크롤 상태 표현은 반투명 배경 + backdrop-filter로,
 * 좁은 화면 대응은 내비게이션을 숨기는 것으로 처리한다. 랜딩페이지에서 헤더 하나
 * 때문에 클라이언트 번들을 만들 이유가 없다.
 */
export function Header() {
  return (
    <header className={s.header}>
      <div className={`container ${s.inner}`}>
        <a href="#top" className={s.brand} aria-label={`${site.name} 홈`}>
          <LogoMark className={s.mark} />
          <span className={s.brandName}>{site.name}</span>
        </a>

        <nav className={s.nav} aria-label="주요 섹션">
          {nav.map((item) => (
            <a key={item.href} href={item.href} className={s.navLink}>
              {item.label}
            </a>
          ))}
        </nav>

        <a href="#cta" className={`btn btnPrimary ${s.cta}`}>
          출시 소식 받기
        </a>
      </div>
    </header>
  );
}
