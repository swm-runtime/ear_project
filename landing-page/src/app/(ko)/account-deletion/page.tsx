import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { LegalDocument } from "@/components/LegalDocument";
import { NextLinks } from "@/components/NextLinks";
import { PageHeader } from "@/components/PageHeader";
import { accountDeletionBlocks } from "@/content/account-deletion";
import { routes } from "@/content/routes";
import { breadcrumb, graph } from "@/lib/schema";
import { routeMetadata } from "@/lib/seo";

export const metadata: Metadata = routeMetadata("accountDeletion");

export default function AccountDeletionPage() {
  return (
    <>
      <JsonLd
        data={graph([
          breadcrumb([
            { name: routes.accountDeletion.label, path: routes.accountDeletion.path },
          ]),
        ])}
      />

      <PageHeader
        crumbs={[{ name: routes.accountDeletion.label }]}
        title="계정 삭제 요청"
        lede="앱에서 직접 삭제할 수 있습니다. 무엇이 지워지고 무엇이 법령 때문에 남는지도 함께 밝힙니다."
      />

      <LegalDocument blocks={accountDeletionBlocks} />

      <NextLinks items={[routes.privacy, routes.terms, routes.faq]} />
    </>
  );
}
