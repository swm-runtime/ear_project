"use client";

import { useSyncExternalStore } from "react";
import { androidStoreUrl, iosStoreUrl } from "@/content/site";

export type StorePlatform = "ios" | "android" | "other";

const noSubscribe = () => () => {};

const detect = (): StorePlatform => {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  return "other";
};

/**
 * 방문자의 기기가 어느 스토어를 쓰는가. 버튼 하나로 스토어에 보내야 하는 자리(헤더·주제 고르기)가 쓴다.
 *
 * 서버 렌더(정적 내보내기)에서는 알 수 없어 `other`다 — 그래서 **이 값으로 갈리는 화면은 `other`일 때도
 * 말이 되게** 그린다. `useEffect` + `setState` 대신 구독 없는 외부 스토어로 읽는다
 * (`contents/OpenInApp.tsx`와 같은 이유 — react-hooks/set-state-in-effect).
 */
export function useStorePlatform(): StorePlatform {
  return useSyncExternalStore(noSubscribe, detect, () => "other" as const);
}

/** 그 기기의 스토어 주소. 판별할 수 없으면(데스크톱) `null` — 호출부가 두 스토어를 다 보여 주는 곳으로 보낸다 */
export function storeUrlFor(platform: StorePlatform): string | null {
  if (platform === "android") return androidStoreUrl;
  if (platform === "ios") return iosStoreUrl;
  return null;
}
