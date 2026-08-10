import type { Metadata } from "next";
import { FinalCta } from "@/components/FinalCta";
import { JsonLd } from "@/components/JsonLd";
import { NextLinks } from "@/components/NextLinks";
import { PageHeader } from "@/components/PageHeader";
import { Pricing } from "@/components/Pricing";
import { routes } from "@/content/routes";
import { billingNotes, planComparison } from "@/content/site";
import { breadcrumb, graph } from "@/lib/schema";
import { routeMetadata } from "@/lib/seo";
import s from "./page.module.css";

export const metadata: Metadata = routeMetadata("pricing");

export default function PricingPage() {
  return (
    <>
      <JsonLd
        data={graph([
          breadcrumb([{ name: routes.pricing.label, path: routes.pricing.path }]),
        ])}
      />

      <PageHeader
        crumbs={[{ name: routes.pricing.label }]}
        title="무료로도 매일 2편, 그대로 도착합니다"
        lede="구독 서비스에서 무료와 유료를 가르는 가장 흔한 방법은 공급량입니다. 이어는 반대로 잡았습니다. 도착하는 편수는 모두 같고, 요금제는 하루에 재생할 수 있는 분량만 가릅니다."
      />

      <Pricing
        title="세 가지 요금제"
        lede="라이트는 지금도 앞으로도 무료입니다. 데일리와 프로의 가격과 재생 한도는 시범 운영에서 실제 청취 데이터를 본 뒤 확정합니다."
        note={
          <p>
            유료 요금제의 숫자를 아직 적지 않은 이유는 단순합니다. 한도를 감으로 정하면
            너무 좁아 매일 막히거나, 너무 넓어 무료와 다를 게 없어집니다. 어느 쪽이든
            나중에 고치는 비용이 지금 기다리는 비용보다 큽니다. 확정되는 대로 이 페이지에
            반영하겠습니다.
          </p>
        }
      />

      <section className={`section ${s.compare}`}>
        <div className="container">
          <p className="eyebrow">Compare</p>
          <h2 className="sectionTitle">무엇이 같고 무엇이 다른가</h2>
          <p className="sectionLede">
            가장 많이 오해받는 지점입니다. 요금제를 올려도 콘텐츠가 더 많이 오지는
            않습니다.
          </p>

          <div className={s.compareGrid}>
            <div className={s.compareCol}>
              <h3 className={s.compareTitle}>
                <span className={`${s.badge} ${s.badgeSame}`}>모든 요금제 동일</span>
              </h3>
              <dl className={s.rows}>
                {planComparison.same.map((row) => (
                  <div key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className={s.compareCol}>
              <h3 className={s.compareTitle}>
                <span className={`${s.badge} ${s.badgeDiff}`}>요금제별로 다름</span>
              </h3>
              <dl className={s.rows}>
                {planComparison.different.map((row) => (
                  <div key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </section>

      <section className="section onDark">
        <div className="container">
          <p className="eyebrow">Billing</p>
          <h2 className="sectionTitle">결제와 해지</h2>
          <p className="sectionLede">
            구독은 앱 스토어의 인앱 결제로 이뤄집니다. 결제 전에 알아 두면 좋은 것들을
            모았습니다.
          </p>

          <ol className={s.billing}>
            {billingNotes.map((note, i) => (
              <li key={note.title} className={s.billingItem}>
                <span className={s.billingNum} aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className={s.billingTitle}>{note.title}</h3>
                  <p className={s.billingBody}>{note.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <NextLinks items={[routes.faq, routes.features, routes.terms]} />
      <FinalCta />
    </>
  );
}
