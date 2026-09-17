import { blogEmpty, releaseMailto } from "@/content/site";
import s from "./BlogEmpty.module.css";

/**
 * 블로그 빈 상태. 글이 0편일 때 `blog/page.tsx`가 목록 자리에 그린다.
 *
 * 준비 중인 이야기 세 편을 **점선 카드**로 놓아 "여기에 목록이 들어온다"가 읽히게 하고,
 * 제목은 다른 섹션과 같은 표시 서체(`sectionTitle`)를 써 페이지 결을 맞춘다.
 * 카드는 링크가 아니다 — 아직 없는 글로 보내는 빈 링크를 만들지 않는다.
 */
export function BlogEmpty() {
  return (
    <div className={s.wrap}>
      <div className={s.head}>
        <p className="eyebrow">{blogEmpty.eyebrow}</p>
        <h2 className="sectionTitle">{blogEmpty.title}</h2>
        <p className="sectionLede">{blogEmpty.lede}</p>
      </div>

      <ul className={s.list} aria-label="준비 중인 글">
        {blogEmpty.upcoming.map((item, i) => (
          <li key={item.title} className={s.card}>
            <div className={s.meta}>
              <span className={s.category}>{item.category}</span>
              <span className={s.badge}>준비 중</span>
            </div>
            <h3 className={s.cardTitle}>{item.title}</h3>
            <p className={s.cardBody}>{item.body}</p>
            <span className={s.index} aria-hidden="true">
              {String(i + 1).padStart(2, "0")}
            </span>
          </li>
        ))}
      </ul>

      <div className={s.actions}>
        <a href={releaseMailto} className="btn btnPrimary">
          {blogEmpty.ctaLabel}
        </a>
        <p className={s.note}>{blogEmpty.note}</p>
      </div>
    </div>
  );
}
