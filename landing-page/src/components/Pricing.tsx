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

export function Pricing() {
  return (
    <section id="pricing" className="section">
      <div className="container">
        <p className="eyebrow">Pricing</p>
        <h2 className="sectionTitle">요금제가 가르는 건 재생 한도뿐입니다</h2>
        <p className="sectionLede">
          매일 도착하는 콘텐츠는 무료 요금제도 똑같이 2편입니다. 요금제에 따라
          달라지는 것은 하루에 재생할 수 있는 분량입니다.
        </p>

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

        <p className={s.note}>
          유료 요금제의 가격과 재생 한도는 시범 운영에서 실제 청취 데이터를 본 뒤
          확정합니다. 정해지지 않은 숫자를 미리 적어 두지 않으려는 것이니,
          확정되는 대로 이 페이지에 반영하겠습니다.
        </p>
      </div>
    </section>
  );
}
