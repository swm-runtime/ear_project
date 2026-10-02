import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/LegalDocument";
import { PageHeader } from "@/components/PageHeader";
import { amendedPrivacyBlocks, legalMeta, legalNotice } from "@/content/privacy-2026-11-01";
import s from "@/components/Prose.module.css";

export const metadata: Metadata = {
  title: "개인정보 처리방침 개정 안내 (2026년 11월 1일)",
  description: "Android 광고 ID 수집 및 Meta 광고 성과 측정 관련 개정 안내. 공지일 2026년 10월 2일, 적용 예정일 2026년 11월 1일.",
  alternates: { canonical: "/privacy/2026-11-01" },
};

export default function PrivacyAmendmentPage() {
  return (
    <>
      <PageHeader
        crumbs={[{ name: "개인정보 처리방침", path: "/privacy" }, { name: "개정 안내" }]}
        title="개인정보 처리방침 개정 안내"
        lede="공지일 2026년 10월 2일 · 적용 예정일 2026년 11월 1일"
      />
      <section className="section">
        <div className={`container ${s.prose}`}>
          <h2 className="sectionTitle">무엇이 달라지나요?</h2>
          <p>Android에서 Meta에 광고 ID(AAID/GAID)를 제공하여 광고와 앱 설치·가입·첫 재생을 연결하고 광고 성과를 측정·최적화합니다. Meta 광고 ID 수집은 현재 꺼져 있으며, 적용일 이후 운영 업데이트로 활성화할 예정입니다.</p>
          <p>변경 조항은 1항(수집 항목), 5항(처리 위탁), 6항(국외 이전), 7항(분석·광고 도구 및 거부 방법)입니다. Google Firebase의 Android 광고 ID 관련 설명도 실제 SDK 설정에 맞춰 명확히 합니다. iOS IDFA는 수집하지 않습니다.</p>
          <p>Android 설정의 Google → 모든 서비스 → 광고에서 광고 ID를 삭제할 수 있습니다. 메뉴는 기기와 OS 버전에 따라 다를 수 있습니다. 광고 ID 삭제는 그 식별자의 사용을 제한하며, 모든 분석 이벤트 수집을 중단하는 기능은 아닙니다. 자세한 이전 항목·목적·보유 기간·거부 방법은 아래 개정 예정본 6·7항을 확인해 주세요.</p>
          <p><Link href="/privacy"><u>기존 개인정보 처리방침 보기</u></Link></p>
        </div>
      </section>
      <LegalDocument blocks={amendedPrivacyBlocks} meta={legalMeta} notice={legalNotice} />
    </>
  );
}
