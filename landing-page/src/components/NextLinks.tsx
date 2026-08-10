import Link from "next/link";
import type { RouteMeta } from "@/content/routes";
import s from "./NextLinks.module.css";

/**
 * 페이지 끝의 "다음으로 볼 것" 묶음.
 *
 * 페이지를 여러 장으로 나누면 각 장이 막다른 길이 되기 쉽다. 사용자에게는 다음
 * 행동을 주고, 크롤러에게는 페이지 사이를 오갈 수 있는 내부 링크를 남긴다.
 */
export function NextLinks({
  title = "이어서 볼 것",
  items,
}: {
  title?: string;
  items: RouteMeta[];
}) {
  return (
    <section className={`section ${s.wrap}`}>
      <div className="container">
        <h2 className={s.title}>{title}</h2>
        <ul className={s.list}>
          {items.map((r) => (
            <li key={r.path} className={s.card}>
              <h3 className={s.cardTitle}>
                <Link href={r.path}>{r.label}</Link>
              </h3>
              <p className={s.cardDesc}>{r.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
