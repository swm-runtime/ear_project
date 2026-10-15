import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/LegalDocument";
import { PageHeader } from "@/components/PageHeader";
import { legalLabelsEn, legalMetaEn, legalNoticeEn, termsBlocksEn } from "@/content/legal-en";

/** 글로벌(영어) Terms of Use — KAN-199. 초안(법무 검토 전)이라 검색 색인에서 뺀다 */
export const metadata: Metadata = {
  title: "Terms of Use — Ear",
  description: "The rules for using Ear — eligibility, subscriptions and cancellation, AI-generated content, and how you may use our episodes.",
  alternates: { languages: { ko: "/terms", en: "/en/terms" } },
  robots: { index: false, follow: false },
};

export default function EnglishTermsPage() {
  return (
    <div lang="en">
      <PageHeader
        homeLabel="Home"
        crumbsAria="You are here"
        crumbs={[{ name: "Terms of Use" }]}
        title="Terms of Use"
        lede="The rules for using Ear — eligibility, subscriptions and cancellation, AI-generated content, and how you may use our episodes."
      />

      <LegalDocument
        blocks={termsBlocksEn}
        meta={legalMetaEn}
        notice={legalNoticeEn}
        labels={legalLabelsEn}
      />

      <div className="section">
        <div className="container">
          <p>
            See also: <Link href="/en/privacy">Privacy Policy</Link>
            {" · "}
            <Link href="/terms">한국어</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
