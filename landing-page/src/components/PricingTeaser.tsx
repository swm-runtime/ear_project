import Link from "next/link";
import { plans } from "@/content/site";
import { routes } from "@/content/routes";
import s from "./PricingTeaser.module.css";

/**
 * 홈의 요금제 요약.
 *
 * 요금제 페이지의 카드를 그대로 가져오지 않는다. 같은 내용이 두 주소에 통째로
 * 실리면 검색엔진이 어느 쪽을 대표로 볼지 흔들리기 때문이다. 여기서는 한 줄씩만
 * 보여 주고 판단에 필요한 것은 요금제 페이지로 넘긴다.
 */
export function PricingTeaser() {
  return (
    <section className={`section ${s.wrap}`}>
      <div className="container">
        <div className={s.grid}>
          <div className={s.copy}>
            <p className="eyebrow">Pricing</p>
            <h2 className="sectionTitle">무료로도 이용 가능해요</h2>
            <p className="sectionLede">
              먼저 무료로 들어보고, 더 듣고 싶어지면 그때 요금제를 바꿔 보세요.
            </p>
            <Link href={routes.pricing.path} className={`btn btnGhost ${s.link}`}>
              요금제 자세히 보기
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
                <path
                  d="M5 12h13m0 0-5.5-5.5M18 12l-5.5 5.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          </div>

          <ul className={s.rows}>
            {plans.map((plan) => (
              <li key={plan.id} className={s.row}>
                <span className={s.name}>{plan.name}</span>
                <span className={s.price}>{plan.price}</span>
                <span className={s.desc}>{plan.summary}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
