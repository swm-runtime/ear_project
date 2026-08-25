import type { Metadata } from "next";
import Link from "next/link";
import { StoreRedirect } from "./StoreRedirect";
import s from "./page.module.css";

/**
 * 공유 링크 수신 페이지.
 *
 * 앱에서 공유한 링크는 `https://earcast.co.kr/contents/:id` 형태이고, `vercel.json`의
 * rewrite가 모든 `/contents/:id` 요청을 이 페이지로 보낸다. **앱이 설치된 기기는 OS가
 * 브라우저 대신 앱을 열므로 이 페이지에 오지 않는다** — 여기 도착한 방문자는 앱 미설치이며,
 * 역할은 스토어 이동(`StoreRedirect`)과 그 전까지의 안내가 전부다.
 *
 * 콘텐츠 미리보기(제목·썸네일)를 그리지 않는다 — 수신자용 웹 랜딩은 비범위다
 * (PRD 4.2 · `docs/features/share.md`). `content_id`도 읽지 않는다.
 *
 * `routes.ts`에 등록하지 않는다 — 사이트맵·내비에 나올 페이지가 아니고,
 * 색인 대상도 아니다(아래 robots).
 */
export const metadata: Metadata = {
  title: "이어 앱에서 들을 수 있어요",
  robots: { index: false, follow: false },
};

export default function ContentsRedirectPage() {
  return (
    <div className={s.wrap}>
      <div className="container">
        <StoreRedirect />

        <p className={s.eyebrow}>이어 콘텐츠</p>
        <h1 className={s.title}>이어 앱에서 들을 수 있어요</h1>
        <p className={s.lede}>
          공유받은 콘텐츠는 이어 앱에서 재생됩니다. 앱을 설치한 뒤 링크를 다시 열면
          해당 콘텐츠로 바로 이동해요.
        </p>

        {/* 스토어 등록 전까지의 임시 안내 — URL 확정 시 StoreRedirect가 자동 이동을 맡고,
            이 자리는 스토어 버튼으로 바뀐다(tickets/backend/pending/share-universal-links-hosting.md) */}
        <p className={s.note}>앱은 현재 출시를 준비하고 있어요.</p>

        <Link href="/" className="btn btnPrimary" style={{ marginTop: 24 }}>
          이어 알아보기
        </Link>
      </div>
    </div>
  );
}
