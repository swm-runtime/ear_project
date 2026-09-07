import type { Metadata } from "next";
import Link from "next/link";
import { OpenInApp } from "./OpenInApp";
import { StoreRedirect } from "./StoreRedirect";
import s from "./page.module.css";

/**
 * 공유 링크 수신 페이지.
 *
 * 앱에서 공유한 링크는 `https://earcast.co.kr/contents/:id` 형태이고, `vercel.json`의
 * rewrite가 모든 `/contents/:id` 요청을 이 페이지로 보낸다.
 *
 * **"여기 온 사람은 앱이 없다"는 전제가 깨졌다**(2026-09-08). 카카오톡은 링크를 인앱
 * 브라우저로 열고, 인앱 브라우저는 유니버설 링크·App Links 검증을 타지 않아 **앱이 설치돼
 * 있어도 여기 도착한다.** 공유의 주 경로가 카톡이라 그대로 두면 실제 도달률이 낮다.
 * 그래서 `OpenInApp`이 앱 전환 경로를 제공한다
 * (`docs/tickets/frontend/pending/share-link-in-app-browser-escape.md`).
 *
 * 콘텐츠 미리보기(제목·썸네일)는 여전히 그리지 않는다 — 수신자용 웹 랜딩은 비범위다
 * (PRD 4.2 · `docs/features/share.md`). **`content_id`는 앱 링크를 조립하기 위해서만 읽는다.**
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
        {/* 앱이 있으면 여기서 넘어간다. 없으면 아무 일도 일어나지 않고 아래 안내가 남는다 */}
        <OpenInApp />

        <p className={s.note}>앱은 현재 출시를 준비하고 있어요.</p>

        <Link href="/" className="btn" style={{ marginTop: 24 }}>
          이어 알아보기
        </Link>
      </div>
    </div>
  );
}
