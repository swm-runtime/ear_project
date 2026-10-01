import s from "./Hero.module.css";

/**
 * 히어로 폰 목업의 아이폰 상태바 — 시각과 신호·와이파이·배터리.
 *
 * 탐색 화면(밝은 바탕)과 플레이어(어두운 바탕) 두 곳이 쓴다. 앱도 플레이어가 떠 있는 동안
 * 상태바 글자를 밝게 바꾼다(PlayerScreen `StatusBar style="light"`).
 * 다이내믹 아일랜드는 화면마다 그리지 않고 Hero.tsx가 맨 위 층에 하나만 둔다.
 */
export function PhoneStatusBar({ tone = "dark" }: { tone?: "dark" | "light" }) {
  return (
    <div className={`${s.statusBar} ${tone === "light" ? s.statusBarLight : ""}`}>
      <span className={s.statusTime}>9:41</span>
      <span className={s.statusIcons}>
        <svg viewBox="0 0 18 12" className={s.statusSignal}>
          <rect x="0" y="8" width="3" height="4" rx="1" fill="currentColor" />
          <rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="currentColor" />
          <rect x="10" y="3" width="3" height="9" rx="1" fill="currentColor" />
          <rect x="15" y="0.5" width="3" height="11.5" rx="1" fill="currentColor" />
        </svg>
        <svg viewBox="0 0 16 12" className={s.statusWifi}>
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            d="M1.2 4.1a10 10 0 0 1 13.6 0M3.7 7a6.4 6.4 0 0 1 8.6 0"
          />
          <path fill="currentColor" d="M8 11.4a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z" />
        </svg>
        <svg viewBox="0 0 26 12" className={s.statusBattery}>
          <rect
            x="0.6"
            y="0.6"
            width="22"
            height="10.8"
            rx="3"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.4"
            strokeWidth="1.2"
          />
          <rect x="2.4" y="2.4" width="14" height="7.2" rx="1.8" fill="currentColor" />
          <path
            fill="currentColor"
            fillOpacity="0.4"
            d="M24.2 4.2c1 .4 1.5 1.1 1.5 1.8s-.5 1.4-1.5 1.8z"
          />
        </svg>
      </span>
    </div>
  );
}
