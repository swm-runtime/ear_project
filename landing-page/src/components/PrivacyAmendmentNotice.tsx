import Link from "next/link";
import s from "./LegalDocument.module.css";

export function PrivacyAmendmentNotice() {
  return (
    <aside className="container" aria-label="개인정보 처리방침 개정 공지">
      <p className={s.notice}>
        <strong>개인정보 처리방침 개정 안내</strong>
        <br />
        공지일 2026년 10월 2일 · 적용 예정일 2026년 11월 1일
        <br />
        Android 광고 ID의 Meta 제공 및 광고 성과 측정·최적화에 관한 내용을 추가합니다.
        iOS 광고 ID는 수집하지 않습니다.{" "}
        <Link href="/privacy/2026-11-01"><u>변경 내용과 개정 예정본 보기</u></Link>
      </p>
    </aside>
  );
}
