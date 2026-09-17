import { blogEmpty, releaseMailto } from "@/content/site";
import s from "./BlogEmpty.module.css";

/**
 * 블로그 빈 상태. 글이 0편일 때 `blog/page.tsx`가 목록 자리에 그린다.
 *
 * 제목은 다른 섹션과 같은 표시 서체(`sectionTitle`)를 써 페이지 결을 맞추고, 소식 받기로 잇는다.
 * 예정 주제 카드는 두지 않는다 — 아직 쓰지 않은 글의 제목을 내보이면 약속이 된다.
 */
export function BlogEmpty() {
  return (
    <div className={s.wrap}>
      <div className={s.head}>
        <p className="eyebrow">{blogEmpty.eyebrow}</p>
        <h2 className="sectionTitle">{blogEmpty.title}</h2>
        <p className="sectionLede">{blogEmpty.lede}</p>
      </div>

      <div className={s.actions}>
        <a href={releaseMailto} className="btn btnPrimary">
          {blogEmpty.ctaLabel}
        </a>
        <p className={s.note}>{blogEmpty.note}</p>
      </div>
    </div>
  );
}
