"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * 섹션 스크롤 등장 — 아래쪽 섹션이 처음 뷰포트에 들어올 때 **한 번만** 살짝 올라오며 나타난다
 * (랜딩 고급화 3/6, 결정 2026-09-18). 카드·행(`li`)은 짧은 시간차로 뒤따른다(globals.css).
 *
 * 렌더하는 것은 없고 `<html data-reveal>` 표식과 `is-visible` 클래스만 붙인다. 이 컴포넌트가
 * 실행되기 전(JS 꺼짐·크롤러·하이드레이션 전)에는 표식이 없어 **모든 섹션이 그대로 보인다** —
 * 등장 효과 때문에 내용이 숨겨지는 일은 없다.
 *
 * 깜빡임 방지: 표식을 붙이기 **전에** 이미 뷰포트 안에 있는 섹션에 먼저 `is-visible`을 준다.
 * 히어로(#top)·Try(#try)는 첫 화면이라 대상에서 뺀다. `prefers-reduced-motion`이면 아무것도 하지 않는다.
 *
 * 루트 레이아웃에 놓여 페이지를 옮겨도 살아 있으므로 **경로가 바뀔 때마다** 다시 돈다 — 안 그러면
 * 새 페이지의 섹션들이 표식만 남은 채 관찰되지 않아 여백으로 보인다(기능 페이지에서 실제로 그랬다,
 * 2026-09-18). 정리 단계가 표식을 떼므로 다음 페이지가 그려지는 사이에는 내용이 그대로 보인다.
 */
export function ScrollReveal() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("main > section:not(#top):not(#try)"),
    );
    if (sections.length === 0) return;

    // 마운트 시점에 이미 **충분히** 보이는 섹션(위쪽 절반에 머리가 들어온 것)만 바로 보여 준다. 화면 아래쪽에
    // 살짝 걸친 섹션은 남겨 두어 스크롤하며 나타난다 — 세로가 긴 화면(QHD)에서는 첫 화면에 여러 섹션이 걸쳐
    // 있어 전부 미리 보이면 등장 효과가 사라졌다(피드백 2026-09-18)
    const revealLine = window.innerHeight * 0.55;
    for (const section of sections) {
      const rect = section.getBoundingClientRect();
      if (rect.top < revealLine && rect.bottom > 0) section.classList.add("is-visible");
    }
    document.documentElement.setAttribute("data-reveal", "");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      },
      // 섹션 머리가 화면 아래 30% 선을 지나 올라올 때 시작 — 아래 가장자리에 걸친 순간 나타나면
      // "미리 나와 있는" 느낌이고, 너무 늦으면 빈 화면이 보인다
      { threshold: 0, rootMargin: "0px 0px -30% 0px" },
    );
    for (const section of sections) {
      if (!section.classList.contains("is-visible")) observer.observe(section);
    }

    return () => {
      observer.disconnect();
      document.documentElement.removeAttribute("data-reveal");
    };
  }, [pathname]);

  return null;
}
