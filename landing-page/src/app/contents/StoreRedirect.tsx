"use client";

import { useEffect } from "react";

/**
 * 공유 링크(`/contents/:id`)로 도착한 **앱 미설치 방문자**를 스토어로 보낸다.
 *
 * 앱이 설치된 기기는 OS가 유니버설 링크/App Links로 이 페이지에 오기 전에 앱을
 * 열기 때문에, 여기 도착했다는 것 자체가 "앱이 없다"는 뜻이다
 * (`docs/features/share.md` 4.2).
 *
 * 스토어 URL은 스토어 등록 후 채운다(`docs/tickets/backend/pending/
 * share-universal-links-hosting.md` — "스토어 URL 확정값"). null인 동안에는
 * 이동하지 않고 페이지의 안내 문구가 그대로 보인다.
 */
const IOS_STORE_URL: string | null = null;
const ANDROID_STORE_URL: string | null = null;

export function StoreRedirect() {
  useEffect(() => {
    const ua = navigator.userAgent;
    const target = /android/i.test(ua)
      ? ANDROID_STORE_URL
      : /iphone|ipad|ipod/i.test(ua)
        ? IOS_STORE_URL
        : null;

    // 데스크톱 등 판별 불가 환경은 이동하지 않는다 — 안내 문구가 역할을 대신한다.
    if (target) window.location.replace(target);
  }, []);

  return null;
}
