"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/** 최대 기울기(도). 너무 크면 장난감처럼 보이고, 너무 작으면 알아채지 못한다 */
const MAX_TILT_DEG = 7;

/**
 * 히어로 폰 목업의 마우스 시차 기울기(랜딩 고급화 — 2026-09-18).
 *
 * 포인터가 목업 위를 지나면 그 위치에 따라 폰이 살짝 3D로 기울고, 벗어나면 제자리로 돌아온다.
 * 값은 CSS 변수(`--rx`·`--ry`)로만 넘기고 실제 변환·전환은 Hero.module.css의 `.phone`이 맡는다 —
 * React 렌더 없이 `style.setProperty`로 프레임마다 갱신한다.
 *
 * - **마우스가 있는 환경에서만** 켠다(`hover: hover` + `pointer: fine`). 터치에서는 손가락이 화면을
 *   가리는 동안만 기울어져 어색하다.
 * - `prefers-reduced-motion`이면 켜지 않는다.
 * - 자식(서버가 그린 폰 마크업)은 그대로 통과시킨다.
 */
export function PhoneTilt({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let next: { rx: number; ry: number } | null = null;
    const apply = () => {
      frame = 0;
      if (!next) return;
      el.style.setProperty("--rx", `${next.rx.toFixed(2)}deg`);
      el.style.setProperty("--ry", `${next.ry.toFixed(2)}deg`);
    };
    const onMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      // -1 ~ 1. 가운데가 0. 위로 올리면 폰 윗부분이 뒤로 눕고, 오른쪽으로 가면 오른쪽이 뒤로 눕는다
      const px = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const py = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      next = { rx: -py * MAX_TILT_DEG, ry: px * MAX_TILT_DEG };
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      next = null;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
      el.classList.add("is-resting");
    };
    const onEnter = () => el.classList.remove("is-resting");

    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
