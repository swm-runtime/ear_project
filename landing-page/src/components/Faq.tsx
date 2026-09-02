import s from "./Faq.module.css";

/**
 * 아코디언을 native <details>/<summary>로 만든다.
 * 자바스크립트가 필요 없고, 접힌 답변도 HTML에 그대로 들어 있어 크롤러가 읽는다.
 * 구조화 데이터(FAQPage)와 같은 원본(`content/site.ts`)을 쓰므로 두 곳이 어긋나지 않는다.
 */
export function FaqList({ items }: { items: { q: string; a: string }[] }) {
  return (
    <ul className={s.list}>
      {items.map((item) => (
        <li key={item.q}>
          <details className={s.item}>
            <summary className={s.q}>
              <span>{item.q}</span>
              <svg
                className={s.chev}
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  d="M12 5v14M5 12h14"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </summary>
            <p className={s.a}>{item.a}</p>
          </details>
        </li>
      ))}
    </ul>
  );
}

/** 홈에 얹는 요약 FAQ 섹션. 전체 목록은 /faq 가 갖는다. */
export function Faq({
  id,
  title,
  lede,
  items,
  footer,
}: {
  id?: string;
  title: string;
  lede?: string;
  items: { q: string; a: string }[];
  footer?: React.ReactNode;
}) {
  return (
    <section id={id} className={`section ${s.wrap}`}>
      <div className="container">
        <div className={s.inner}>
          <div className={s.head}>
            <p className="eyebrow">FAQ</p>
            <h2 className="sectionTitle">{title}</h2>
            {lede && <p className={s.headLede}>{lede}</p>}
            {footer && <div className={s.headFooter}>{footer}</div>}
          </div>

          <FaqList items={items} />
        </div>
      </div>
    </section>
  );
}
