import type { Metadata } from "next";
import { enRoutes } from "@/content/en/routes";
import { privacyBlocksEn } from "@/content/legal-en";
import { enRouteMetadata } from "@/lib/seo";
import { EnLegalPage } from "../LegalPage";

/**
 * 글로벌(영어) Privacy Policy — KAN-199. 본문은 `content/legal-en.ts`(PR #1584 — 동남아 개인정보법 공통 고지·
 * CCPA/CPRA를 더해 글로벌 시장용으로 쓴 초안). 법무 검토 전이라 색인에서 뺀다
 * (`enRoutes.privacy.indexable: false` → noindex·nofollow).
 */
export const metadata: Metadata = enRouteMetadata("privacy");

export default function EnPrivacyPage() {
  return (
    <EnLegalPage
      routeKey="privacy"
      lede={enRoutes.privacy.description}
      blocks={privacyBlocksEn}
      next={["terms", "accountDeletion"]}
    />
  );
}
