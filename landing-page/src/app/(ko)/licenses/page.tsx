import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { NextLinks } from "@/components/NextLinks";
import { PageHeader } from "@/components/PageHeader";
import { Prose } from "@/components/Prose";
import { licensesBlocks } from "@/content/licenses";
import { routes } from "@/content/routes";
import { breadcrumb, graph } from "@/lib/schema";
import { routeMetadata } from "@/lib/seo";

export const metadata: Metadata = routeMetadata("licenses");

/** 앱 설정의 [오픈소스 라이선스] 행이 여는 페이지 — 시행일·버전이 있는 정책 문서가 아니라 고지 목록이라 Prose 만 쓴다 */
export default function LicensesPage() {
  return (
    <>
      <JsonLd
        data={graph([breadcrumb([{ name: routes.licenses.label, path: routes.licenses.path }])])}
      />

      <PageHeader
        crumbs={[{ name: routes.licenses.label }]}
        title="오픈소스 라이선스"
        lede="이어 앱에 쓰인 제3자 저작물의 저작자와 라이선스, 우리가 바꾼 부분을 밝힙니다."
      />

      <div className="section">
        <div className="container">
          <Prose blocks={licensesBlocks} />
        </div>
      </div>

      <NextLinks items={[routes.terms, routes.privacy, routes.faq]} />
    </>
  );
}
