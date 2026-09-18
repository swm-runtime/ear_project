"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import s from "./FinalCta.module.css";

/** 버튼 중심에서 이 거리(px)까지 가까워지는 만큼 빛이 강해진다 */
const REACH_PX = 460;

/**
 * 하단 CTA 패널의 포인터 반응(랜딩 고급화 — 2026-09-18, 사용자 아이디어).
 *
 * 포인터가 패널 안에서 **[출시 소식 받기] 버튼에 가까워질수록 빛이 강해지고**, 버튼 위에 올리면 버튼이
 * 그 빛을 받아 떠오르며, 멀어지면 다시 잦아든다. 빛의 위치는 포인터를 따라간다.
 * 값은 CSS 변수(`--gx`·`--gy` 위치, `--glow` 0~1 세기)로만 넘기고 그리기는 CSS가 한다 — 리렌더 없음.
 *
 * 마우스가 있는 환경에서만(`hover: hover` + `pointer: fine`), reduced-motion이면 켜지 않는다.
 * 꺼진 상태에서는 종전의 고정 빛(우상단)이 그대로 보인다.
 */
export function CtaPanel({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let pending: PointerEvent | null = null;
    const apply = () => {
      frame = 0;
      const event = pending;
      if (!event) return;
      const rect = el.getBoundingClientRect();
      const button = el.querySelector<HTMLElement>("[data-cta]");
      const bx = button ? button.getBoundingClientRect() : rect;
      const cx = bx.left + bx.width / 2;
      const cy = bx.top + bx.height / 2;
      const dist = Math.hypot(event.clientX - cx, event.clientY - cy);
      // 가까울수록 1. 끝을 부드럽게(ease-out) — 멀리서부터 서서히 밝아진다
      const raw = Math.max(0, 1 - dist / REACH_PX);
      const glow = 1 - Math.pow(1 - raw, 2);
      el.style.setProperty("--gx", `${(((event.clientX - rect.left) / rect.width) * 100).toFixed(1)}%`);
      el.style.setProperty("--gy", `${(((event.clientY - rect.top) / rect.height) * 100).toFixed(1)}%`);
      el.style.setProperty("--glow", glow.toFixed(3));
    };
    const onMove = (event: PointerEvent) => {
      pending = event;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onEnter = () => el.classList.add(s.tracking);
    const onLeave = () => {
      pending = null;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      el.style.setProperty("--glow", "0");
      el.classList.remove(s.tracking);
    };

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
