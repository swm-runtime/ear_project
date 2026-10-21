"use client";

import { useSyncExternalStore } from "react";
import s from "./page.module.css";

/**
 * 공유 링크(`/contents/:id`)로 도착한 방문자를 **앱으로 넘긴다.**
 *
 * 원래 이 페이지는 "앱 미설치자만 오는 곳"이었다. 그런데 **카카오톡은 링크를 인앱
 * 브라우저로 열고, 인앱 브라우저는 유니버설 링크·App Links 검증을 타지 않는다** — 앱이
 * 설치돼 있어도 앱으로 넘어가지 않고 여기 도착한다. 공유의 주 경로가 카톡이라
 * 그대로 두면 실제 도달률이 낮다
 * (`docs/tickets/frontend/pending/share-link-in-app-browser-escape.md`).
 *
 * 그래서 두 가지 탈출구를 준다.
 *
 * | 버튼 | 하는 일 | 언제 |
 * |---|---|---|
 * | 앱에서 열기 | `ear://contents/:id` — 커스텀 스킴은 인앱 브라우저에서도 대개 동작한다 | 항상 |
 * | 다른 브라우저로 열기 | `kakaotalk://web/openExternal` — 외부 브라우저로 나가면 유니버설 링크가 정상 동작한다 | 카톡 인앱 브라우저에서만 |
 *
 * **앱이 없으면 아무 일도 일어나지 않는다.** 커스텀 스킴은 처리할 앱이 없으면 무시되며,
 * 그 경우 아래 스토어 안내가 원래 역할을 한다.
 */

/** `/contents/<id>` 에서 id를 꺼낸다. 서버 파라미터가 아니라 주소에서 읽는다 —
 *  `vercel.json` 의 rewrite 가 모든 `/contents/:id` 를 이 정적 페이지 하나로 보내기 때문이다. */
const contentIdFromPath = (pathname: string): string | null => {
  const match = /^\/contents\/([^/?#]+)/.exec(pathname);
  return match ? match[1] : null;
};

const isKakaoInAppBrowser = (ua: string): boolean => /KAKAOTALK/i.test(ua);

/**
 * 브라우저에서만 읽을 수 있는 값을 SSR 안전하게 가져온다. `useEffect` + `setState` 로
 * 하면 렌더 직후 상태를 바꾸는 형태가 되어 규칙에 걸리고(react-hooks/set-state-in-effect),
 * 서버 렌더에서는 어차피 빈 값이어야 한다 — 구독 없는 외부 스토어로 다룬다.
 */
const noSubscribe = () => () => {};

export function OpenInApp() {
  const pathname = useSyncExternalStore(
    noSubscribe,
    () => window.location.pathname,
    () => "",
  );
  const userAgent = useSyncExternalStore(
    noSubscribe,
    () => navigator.userAgent,
    () => "",
  );
  const contentId = contentIdFromPath(pathname);
  const isKakao = isKakaoInAppBrowser(userAgent);

  // 주소에서 id를 못 읽으면(예: /contents 직접 방문) 링크를 만들 수 없다 — 버튼을 그리지 않는다
  if (contentId === null) return null;

  const openApp = () => {
    window.location.href = `ear://contents/${encodeURIComponent(contentId)}`;
  };

  /** 카톡 인앱 브라우저를 벗어난다 — 외부 브라우저에서는 유니버설 링크가 걸린다 */
  const openExternal = () => {
    const here = window.location.href;
    window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(here)}`;
  };

  return (
    <div className={s.actions}>
      <button type="button" className="btn btnPrimary" onClick={openApp}>
        앱에서 열기
      </button>
      {isKakao ? (
        <button type="button" className="btn" onClick={openExternal}>
          다른 브라우저로 열기
        </button>
      ) : null}
    </div>
  );
}
