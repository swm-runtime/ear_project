import { icons, type IconName } from "./Icons";
import s from "./Features.module.css";

export type FeatureItem = {
  icon: string;
  title: string;
  text: string;
};

/**
 * 아이콘 + 제목 + 설명 카드 그리드.
 *
 * 홈은 짧은 요약(`features[].body`)을, 기능 페이지는 긴 설명(`features[].detail`)을
 * 넣어 같은 컴포넌트를 쓴다. 같은 문장을 두 페이지에 그대로 복사하면 검색엔진이
 * 중복 콘텐츠로 보므로, 문장 자체가 다른 것이 중요하다.
 */
export function Features({
  id,
  eyebrow = "Features",
  title,
  lede,
  items,
  footer,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  lede?: string;
  items: readonly FeatureItem[];
  footer?: React.ReactNode;
}) {
  return (
    <section id={id} className="section">
      <div className="container">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="sectionTitle">{title}</h2>
        {lede && <p className="sectionLede">{lede}</p>}

        <ul className={s.grid}>
          {items.map((f) => (
            <li key={f.title} className={s.card}>
              <span className={s.icon}>{icons[f.icon as IconName]}</span>
              <h3 className={s.cardTitle}>{f.title}</h3>
              <p className={s.cardBody}>{f.text}</p>
            </li>
          ))}
        </ul>

        {footer && <div className={s.footer}>{footer}</div>}
      </div>
    </section>
  );
}
