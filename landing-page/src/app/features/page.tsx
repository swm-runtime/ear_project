import type { Metadata } from "next";
import { Features } from "@/components/Features";
import { FinalCta } from "@/components/FinalCta";
import { JsonLd } from "@/components/JsonLd";
import { NextLinks } from "@/components/NextLinks";
import { PageHeader } from "@/components/PageHeader";
import { routes } from "@/content/routes";
import { features, nonGoals } from "@/content/site";
import { breadcrumb, graph } from "@/lib/schema";
import { routeMetadata } from "@/lib/seo";
import s from "./page.module.css";

export const metadata: Metadata = routeMetadata("features");

export default function FeaturesPage() {
  return (
    <>
      <JsonLd
        data={graph([
          breadcrumb([
            { name: routes.features.label, path: routes.features.path },
          ]),
        ])}
      />

      <PageHeader
        crumbs={[{ name: routes.features.label }]}
        title="고르지 않아도, 매일 도착해요"
        lede="이어가 하는 일은 하나예요. 출퇴근길에 앱을 열면 들을 게 이미 준비되어 있게 하는 것. 그걸 위해 무엇을 만들었는지 정리했어요."
      />

      <Features
        title="여섯 가지 기능"
        lede="기능을 늘리기보다 번거로움을 줄이는 데 집중했어요. 아래 여섯 가지는 모두 듣기까지의 단계를 하나씩 없애기 위한 거예요."
        items={features.map((f) => ({
          icon: f.icon,
          title: f.title,
          text: f.detail,
        }))}
      />

      <section className={`section ${s.why}`}>
        <div className="container">
          <div className={s.whyGrid}>
            <div>
              <p className="eyebrow">Why it works</p>
              <h2 className="sectionTitle">
                즉시 재생이 가능한 건
                <br />
                처음부터 그렇게 만들었기 때문이에요
              </h2>
            </div>
            <div className={s.whyBody}>
              <p>
                이어는 누른 뒤에 콘텐츠를 만들지 않아요. 화면에 보이는
                에피소드는 모두 오디오로 만들어져 있고, 재생 버튼은 이미 있는
                파일을 틀기만 해요. 그래서 &lsquo;생성 중&rsquo; 화면이 없어요.
              </p>
              <p>
                이게 가능한 이유는{" "}
                <strong>대본을 사람마다 다르게 만들지 않기</strong> 때문이에요.
                같은 에피소드는 모두에게 똑같고, 개인화는 무엇을 언제 들려
                드릴지 정하는 단계에만 적용돼요.
              </p>
              <p>
                덕분에 듣는 사람이 늘어도 콘텐츠를 만드는 비용이 크게 늘지
                않아요. 무료 요금제에도 매일 두 편을 드릴 수 있는 이유예요.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <p className="eyebrow">Non-goals</p>
          <h2 className="sectionTitle">하지 않기로 정한 것</h2>
          <p className="sectionLede">
            무엇을 만들었는지보다 무엇을 하지 않기로 했는지가 이어를 더 잘
            설명해 줘요.
          </p>

          <ul className={s.nonGoals}>
            {nonGoals.map((n) => (
              <li key={n.title} className={s.nonGoal}>
                <h3 className={s.nonGoalTitle}>{n.title}</h3>
                <p className={s.nonGoalBody}>{n.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <NextLinks items={[routes.pricing, routes.faq, routes.blog]} />
      <FinalCta />
    </>
  );
}
