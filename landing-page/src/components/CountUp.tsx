"use client";

import { useEffect, useRef, useState } from "react";

/** 숫자 토큰(연속 숫자)과 그 사이 글자로 쪼갠다. "10~15분" → ["10", "~", "15", "분"] */
function tokenize(value: string): string[] {
  return value.split(/(\d+)/).filter((part) => part !== "");
}

const DURATION_MS = 800;
/** 0이 목표면 0에서 0으로 셀 게 없다 — 5에서 0으로 내려가는 쪽이 "기다림 0초"에 어울린다 */
const COUNTDOWN_FROM = 5;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * 숫자 카운트업 — 문자열 속 숫자만 0에서 목표값까지 짧게 올라간다(랜딩 고급화 4/6, 2026-09-18).
 *
 * - 서버 렌더는 **최종값 그대로**다. JS가 없거나 하이드레이션 전에는 값이 그대로 보인다.
 * - 마운트 시점에 이미 화면 안에 있으면 세지 않는다 — 보이던 값이 0으로 튀었다가 다시 올라오면
 *   효과가 아니라 깜빡임이다. 스크롤해서 들어올 때만 한 번 센다.
 * - `prefers-reduced-motion`이면 세지 않는다.
 * - 숫자 폭이 흔들리지 않게 `tabular-nums`를 건다.
 */
export function CountUp({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const tokens = tokenize(value);
  const [shown, setShown] = useState<string[]>(tokens);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) return; // 이미 보이는 값은 건드리지 않는다

    let frame = 0;
    const targets = tokens.map((t) => (/^\d+$/.test(t) ? Number(t) : null));

    const run = () => {
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / DURATION_MS);
        const e = easeOutCubic(p);
        setShown(
          tokens.map((t, i) => {
            const target = targets[i];
            if (target === null) return t;
            const from = target === 0 ? COUNTDOWN_FROM : 0;
            return String(Math.round(from + (target - from) * e));
          }),
        );
        if (p < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        run();
      },
      { threshold: 0.6 },
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
    // tokens는 value에서 파생된 값이라 value만 본다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span ref={ref} style={{ fontVariantNumeric: "tabular-nums" }}>
      {shown.join("")}
    </span>
  );
}
