import Link from "next/link";
import { routes } from "@/content/routes";
import s from "./PageHeader.module.css";

export type Crumb = { name: string; path?: string };

/**
 * 하위 페이지의 상단 블록.
 *
 * 어두운 배경을 쓰는 이유는 고정 헤더가 어둡기 때문이다. 밝은 배경으로 시작하면
 * 반투명 헤더 뒤로 색이 비쳐 경계에 띠가 생긴다(홈의 히어로도 같은 이유로 어둡다).
 *
 * 빵부스러기를 화면에도 두는 건 구조화 데이터만으로는 사용자가 현재 위치를
 * 알 수 없어서다. 헤더에 현재 메뉴 강조 표시를 두지 않았으므로 여기가 그 역할을 한다.
 */
export function PageHeader({
  crumbs = [],
  title,
  lede,
  meta,
}: {
  crumbs?: Crumb[];
  title: string;
  lede?: string;
  /** 제목 아래 한 줄 보조 정보(발행일·읽는 시간 등). */
  meta?: React.ReactNode;
}) {
  return (
    <div className={s.wrap}>
      <div className={s.glow} aria-hidden="true" />
      <div className={`container ${s.inner}`}>
        <nav className={s.crumbs} aria-label="현재 위치">
          <ol>
            <li>
              <Link href={routes.home.path}>홈</Link>
            </li>
            {crumbs.map((c) => (
              <li key={c.name}>
                {c.path ? (
                  <Link href={c.path}>{c.name}</Link>
                ) : (
                  <span aria-current="page">{c.name}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>

        <h1 className={s.title}>{title}</h1>
        {lede && <p className={s.lede}>{lede}</p>}
        {meta && <p className={s.meta}>{meta}</p>}
      </div>
    </div>
  );
}
