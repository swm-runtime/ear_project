import type { Metadata } from "next";
import { FaqList } from "@/components/Faq";
import { FinalCta } from "@/components/FinalCta";
import { JsonLd } from "@/components/JsonLd";
import { NextLinks } from "@/components/NextLinks";
import { PageHeader } from "@/components/PageHeader";
import { routes } from "@/content/routes";
import { faqCategories, faqs, site } from "@/content/site";
import { breadcrumb, faqPage, graph } from "@/lib/schema";
import { routeMetadata } from "@/lib/seo";
import s from "./page.module.css";

export const metadata: Metadata = routeMetadata("faq");

export default function FaqPage() {
  const groups = faqCategories.map((category) => ({
    category,
    items: faqs.filter((f) => f.category === category),
  }));

  return (
    <>
      {/* FAQPage 구조화 데이터는 이 페이지에만 둔다. 홈에도 넣으면 같은 질문이
          두 주소에서 리치 결과 후보가 되어 어느 쪽이 대표인지 흔들린다. */}
      <JsonLd
        data={graph([
          faqPage(),
          breadcrumb([{ name: routes.faq.label, path: routes.faq.path }]),
        ])}
      />

      <PageHeader
        crumbs={[{ name: routes.faq.label }]}
        title="자주 묻는 질문"
        lede="가장 많이 받는 질문을 주제별로 모았습니다. 여기서 답을 찾지 못하셨다면 메일로 편하게 물어봐 주세요."
      />

      <div className="section">
        <div className="container">
          <div className={s.layout}>
            <nav className={s.toc} aria-label="질문 주제">
              <p className={s.tocTitle}>주제</p>
              <ul>
                {groups.map((g) => (
                  <li key={g.category}>
                    <a href={`#${categoryId(g.category)}`}>
                      {g.category}
                      <span className={s.count}>{g.items.length}</span>
                    </a>
                  </li>
                ))}
              </ul>
              <p className={s.tocAsk}>
                답을 못 찾으셨나요?
                <br />
                <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
              </p>
            </nav>

            <div className={s.groups}>
              {groups.map((g) => (
                <section key={g.category} id={categoryId(g.category)} className={s.group}>
                  <h2 className={s.groupTitle}>{g.category}</h2>
                  <FaqList items={g.items} />
                </section>
              ))}
            </div>
          </div>
        </div>
      </div>

      <NextLinks items={[routes.features, routes.pricing, routes.privacy]} />
      <FinalCta />
    </>
  );
}

/** 한글 주제명을 그대로 id로 쓰면 주소에 퍼센트 인코딩이 붙는다. 고정 매핑을 쓴다. */
function categoryId(category: string): string {
  const map: Record<string, string> = {
    서비스: "service",
    콘텐츠: "content",
    "요금·결제": "billing",
    "계정·설정": "account",
  };
  return map[category] ?? "etc";
}
