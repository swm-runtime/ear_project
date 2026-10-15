import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/LegalDocument";
import { PageHeader } from "@/components/PageHeader";
import { legalLabelsEn, legalMetaEn, legalNoticeEn, privacyBlocksEn } from "@/content/legal-en";

/** 글로벌(영어) Privacy Policy — KAN-199. 초안(법무 검토 전)이라 검색 색인에서 뺀다 */
export const metadata: Metadata = {
  title: "Privacy Policy — Ear",
  description: "What we collect, why, who receives it, how long we keep it, and the rights you have — written for users in the global market.",
  alternates: { languages: { ko: "/privacy", en: "/en/privacy" } },
  robots: { index: false, follow: false },
};

export default function EnglishPrivacyPage() {
  return (
    <div lang="en">
      <PageHeader
        homeLabel="Home"
        crumbsAria="You are here"
        crumbs={[{ name: "Privacy Policy" }]}
        title="Privacy Policy"
        lede="What we collect, why, who receives it, how long we keep it, and the rights you have — written for users in the global market."
      />

      <LegalDocument
        blocks={privacyBlocksEn}
        meta={legalMetaEn}
        notice={legalNoticeEn}
        labels={legalLabelsEn}
      />

      <div className="section">
        <div className="container">
          <p>
            See also: <Link href="/en/terms">Terms of Use</Link>
            {" · "}
            <Link href="/privacy">한국어</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
