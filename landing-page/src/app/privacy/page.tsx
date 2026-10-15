import { PrivacyAmendmentNotice } from "@/components/PrivacyAmendmentNotice";
import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { LegalDocument } from "@/components/LegalDocument";
import { NextLinks } from "@/components/NextLinks";
import { PageHeader } from "@/components/PageHeader";
import { privacyBlocks } from "@/content/legal";
import { routes } from "@/content/routes";
import { breadcrumb, graph } from "@/lib/schema";
import { routeMetadata } from "@/lib/seo";

export const metadata: Metadata = routeMetadata("privacy");

export default function PrivacyPage() {
  return (
    <>
      <JsonLd
        data={graph([
          breadcrumb([{ name: routes.privacy.label, path: routes.privacy.path }]),
        ])}
      />

      <PageHeader
        crumbs={[{ name: routes.privacy.label }]}
        title="개인정보 처리방침"
        lede="보존이 아니라 파기가 원칙입니다. 어떤 정보를 왜 받고, 언제까지 두었다가 어떻게 지우는지를 그대로 적었습니다."
      />

      {/* Google Play는 개인정보처리방침 URL이 언어별이 아니라 하나뿐이라, 해외 사용자가 여기서 영어판으로 갈 수 있어야 한다(KAN-214) */}
      <div className="container">
        <p lang="en">
          <Link href="/en/privacy/">Read this Privacy Policy in English</Link>
        </p>
      </div>

      <PrivacyAmendmentNotice />
      <LegalDocument blocks={privacyBlocks} />

      <NextLinks items={[routes.terms, routes.faq, routes.pricing]} />
    </>
  );
}
