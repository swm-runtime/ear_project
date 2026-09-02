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
          breadcrumb([{ name: routes.features.label, path: routes.features.path }]),
        ])}
      />

      <PageHeader
        crumbs={[{ name: routes.features.label }]}
        title="고르지 않아도, 매일 도착합니다"
        lede="이어가 하는 일은 결국 하나입니다. 통근길에 앱을 열었을 때 들을 것이 이미 준비되어 있게 하는 것. 그 하나를 위해 무엇을 만들었는지 정리했습니다."
      />

      <Features
        title="여섯 가지 기능"
        lede="기능을 늘리는 것보다 마찰을 줄이는 쪽에 시간을 썼습니다. 아래 여섯 가지는 모두 '듣기까지 걸리는 단계'를 하나씩 없애기 위한 것입니다."
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
                구조를 그렇게 짰기 때문입니다
              </h2>
            </div>
            <div className={s.whyBody}>
              <p>
                이어는 요청을 받은 뒤에 콘텐츠를 만들지 않습니다. 화면에 보이는
                에피소드는 전부 오디오 변환이 끝난 상태이고, 재생 버튼은 이미 있는
                파일을 트는 일만 합니다. 그래서 &lsquo;생성 중&rsquo; 화면이 존재하지
                않습니다.
              </p>
              <p>
                이게 가능한 이유는 <strong>대본을 사람마다 다르게 만들지 않기</strong>{" "}
                때문입니다. 같은 에피소드는 모든 사용자에게 동일하고, 개인화는 무엇을
                언제 들려줄지를 정하는 편성 단계에서만 일어납니다.
              </p>
              <p>
                덕분에 듣는 사람이 늘어도 콘텐츠를 만드는 비용이 그만큼 늘지 않습니다.
                무료 요금제에도 매일 두 편을 줄 수 있는 것은 이 구조 덕분입니다.
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
            무엇을 만들었는지보다 무엇을 만들지 않기로 했는지가 서비스의 경계를 더
            정확히 설명한다고 생각합니다.
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
