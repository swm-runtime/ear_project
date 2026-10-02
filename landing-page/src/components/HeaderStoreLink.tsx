"use client";

import { useEffect, useRef } from "react";
import { androidStoreUrl, iosStoreUrl } from "@/content/site";
import { storeUrlFor, useStorePlatform } from "@/lib/store-platform";
import { AppleLogo } from "./AppleLogo";
import { GooglePlayLogo } from "./GooglePlayLogo";
import s from "./Header.module.css";

/**
 * 헤더의 [앱 다운로드] — 자리는 버튼 하나인데 스토어는 둘이다.
 *
 * - **휴대폰**: 그 기기의 스토어로 바로 간다(아이폰 → App Store, Android → Google Play). 로고도 그 스토어 것이다.
 * - **그 밖(PC·판별 전)**: 어느 스토어 로고도 달지 않는다. 누르면 두 스토어가 작은 메뉴로 펼쳐진다 —
 *   PC 방문자는 어느 폰을 쓰는지 알 수 없어서, 한쪽 로고만 달면 다른 쪽 사용자에게는 "내 폰은 안 되나"로 읽힌다
 *   (피드백 2026-10-02 — "오른쪽 위에 애플만 있다").
 *
 * 메뉴는 `<details>`다(헤더의 모바일 메뉴와 같은 방식) — 스크립트가 늦게 떠도 열리고 닫힌다. 바깥을 누르거나
 * Esc를 누르면 닫히는 것만 스크립트가 보탠다.
 */
export function HeaderStoreLink() {
  const platform = useStorePlatform();
  const directUrl = storeUrlFor(platform);

  if (directUrl) {
    return (
      <a
        href={directUrl}
        className={`btn btnPrimary ${s.cta}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        {platform === "android" ? <GooglePlayLogo /> : <AppleLogo />}
        앱 다운로드
      </a>
    );
  }

  return <StoreMenu />;
}

function StoreMenu() {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = () => ref.current?.removeAttribute("open");
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // 스토어가 새 탭으로 열린 뒤 돌아왔을 때 메뉴가 펼쳐진 채 남지 않게 한다
  const closeAfterClick = () => ref.current?.removeAttribute("open");

  return (
    <details ref={ref} className={s.storeMenu}>
      <summary className={`btn btnPrimary ${s.storeBtn}`}>
        <DownloadIcon />
        앱 다운로드
      </summary>
      <div className={s.storePanel}>
        <a
          href={iosStoreUrl}
          className={s.storeLink}
          target="_blank"
          rel="noopener noreferrer"
          onClick={closeAfterClick}
        >
          <AppleLogo />
          <span>
            App Store
            <small>아이폰</small>
          </span>
        </a>
        <a
          href={androidStoreUrl}
          className={s.storeLink}
          target="_blank"
          rel="noopener noreferrer"
          onClick={closeAfterClick}
        >
          <GooglePlayLogo />
          <span>
            Google Play
            <small>Android</small>
          </span>
        </a>
      </div>
    </details>
  );
}

/** 아래로 내려받는 화살표 — 어느 스토어의 것도 아닌 중립 아이콘. 장식이라 낭독기에는 숨긴다 */
function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1.05em"
      height="1.05em"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={{ flex: "none" }}
    >
      <path
        d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
