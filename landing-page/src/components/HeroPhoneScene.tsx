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

const WAVE_BARS = 28;
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
    if (!isActive) {
      // 화면 밖으로 나가면 처음 장면으로 되돌린다 — 돌아왔을 때 어색한 중간 장면에서 시작하지 않게
      const reset = window.setTimeout(() => setScene(null), 0);
      return () => window.clearTimeout(reset);
    }
    let index = 0;
    let timer = window.setTimeout(step, 400);
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

      {/* 플레이어 화면 — 앱 플레이어 구성(player-uiux.md 4.1)을 축소해 옮겼다 */}
      <div className={`${s.playerScene} ${showPlayer ? s.playerSceneIn : ""}`}>
        <div className={s.pAppBar}>
          <span className={s.pChevron} />
          <span className={s.pMore}>⋯</span>
        </div>
        <Image className={s.pArt} src={track.cover} alt="" width={COVER_PX} height={COVER_PX} />
        <span className={s.pTitle}>{track.title}</span>
        <span className={s.pMeta}>{track.meta}</span>
        <span className={s.pSource}>원문 보기 ↗</span>

        <div className={s.pWave}>
          {Array.from({ length: WAVE_BARS }, (_, i) => {
            const t = i / (WAVE_BARS - 1);
            const h = 0.25 + 0.7 * Math.sin(Math.PI * t) * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.9)));
            return (
              <span
                key={i}
                className={s.pWaveBar}
                style={{
                  ["--h" as string]: h.toFixed(3),
                  animationDuration: `${(0.8 + ((i * 37) % 6) * 0.1).toFixed(2)}s`,
                  animationDelay: `${(-(((i * 53) % 11) / 11) * 1.2).toFixed(2)}s`,
                }}
              />
            );
          })}
        </div>

        <div className={s.pSeek}>
          <span className={s.pSeekFill} />
        </div>
        <div className={s.pTimes}>
          <span>0:00</span>
          <span>-{track.min}:00</span>
        </div>

        <div className={s.pControls}>
          <span className={s.pSkip}>10</span>
          <span className={s.pPlay}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path fill="currentColor" d="M7.5 5h3.2v14H7.5zM13.3 5h3.2v14h-3.2z" />
            </svg>
          </span>
          <span className={s.pSkip}>10</span>
        </div>
        <span className={s.pRate}>1.0×</span>
      </div>

      {/* 미니플레이어 — 탭바 바로 위. 앱과 같은 문법(커버·제목·일시정지·상단 진행선) */}
      <div className={`${s.miniScene} ${showMini ? s.miniSceneIn : ""}`}>
        <span className={s.mProgress} />
        <Image className={s.mCover} src={track.cover} alt="" width={COVER_PX} height={COVER_PX} />
        <span className={s.mTitle}>{track.title}</span>
        <svg className={s.mPause} viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M7.5 5h3.2v14H7.5zM13.3 5h3.2v14h-3.2z" />
        </svg>
      </div>
    </div>
  );
}
