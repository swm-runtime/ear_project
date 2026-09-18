"use client";

import { useEffect, useRef } from "react";
import { sources } from "@/content/site";
import { LogoMark } from "./Logo";
import { Sentences } from "./Sentences";
import s from "./Sources.module.css";

/** 위쪽 워드마크 띠에서 아래 한 점으로 모이는 선의 시작 x(viewBox 1200 기준). 6줄 */
const LINE_STARTS = [90, 300, 500, 700, 900, 1110];
const VIEW_W = 1200;
const VIEW_H = 220;
/**
 * 선을 타고 내려오는 대표 자료 5개 — 원형 배지(사용자 요청 2026-09-18: 글자 칩이 아니라 로고를 원형으로).
 * 실제 로고 그림은 상표 사용 허락 문제로 쓰지 않는다(site.ts sources 주석) — 대신 각 매체의 이름 첫 글자·약칭을
 * 브랜드 색 원 위에 얹어 "로고처럼" 보이게 한다. `line`은 어느 줄기를 타는지(LINE_STARTS 인덱스).
 */
const TRAVELERS: { name: string; mark: string; color: string; size: number; line: number; style: string }[] = [
  { name: "MIT McGovern Institute", mark: "MIT", color: "#a31f34", size: 13, line: 0, style: "sans" },
  { name: "The New York Times Magazine", mark: "T", color: "#121212", size: 26, line: 1, style: "serif" },
  { name: "arXiv", mark: "arXiv", color: "#b31b1b", size: 12, line: 2, style: "mono" },
  { name: "toss tech", mark: "toss", color: "#0064ff", size: 13, line: 4, style: "sans" },
  { name: "Harvard Business Review", mark: "HBR", color: "#c8102e", size: 14, line: 5, style: "serif" },
];
/** 이어 마크 원(.nodeMark 56px)의 중심은 선 끝보다 이만큼 아래다 — 배지가 마지막에 그 중심까지 내려와 스며든다 */
const NODE_CENTER_DY = 28;
/** 핀 모드가 켜지는 최소 화면. 좁거나 낮은 화면에서는 고정 없이 종전처럼 스크롤 등장만 한다 */
const PIN_MEDIA = "(min-width: 900px) and (min-height: 720px)";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** 구간 [a, b] 안에서 0→1 */
const phase = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/**
 * Sources 섹션 — 히어로 아래, TRY 위(2026-09-18, UIUX 멘토 피드백: "팟캐스트로는 못 듣던 자료"가 강점).
 *
 * 넓은 화면에서는 **스크롤 고정 장면**이다(사용자 아이디어 2026-09-18). 섹션에 닿으면 화면이 잠깐 멈춘 듯
 * 고정되고(`position: sticky` + 키 큰 무대), 그 사이 스크롤 양이 진행값 `--p`(0→1)가 된다:
 *   선이 그려진다(0~0.15) → 대표 자료 5개가 선을 타고 내려와(0.1~0.72) 이어 마크에 닿으며 작아져 스며든다
 *   → 마크가 한 번 부풀며 받는다(0.7~0.85) → 캡션과 꼬리선이 나타나고(0.8~1) 고정이 풀려 TRY로 이어진다.
 * 자료 칩의 위치는 실제 SVG 선(`getPointAtLength`)에서 읽어 어느 화면 폭에서도 선 위를 정확히 탄다.
 *
 * 좁은·낮은 화면과 reduced-motion에서는 고정하지 않고 종전 스크롤 등장(ScrollReveal의 .is-visible)만 쓴다.
 * 로고 이미지는 쓰지 않는다 — 워드마크 글자만(site.ts sources 주석).
 */
export function Sources() {
  const stageRef = useRef<HTMLElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const chipRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const row = [...sources.items, ...sources.items];

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const media = window.matchMedia(PIN_MEDIA);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    // 개발 중 확인용 — `?sources=0.5` 로 진행값을 고정한다. 프로덕션 번들에서는 사라진다
    const forced =
      process.env.NODE_ENV !== "production"
        ? Number(new URLSearchParams(window.location.search).get("sources"))
        : NaN;

    // 진행값을 고정해 볼 때는 고정(sticky)을 풀고 다른 섹션을 숨겨 이 장면만 자연 위치에 그린다 —
    // 스크롤 없이 한 장면을 캡처하기 위해(개발 확인용, 프로덕션 번들에서는 사라진다)
    if (Number.isFinite(forced) && forced > 0) {
      stage.style.height = "auto";
      stage.classList.add("is-visible");
      const pin = stage.firstElementChild as HTMLElement | null;
      if (pin) {
        pin.style.position = "static";
        pin.style.height = "auto";
      }
      document.querySelectorAll<HTMLElement>("main > section:not(#sources)").forEach((el) => {
        el.style.display = "none";
      });
    }

    let frame = 0;
    let lengths: number[] = [];

    const placeChips = (p: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const sx = rect.width / VIEW_W;
      const sy = rect.height / VIEW_H;
      const travel = easeInOut(phase(p, 0.1, 0.72));
      // 선 끝(모이는 점)을 지나 마크 원의 중심까지 곧게 더 내려온다 — 그 사이 작아지며 스며든다
      const sink = phase(travel, 0.86, 1);
      const fade = phase(p, 0.66, 0.78);
      TRAVELERS.forEach((t, i) => {
        const path = pathRefs.current[t.line];
        const chip = chipRefs.current[i];
        if (!path || !chip) return;
        if (!lengths[t.line]) lengths[t.line] = path.getTotalLength();
        const pt = path.getPointAtLength(travel * lengths[t.line]);
        const y = pt.y * sy + NODE_CENTER_DY * sink;
        const scale = 1 - 0.7 * fade;
        chip.style.transform = `translate(${(pt.x * sx).toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
        chip.style.opacity = String(phase(p, 0.05, 0.12) * (1 - fade));
      });
    };

    const update = () => {
      frame = 0;
      if (!media.matches) return;
      let p: number;
      if (Number.isFinite(forced) && forced > 0) {
        p = clamp01(forced);
      } else {
        const rect = stage.getBoundingClientRect();
        const scrollable = rect.height - window.innerHeight;
        p = scrollable > 0 ? clamp01(-rect.top / scrollable) : 1;
      }
      stage.style.setProperty("--p", p.toFixed(4));
      placeChips(p);
    };
    const request = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    // 핀 모드는 React 상태가 아니라 클래스로 직접 켠다 — className을 React가 다시 쓰면 ScrollReveal이 붙인
    // `is-visible`이 지워져 섹션이 영영 투명하게 남았다(2026-09-18 실제로 그랬다)
    const applyMode = () => {
      stage.classList.toggle(s.pinned, media.matches);
      lengths = [];
      request();
    };

    applyMode();
    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", applyMode);
    media.addEventListener("change", applyMode);
    return () => {
      window.removeEventListener("scroll", request);
      window.removeEventListener("resize", applyMode);
      media.removeEventListener("change", applyMode);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section id="sources" ref={stageRef} className={s.stage}>
      <div className={s.pin}>
        <div className="container">
          <p className="eyebrow">{sources.eyebrow}</p>
          <h2 className="sectionTitle">{sources.title}</h2>
          <p className="sectionLede">
            <Sentences text={sources.lede} />
          </p>
        </div>

        {/* 워드마크 띠 — 컨테이너 밖까지 흐른다. 반복 목록이라 보조기기에는 첫 목록만 읽힌다 */}
        <div className={s.band}>
          <ul className={`${s.row} ${s.rowA}`} aria-label="참고하는 자료">
            {row.map((item, i) => (
              <li
                key={`${item.name}-${i}`}
                className={`${s.mark} ${s[`mark_${item.style}`]}`}
                aria-hidden={i >= sources.items.length || undefined}
              >
                {item.name}
              </li>
            ))}
          </ul>
          <ul className={`${s.row} ${s.rowB}`} aria-hidden="true">
            {[...row].reverse().map((item, i) => (
              <li key={`${item.name}-${i}`} className={`${s.mark} ${s[`mark_${item.style}`]}`}>
                {item.name}
              </li>
            ))}
          </ul>
        </div>

        {/* 모이는 선 — 여섯 줄기가 가운데 한 점으로. 그 점 아래 이어 마크와 캡션, 다시 한 줄기가 TRY로 */}
        <div className={`container ${s.funnelWrap}`}>
          <svg
            ref={svgRef}
            className={s.funnel}
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {LINE_STARTS.map((x, i) => (
              <path
                key={x}
                ref={(el) => {
                  pathRefs.current[i] = el;
                }}
                className={s.line}
                style={{ animationDelay: `${0.12 * i}s` }}
                pathLength={100}
                d={`M${x} 0 C ${x} 120, 600 90, 600 ${VIEW_H}`}
              />
            ))}
          </svg>

          {/* 선을 타고 내려오는 대표 자료(원형 배지) — 핀 모드에서만 보인다. 위치는 스크립트가 선에서 읽어 놓는다 */}
          <div className={s.travelers} aria-hidden="true">
            {TRAVELERS.map((t, i) => (
              <span
                key={t.name}
                ref={(el) => {
                  chipRefs.current[i] = el;
                }}
                className={`${s.badge} ${s[`badge_${t.style}`]}`}
                style={{ "--brand": t.color, "--fs": `${t.size}px` } as React.CSSProperties}
                title={t.name}
              >
                {t.mark}
              </span>
            ))}
          </div>

          <div className={s.node}>
            <span className={s.nodeMark}>
              <span className={s.nodeRing} aria-hidden="true" />
              <LogoMark className={s.nodeLogo} />
            </span>
            <p className={s.caption}>{sources.caption}</p>
          </div>

          <span className={s.tail} aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
