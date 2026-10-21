import Link from "next/link";
import { HeaderStoreLink } from "./HeaderStoreLink";
import { LogoMark } from "./Logo";
import { enChrome, enSite } from "@/content/en/site";
import { enRoutes } from "@/content/en/routes";
import e from "./EnHeader.module.css";
import s from "./Header.module.css";

/**
 * 영어 페이지(`/en/`)의 상단 헤더(2026-10-15 — KAN-199).
 *
 * 한국어 `Header`와 같은 스타일을 쓰되 내비게이션은 두지 않는다 — 영어판은 필수 4페이지뿐이라 메뉴로 묶을 것이 없고,
 * 한국어 메뉴(기능·요금제·FAQ)로 보내면 영어 방문자를 한국어 페이지로 떨어뜨린다. 4페이지 사이의 이동은 바닥글이 맡는다.
 */
export function EnHeader() {
  return (
    <header className={s.header}>
      <div className={`container ${s.inner}`}>
        <Link href={enRoutes.home.path} className={s.brand} aria-label={enChrome.homeAria}>
          <LogoMark className={s.mark} />
          <span className={s.brandName}>{enSite.name}</span>
        </Link>

        <div className={e.end}>
          <HeaderStoreLink label={enChrome.download} iphoneLabel={enChrome.iphone} />
        </div>
      </div>
    </header>
  );
}
