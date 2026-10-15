import type { Metadata } from "next";
import Link from "next/link";
import { AppStoreRedirect } from "./AppStoreRedirect";
import s from "../contents/page.module.css";
import { AppleLogo } from "@/components/AppleLogo";
import { GooglePlayLogo } from "@/components/GooglePlayLogo";
import { androidStoreUrl, iosStoreUrl } from "@/content/site";

/**
 * 앱 받기 링크 — `https://earcast.co.kr/app/`.
 *
 * 휴대폰으로 열면 `AppStoreRedirect`가 기기에 맞는 스토어로 바로 보낸다. 이 화면은 데스크톱이나
 * 자동 이동이 막힌 인앱 브라우저에서만 보인다 — 그래서 두 스토어 버튼을 둔다.
 *
 * 인스타그램 프로필 링크 등 "링크 하나" 자리에 쓴다(2026-10-04, 메타 광고·인스타 운영).
 * 출처를 남기려면 `/app/?src=ig_bio` 처럼 붙인다(규칙은 `AppStoreRedirect.tsx`).
 *
 * 공유 링크 페이지(`/contents/`)와 같은 레이아웃이라 그 스타일을 쓴다.
 * `routes.ts`에 등록하지 않는다 — 내비·사이트맵에 나올 페이지가 아니고 색인 대상도 아니다.
 */
export const metadata: Metadata = {
  title: "이어 앱 받기",
  robots: { index: false, follow: false },
};

export default function AppLinkPage() {
  return (
    <div className={s.wrap}>
      <div className="container">
        <AppStoreRedirect />

        <p className={s.eyebrow}>이어 앱 받기</p>
        <h1 className={s.title}>스토어로 이동하고 있어요</h1>
        <p className={s.lede}>이동하지 않으면 쓰시는 휴대폰의 스토어를 눌러 주세요.</p>

        <div className={s.actions}>
          <a href={iosStoreUrl} className="btn" rel="noopener noreferrer">
            <AppleLogo />
            App Store
          </a>
          <a href={androidStoreUrl} className="btn" rel="noopener noreferrer">
            <GooglePlayLogo />
            Google Play
          </a>
        </div>

        <Link href="/" className="btn" style={{ marginTop: 24 }}>
          이어 알아보기
        </Link>
      </div>
    </div>
  );
}
