import Link from "next/link";
import s from "./LegalDocument.module.css";

/**
 * 개인정보 처리방침 개정 공지. 개정마다 문단 하나다 — 공지일·적용일이 달라 합치지 않는다(KAN-285).
 * 시행된 개정은 그 본문을 현행 방침(`content/legal.ts`)으로 옮길 때 여기서 뺀다.
 */
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
      <p className={s.notice}>
        <strong>개인정보 처리방침 개정 안내</strong>
        <br />
        공지일 2026년 10월 30일 · 적용 예정일 2026년 12월 1일
        <br />
        이용자가 남기는 콘텐츠 후기(별점·글)를 수집 항목에 추가합니다. 후기는 다른 이용자에게
        공개하지 않으며 콘텐츠 추천에 쓰지 않습니다.{" "}
        <Link href="/privacy/2026-12-01"><u>변경 내용과 개정 예정본 보기</u></Link>
      </p>
    </aside>
  );
}
