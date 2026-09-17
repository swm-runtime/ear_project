"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import s from "./Hero.module.css";

type Track = { title: string; meta: string; min: number; cover: string };

/**
 * 장면 순서와 길이(ms). 탐색 화면(정지) → 카드 탭 → 플레이어가 올라옴 → 내려가며 미니플레이어가 남음 → 처음으로.
 * 한 바퀴 약 13초. 너무 빠르면 "광고 영상"처럼 읽히고, 너무 느리면 정지 화면과 구분되지 않는다.
 */
const SCENES = [
  { name: "idle", ms: 2800 },
  { name: "tap", ms: 700 },
  { name: "player", ms: 5600 },
  { name: "mini", ms: 3400 },
] as const;
type SceneName = (typeof SCENES)[number]["name"];

const COVER_PX = 420;

/**
 * 히어로 폰 목업을 살아 움직이게 하는 덧씌움 층(랜딩 고급화 — 결정 2026-09-18).
 *
 * 아래에 깔린 탐색 화면(Hero.tsx AppPreview)은 서버가 그린 정적 마크업 그대로다. 이 컴포넌트는 그
 * 위에 `position: absolute`로 얹혀 **실제 앱의 흐름**을 짧게 반복한다: 카드를 탭하면 플레이어가
 * 올라오고, 내려가면 하단에 미니플레이어가 남는다(앱 규칙 — 활성 세션이 있을 때만 미니플레이어).
 *
 * - 뷰포트 밖에 있으면 멈춘다(IntersectionObserver). 히어로는 첫 화면이라 대부분 보이지만,
 *   스크롤해 내려간 뒤에도 타이머가 돌 이유는 없다.
 * - `prefers-reduced-motion`이면 아무것도 그리지 않는다 — 정적 목업이 그대로 보인다.
 * - 순수 장식이다. 부모(`.phone`)가 이미 `aria-hidden`이라 보조기기에는 닿지 않는다.
 */
export function HeroPhoneScene({ track }: { track: Track }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<SceneName | null>(null);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsActive(entry.isIntersecting),
      { threshold: 0.3 },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // 개발 중 확인용 — `?scene=player` 처럼 장면을 고정한다. 프로덕션 번들에서는 이 분기가 사라진다
    if (process.env.NODE_ENV !== "production") {
      const forced = new URLSearchParams(window.location.search).get("scene");
      if (forced && SCENES.some((item) => item.name === forced)) {
        const pin = window.setTimeout(() => setScene(forced as SceneName), 0);
        return () => window.clearTimeout(pin);
      }
    }
    if (!isActive) {
      // 화면 밖으로 나가면 처음 장면으로 되돌린다 — 돌아왔을 때 어색한 중간 장면에서 시작하지 않게
      const reset = window.setTimeout(() => setScene(null), 0);
      return () => window.clearTimeout(reset);
    }
    // 첫 바퀴는 정지 장면을 건너뛰고 바로 탭부터 — 페이지를 열자마자 움직임이 보여야 한다(피드백 2026-09-18).
    // 이후 바퀴에서는 idle(2.8s)이 미니플레이어와 다음 탭 사이의 숨 고르기가 된다
    let index = 1;
    let timer = window.setTimeout(step, 1000);
    function step() {
      const current = SCENES[index];
      setScene(current.name);
      index = (index + 1) % SCENES.length;
      timer = window.setTimeout(step, current.ms);
    }
    return () => window.clearTimeout(timer);
  }, [isActive]);

  const showPlayer = scene === "player";
  const showMini = scene === "mini";

  return (
    <div ref={rootRef} className={s.scene}>
      {/* 탭 파문 — 인기 카드 위. 실제 손가락 자리라기보다 "여기를 눌렀다"는 신호다 */}
      <span className={`${s.tapRipple} ${scene === "tap" ? s.tapRippleOn : ""}`} />

      {/* 플레이어 화면 — 실제 앱 PlayerScreen의 구성·치수를 그대로 옮겼다(1em = 앱 1pt).
          앱바(셰브론 · 타이머 · 더보기) / 아트워크 / 제목 · 카테고리 / 시크바 · 시간 /
          배속 · 10초 뒤로 · 재생 · 10초 앞으로 · 스크립트 / 재생 목록 손잡이 */}
      <div className={`${s.playerScene} ${showPlayer ? s.playerSceneIn : ""}`}>
        <div className={s.pAppBar}>
          <svg className={s.pIcon} viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className={s.pAppBarActions}>
            <svg className={`${s.pIcon} ${s.pIconDisabled}`} viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14.5 3.5a8.5 8.5 0 1 0 6 14.5 7 7 0 0 1-6-14.5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
            <svg className={s.pIcon} viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="5.5" cy="12" r="1.8" fill="currentColor" />
              <circle cx="12" cy="12" r="1.8" fill="currentColor" />
              <circle cx="18.5" cy="12" r="1.8" fill="currentColor" />
            </svg>
          </span>
        </div>

        <div className={s.pHero}>
          <Image className={s.pArt} src={track.cover} alt="" width={COVER_PX} height={COVER_PX} />
        </div>

        <div className={s.pMeta}>
          <span className={s.pTitle}>{track.title}</span>
          <span className={s.pCategory}>커리어</span>
        </div>

        <div className={s.pSeek}>
          <span className={s.pSeekTrack}>
            <span className={s.pSeekFill} />
            <span className={s.pSeekThumb} />
          </span>
          <span className={s.pTimes}>
            <span>0:00</span>
            <span>{track.min}:00</span>
          </span>
        </div>

        <div className={s.pControls}>
          <span className={s.pRate}>1.0×</span>
          <span className={s.pStep}>
            <SeekGlyph mirrored={false} />
          </span>
          <span className={s.pPlay}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path fill="currentColor" d="M7.5 5h3.2v14H7.5zM13.3 5h3.2v14h-3.2z" />
            </svg>
          </span>
          <span className={s.pStep}>
            <SeekGlyph mirrored />
          </span>
          <span className={s.pScript}>
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
              <path d="M6 4.5h7.5a2.5 2.5 0 0 1 2.5 2.5v3a2.5 2.5 0 0 1-2.5 2.5H8.5l-2.5 3v-3H6a2.5 2.5 0 0 1-2.5-2.5V7A2.5 2.5 0 0 1 6 4.5z" />
              <path d="M16 9h2a2.5 2.5 0 0 1 2.5 2.5v3a2.5 2.5 0 0 1-2.5 2.5h-1.5v3l-3-3H13a1.5 1.5 0 0 1-1.5-1.5v-3" />
            </svg>
          </span>
        </div>

        <div className={s.pHandle}>
          <span className={s.pHandleBar} />
          <span className={s.pHandleLabel}>재생 목록</span>
        </div>
      </div>

      {/* 미니플레이어 — 실제 앱 MiniPlayer 그대로: 탭바 바로 위 전폭, 표면색 바탕, 상단 2pt 진행선,
          44pt 썸네일 · 제목 한 줄 · 일시정지 */}
      <div className={`${s.miniScene} ${showMini ? s.miniSceneIn : ""}`}>
        <span className={s.mTrack}>
          <span className={s.mFill} />
        </span>
        <span className={s.mRow}>
          <Image className={s.mCover} src={track.cover} alt="" width={COVER_PX} height={COVER_PX} />
          <span className={s.mTitle}>{track.title}</span>
          <svg className={s.mPause} viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M7.5 5h3.2v14H7.5zM13.3 5h3.2v14h-3.2z" />
          </svg>
        </span>
      </div>
    </div>
  );
}

/** 앱 PlayerIcons의 SeekBack/SeekForward — 왼쪽이 트인 화살표 원호 + "10". 앞으로는 좌우 반전 */
function SeekGlyph({ mirrored }: { mirrored: boolean }) {
  const flip = mirrored ? "translate(24 0) scale(-1 1)" : undefined;
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5.99 5.99A8.5 8.5 0 1 1 4.64 16.25" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" transform={flip} />
      <path d="M4.25 7.75L7.95 7.35L4.63 4.03Z" fill="currentColor" transform={flip} />
      <text x="12" y="15.4" textAnchor="middle" fontSize="9.6" fontWeight="700" fill="currentColor" fontFamily="var(--sans)">
        10
      </text>
    </svg>
  );
}
