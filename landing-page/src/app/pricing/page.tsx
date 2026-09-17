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
          breadcrumb([
            { name: routes.pricing.label, path: routes.pricing.path },
          ]),
        ])}
      />

      <PageHeader
        crumbs={[{ name: routes.pricing.label }]}
        title="무료로도 매일 2편이 도착해요"
        lede="무료로 가볍게 시작해 보고, 더 많이 듣고 싶어지면 데일리와 프로로 하루를 넉넉하게 채워 보세요."
      />

      <Pricing
        title="세 가지 요금제"
        lede="라이트는 앞으로도 계속 무료예요. 데일리와 프로의 가격과 재생 한도는 시범 운영에서 실제로 얼마나 듣는지 확인한 뒤 정할거에요."
        note={
          <p>
            유료 요금제의 숫자를 아직 적지 않은 이유가 있어요. 한도를 감으로
            정하면 너무 좁아 매일 막히거나, 너무 넓어 무료와 다를 게
            없어지거든요. 정해지는 대로 이 페이지에서 알려 드릴게요.
          </p>
        }
      />

      <section className={`section ${s.compare}`}>
        <div className="container">
          <p className="eyebrow">Compare</p>
          <h2 className="sectionTitle">무엇이 같고, 무엇이 다를까요</h2>
          {/* 문장 단위로 줄을 끊는다 — 두 문장이 애매한 자리에서 감기면 읽기 흐름이 깨진다(피드백 2026-09-18) */}
          <p className="sectionLede">
            모든 요금제에서 같은 콘텐츠를 받아요.
            <br />
            요금제가 올라갈수록 하루에 더 많이 들을 수 있어요.
          </p>

          <div className={s.compareGrid}>
            <div className={s.compareCol}>
              <h3 className={s.compareTitle}>
                <span className={`${s.badge} ${s.badgeSame}`}>
                  모든 요금제 동일
                </span>
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
                <span className={`${s.badge} ${s.badgeDiff}`}>
                  요금제별로 다름
                </span>
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

      <section className="section">
        <div className="container">
          <p className="eyebrow">Billing</p>
          <h2 className="sectionTitle">결제와 해지</h2>
          <p className="sectionLede">
            구독은 앱 스토어의 인앱 결제로 해요. 결제 전에 알아 두면 좋은 것들을
            모았어요.
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
