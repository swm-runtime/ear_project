import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { LegalDocument } from "@/components/LegalDocument";
import { NextLinks } from "@/components/NextLinks";
import { PageHeader } from "@/components/PageHeader";
import { termsBlocks } from "@/content/legal";
import { routes } from "@/content/routes";
import { breadcrumb, graph } from "@/lib/schema";
import { routeMetadata } from "@/lib/seo";

export const metadata: Metadata = routeMetadata("terms");

export default function TermsPage() {
  return (
    <>
      <JsonLd
        data={graph([
          breadcrumb([{ name: routes.terms.label, path: routes.terms.path }]),
        ])}
      />

      <PageHeader
        crumbs={[{ name: routes.terms.label }]}
        title="이용약관"
        lede="서비스를 어떤 조건으로 제공하고, 구독과 해지는 어떻게 처리하며, 콘텐츠를 어디까지 이용할 수 있는지를 정한 약관입니다."
      />

      <LegalDocument blocks={termsBlocks} />

      <NextLinks items={[routes.privacy, routes.pricing, routes.faq]} />
    </>
  );
}
