"use client";

import { useEffect } from "react";
import { androidStoreUrl, iosStoreUrl } from "@/content/site";

/**
 * `/app/` 방문자를 기기에 맞는 스토어로 바로 보낸다 — 아이폰·아이패드는 App Store, 안드로이드는 Google Play.
 * 휴대폰이 아닌 환경(PC)은 랜딩(`/`)으로 보낸다(2026-10-31 — 커뮤니티 글의 앱 링크를 PC로 누르면 스토어 버튼만
 * 덩그러니 남았다). 출처는 랜딩 주소의 UTM으로 넘겨 GA4에 남긴다. 스크립트가 막힌 환경에서만 페이지의 두 스토어 버튼이 남는다.
 * 아이패드 사파리는 맥과 같은 UA를 보내서 터치 지원으로 가른다.
 *
 * 인스타그램 프로필처럼 링크를 하나만 걸 수 있는 곳에 쓰는 주소다. 랜딩(`/`)을 걸면 스토어 버튼을
 * 한 번 더 눌러야 하고, 스토어 한쪽을 걸면 다른 OS 사용자가 막힌다.
 *
 * 공유 링크(`/contents/`)와 달리 자동 이동을 켠다. 공유 링크는 앱이 있는 사람도 카톡 인앱 브라우저로
 * 도착해 [앱에서 열기]를 눌러야 해서 자동 이동을 껐지만, 이 주소의 목적은 설치다.
 *
 * **유입 출처(`?src=`)** — `/app/?src=ig_bio` 처럼 붙이면 스토어별 캠페인 값으로 넘긴다.
 * - Google Play: `referrer`에 UTM(`utm_source=<src>`)을 실어 Play Console 획득 보고서에서 출처별로 본다.
 * - App Store: 캠페인 링크(`pt`=제공자 토큰, `ct`=<src>)여야 App Store Connect 앱 분석에 잡힌다.
 *   제공자 토큰은 App Store Connect → 앱 분석 → 획득 → 캠페인 → "캠페인 링크 생성"에서 확인한다.
 *   토큰은 계정(팀) 단위 값이라 모든 캠페인에서 같고, 공개 링크에 그대로 실리는 값이다(2026-10-04 등록).
 * 허용하지 않는 문자가 섞인 출처는 버린다 — 스토어 주소에 그대로 이어 붙이는 값이라서다.
 */
const APP_STORE_PROVIDER_TOKEN: string | null = "129359203";

const SOURCE_PATTERN = /^[a-z0-9_-]{1,40}$/;

export function readSource(search: string): string | null {
  const src = new URLSearchParams(search).get("src");
  return src && SOURCE_PATTERN.test(src) ? src : null;
}

export function storeUrlFor(store: "ios" | "android", src: string | null): string {
  if (!src) return store === "ios" ? iosStoreUrl : androidStoreUrl;

  if (store === "android") {
    const referrer = new URLSearchParams({
      utm_source: src,
      utm_medium: "app_link",
      utm_campaign: "earcast_app",
    }).toString();
    return `${androidStoreUrl}&referrer=${encodeURIComponent(referrer)}`;
  }

  if (!APP_STORE_PROVIDER_TOKEN) return iosStoreUrl;
  const query = new URLSearchParams({ pt: APP_STORE_PROVIDER_TOKEN, ct: src, mt: "8" }).toString();
  return `${iosStoreUrl}?${query}`;
}

/** 휴대폰이 아닐 때 갈 랜딩 주소. 출처가 있으면 스토어 링크와 같은 UTM 값으로 붙인다 */
export function landingUrlFor(src: string | null): string {
  if (!src) return "/";
  const query = new URLSearchParams({
    utm_source: src,
    utm_medium: "app_link",
    utm_campaign: "earcast_app",
  }).toString();
  return `/?${query}`;
}

export function AppStoreRedirect() {
  useEffect(() => {
    const ua = navigator.userAgent;
    const iPadOS = /macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
    const store = /android/i.test(ua) ? "android" : /iphone|ipad|ipod/i.test(ua) || iPadOS ? "ios" : null;
    const src = readSource(window.location.search);
    window.location.replace(store ? storeUrlFor(store, src) : landingUrlFor(src));
  }, []);

  return null;
}
