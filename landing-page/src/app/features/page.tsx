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
                미리 만들어뒀기 때문이에요
              </h2>
            </div>
            <div className={s.whyBody}>
              <p>
                재생을 누른 다음에 만드는 게 아니에요. 앱에 보이는 에피소드는
                전부 이미 오디오 파일로 준비돼 있고, 버튼을 누르면 그 파일이
                바로 흘러나올 뿐이에요. 기다리는 화면이 없는 이유예요.
              </p>
              <p>
                에피소드를 사람마다 따로 만들지도 않아요.{" "}
                <strong>한 편은 누구에게나 같은 한 편</strong>이고, 달라지는
                건 그중 무엇을 언제 보내 드리느냐예요. 그 판단은 서버가 미리
                해 두고요.
              </p>
              <p>
                그래서 듣는 사람이 늘어도 만들어야 하는 양이 함께 늘지 않아요.
                무료로도 매일 두 편을 드릴 수 있는 건 이 구조 덕분이에요.
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
