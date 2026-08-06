/**
 * 기능 카드용 아이콘. 외부 아이콘 패키지를 쓰지 않는 이유는 정적 페이지에
 * 런타임 의존성을 늘리지 않기 위해서다. 전부 24×24 선 아이콘으로 통일한다.
 */
const common: React.SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: "false",
};

export const icons = {
  /** 드립 — 위에서 떨어져 쌓이는 물방울 */
  drip: (
    <svg {...common}>
      <path d="M12 3c2.6 3 4 5.2 4 7a4 4 0 1 1-8 0c0-1.8 1.4-4 4-7Z" />
      <path d="M4 19h16" />
      <path d="M7 22h10" />
    </svg>
  ),
  /** 즉시 재생 — 번개 */
  bolt: (
    <svg {...common}>
      <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" />
    </svg>
  ),
  /** 이어듣기 — 되감아 이어지는 화살표 */
  resume: (
    <svg {...common}>
      <path d="M3 12a9 9 0 1 0 2.6-6.4" />
      <path d="M3 4v5h5" />
      <path d="M12 8v4.4l3 1.8" />
    </svg>
  ),
  /** 탐색 — 나침반 */
  compass: (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.4 8.6-2 4.8-4.8 2 2-4.8 4.8-2Z" />
    </svg>
  ),
  /** 검수 — 확인 표시가 든 방패 */
  shield: (
    <svg {...common}>
      <path d="M12 3l7 3v5.5c0 4.3-2.9 8.2-7 9.5-4.1-1.3-7-5.2-7-9.5V6l7-3Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </svg>
  ),
  /** 출처 고지 — 인용부호 */
  quote: (
    <svg {...common}>
      <path d="M9.5 6C7 7.3 5.5 9.6 5.5 12.4V18h5.2v-5.6H8.1c0-1.9.6-3.4 2.3-4.4L9.5 6Z" />
      <path d="M18 6c-2.5 1.3-4 3.6-4 6.4V18h5.2v-5.6h-2.6c0-1.9.6-3.4 2.3-4.4L18 6Z" />
    </svg>
  ),
} as const;

export type IconName = keyof typeof icons;
