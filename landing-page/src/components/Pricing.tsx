import { plans } from "@/content/site";
import s from "./Pricing.module.css";

function Check({ ok }: { ok: boolean }) {
  return (
    <svg
      className={ok ? s.iconOk : s.iconNo}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {ok ? (
        <path
          d="m4.5 10.5 3.4 3.4L15.5 6.3"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M5.5 10h9"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/** 요금제 카드 3장. 요금제 페이지가 쓰고, 홈에서는 대신 `PricingTeaser`를 쓴다. */
export function Pricing({
  id,
  eyebrow = "Pricing",
  title,
  lede,
  note,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  lede?: string;
  note?: React.ReactNode;
}) {
  return (
    <section id={id} className="section">
      <div className="container">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="sectionTitle">{title}</h2>
        {lede && <p className="sectionLede">{lede}</p>}

        <ul className={s.grid}>
          {plans.map((plan) => (
            <li
              key={plan.id}
              className={`${s.card} ${plan.featured ? s.cardFeatured : ""}`}
            >
              {plan.featured && <span className={s.tag}>가장 무난한 선택</span>}

              <h3 className={s.name}>{plan.name}</h3>
              <p className={s.summary}>{plan.summary}</p>

              <p className={s.price}>
                {plan.price}
                <span className={s.priceNote}>{plan.priceNote}</span>
              </p>

              <ul className={s.items}>
                {plan.items.map((item) => (
                  <li key={item.text} className={item.ok ? s.item : s.itemOff}>
                    <Check ok={item.ok} />
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        {note && <div className={s.note}>{note}</div>}
      </div>
    </section>
  );
}
