import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/LegalDocument";
import { PageHeader } from "@/components/PageHeader";
import { amendedPrivacyBlocks, legalMeta, legalNotice } from "@/content/privacy-2026-12-01";
import s from "@/components/Prose.module.css";

export const metadata: Metadata = {
  title: "개인정보 처리방침 개정 안내 (2026년 12월 1일)",
  description: "콘텐츠 후기(별점·글) 수집 관련 개정 안내. 공지일 2026년 10월 30일, 적용 예정일 2026년 12월 1일.",
  alternates: { canonical: "/privacy/2026-12-01" },
  // 11월 1일 개정 안내와 같은 이유로 색인하지 않는다 — 본문 대부분이 현행 방침과 같다
  robots: { index: false, follow: true },
};

export default function PrivacyAmendment20261201Page() {
  return (
    <>
      <PageHeader
        crumbs={[{ name: "개인정보 처리방침", path: "/privacy" }, { name: "개정 안내" }]}
        title="개인정보 처리방침 개정 안내"
        lede="공지일 2026년 10월 30일 · 적용 예정일 2026년 12월 1일"
      />
      <section className="section">
        <div className={`container ${s.prose}`}>
          <h2 className="sectionTitle">무엇이 달라지나요?</h2>
          <p>앱에서 콘텐츠마다 별점과 글로 후기를 남길 수 있게 되어, 이용자가 직접 입력하는 콘텐츠 후기(별점·글)를 수집 항목에 추가합니다. 후기는 서비스 개선과 콘텐츠 품질 관리에 쓰며, 다른 이용자에게 공개하지 않고 콘텐츠 편성과 추천에도 쓰지 않습니다. 후기 기능은 적용일 이후 운영 업데이트로 제공할 예정입니다.</p>
          <p>변경 조항은 1항(수집 항목), 2항(처리 목적), 3항(보유 기간)입니다. 후기는 남기지 않아도 서비스를 이용할 수 있으며, 회원 탈퇴 시 결제 이력 유무와 관계없이 즉시 파기합니다.</p>
          <p>이 개정 예정본은 2026년 11월 1일 적용되는 개정(Android 광고 ID)의 내용을 포함합니다. <Link href="/privacy/2026-11-01"><u>11월 1일 개정 안내 보기</u></Link></p>
          <p><Link href="/privacy"><u>기존 개인정보 처리방침 보기</u></Link></p>
        </div>
      </section>
      <LegalDocument blocks={amendedPrivacyBlocks} meta={legalMeta} notice={legalNotice} />
    </>
  );
}
