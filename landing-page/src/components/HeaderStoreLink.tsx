"use client";

import { iosStoreUrl } from "@/content/site";
import { storeUrlFor, useStorePlatform } from "@/lib/store-platform";
import { AppleLogo } from "./AppleLogo";
import { GooglePlayLogo } from "./GooglePlayLogo";

/**
 * 헤더의 [앱 다운로드] — 자리가 버튼 하나뿐이라 방문자의 기기에 맞는 스토어로 보낸다.
 *
 * Android 기기면 Google Play, 그 밖(아이폰·데스크톱·판별 전)은 App Store다. 헤더에서 이 버튼만
 * 클라이언트 컴포넌트다 — 정적으로 한 스토어만 걸면 Android 방문자가 App Store로 가서 돌아 나와야 한다.
 */
export function HeaderStoreLink({ className }: { className: string }) {
  const platform = useStorePlatform();
  const isAndroid = platform === "android";

  return (
    <a
      href={storeUrlFor(platform) ?? iosStoreUrl}
      className={className}
      target="_blank"
      rel="noopener noreferrer"
    >
      {isAndroid ? <GooglePlayLogo /> : <AppleLogo />}
      앱 다운로드
    </a>
  );
}
