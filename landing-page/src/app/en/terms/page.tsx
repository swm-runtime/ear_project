import type { Metadata } from "next";
import { enRoutes } from "@/content/en/routes";
import { termsBlocksEn } from "@/content/legal-en";
import { enRouteMetadata } from "@/lib/seo";
import { EnLegalPage } from "../LegalPage";

/**
 * 글로벌(영어) Terms of Use — KAN-199. 본문은 `content/legal-en.ts`(PR #1584 — 한국어 약관 번역이 아니라
 * Apple 3.1.2·자체 EULA 필수 조항을 더해 글로벌 시장용으로 쓴 초안). 법무 검토 전이라 색인에서 뺀다
 * (`enRoutes.terms.indexable: false` → noindex·nofollow).
 */
export const metadata: Metadata = enRouteMetadata("terms");

export default function EnTermsPage() {
  return (
    <EnLegalPage
      routeKey="terms"
      lede={enRoutes.terms.description}
      blocks={termsBlocksEn}
      next={["privacy", "accountDeletion"]}
    />
  );
}
