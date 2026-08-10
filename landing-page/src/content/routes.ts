/**
 * 사이트의 페이지 목록과 페이지별 SEO 메타를 한곳에 모은 파일.
 *
 * 페이지가 여러 장으로 갈라지면 같은 값(경로·제목·설명·OG 이미지)이
 * 내비게이션·사이트맵·메타데이터·구조화 데이터 네 곳에 흩어진다.
 * 한 곳만 고치고 나머지를 빠뜨리면 canonical과 실제 링크가 어긋나서
 * 색인이 갈라지므로, 이 파일을 유일한 원본으로 두고 나머지는 전부 여기서 읽는다.
 *
 * 경로에 **끝 슬래시를 붙인다.** `next.config.ts`의 `trailingSlash: true`가
 * 실제로 내보내는 주소가 `/pricing/`이기 때문이다. canonical과 실제 주소가
 * 슬래시 하나로 갈리면 크롤러는 두 페이지로 본다.
 */

export type RouteKey =
  | "home"
  | "features"
  | "pricing"
  | "faq"
  | "blog"
  | "privacy"
  | "terms";

/** 바닥글에서 어느 묶음에 놓일지. null이면 바닥글에 넣지 않는다. */
type FooterGroup = "product" | "resources" | "legal";

export type RouteMeta = {
  /** 끝 슬래시를 포함한 절대 경로. */
  path: string;
  /** 바닥글·breadcrumb에 쓰는 이름. 검색 결과의 경로 표시에도 그대로 나간다. */
  label: string;
  /** 상단 내비게이션에서만 쓰는 더 짧은 이름. 없으면 label을 쓴다. */
  navLabel?: string;
  /**
   * `<title>`에 들어가는 문구. 루트 레이아웃의 template이 뒤에 " | 이어"를 붙이므로
   * 여기에 브랜드명을 다시 쓰지 않는다(홈은 template를 쓰지 않는 default라 예외).
   */
  title: string;
  /** meta description. 검색 결과에 그대로 노출되므로 80~150자 사이로 쓴다. */
  description: string;
  /** 공유 미리보기 이미지. `scripts/og-pages.mjs`가 굽는 파일과 이름이 같아야 한다. */
  ogImage: string;
  /** 상단 내비게이션 노출 여부. */
  inNav: boolean;
  footerGroup: FooterGroup | null;
  /** 사이트맵 우선순위. 홈 1.0을 기준으로 상대값을 준다. */
  priority: number;
  changeFrequency: "daily" | "weekly" | "monthly" | "yearly";
};

export const routes: Record<RouteKey, RouteMeta> = {
  home: {
    path: "/",
    label: "홈",
    title: "이어 — 출근길에 듣는 AI 오디오 자기계발",
    description:
      "관심 주제만 고르면 자기계발·커리어·교양 콘텐츠가 매일 2편씩 오디오로 도착합니다. 무엇을 들을지 고르는 수고 없이, 이어폰만 꽂으면 되는 AI 팟캐스트 서비스 '이어'.",
    ogImage: "/og/home.png",
    inNav: false,
    footerGroup: null,
    priority: 1,
    changeFrequency: "weekly",
  },

  features: {
    path: "/features/",
    label: "기능",
    title: "기능 — 고르지 않아도 매일 도착하는 오디오",
    description:
      "매일 2편이 쌓이는 드립, 대기 없는 즉시 재생, 끊긴 지점부터 이어듣기. 통근길에 오디오 콘텐츠를 듣는 데 실제로 방해가 되는 마찰을 어떻게 걷어냈는지 정리했습니다.",
    ogImage: "/og/features.png",
    inNav: true,
    footerGroup: "product",
    priority: 0.9,
    changeFrequency: "monthly",
  },

  pricing: {
    path: "/pricing/",
    label: "요금제",
    title: "요금제 — 무료로도 매일 2편, 유료는 재생 한도만 넓힙니다",
    description:
      "라이트(무료)·데일리·프로 세 가지 요금제. 매일 도착하는 콘텐츠는 무료 요금제도 똑같이 2편이고, 요금제가 가르는 것은 하루에 재생할 수 있는 분량뿐입니다.",
    ogImage: "/og/pricing.png",
    inNav: true,
    footerGroup: "product",
    priority: 0.9,
    changeFrequency: "monthly",
  },

  blog: {
    path: "/blog/",
    label: "블로그",
    title: "블로그 — 오디오로 듣는 자기계발 이야기",
    description:
      "통근길 청취, AI 오디오 콘텐츠의 신뢰성, 자동 편성(드립)의 설계 원칙까지. 이어를 만들면서 정리한 생각과 기준을 남깁니다.",
    ogImage: "/og/blog.png",
    inNav: true,
    footerGroup: "resources",
    priority: 0.8,
    changeFrequency: "weekly",
  },

  faq: {
    path: "/faq/",
    label: "자주 묻는 질문",
    navLabel: "FAQ",
    title: "자주 묻는 질문",
    description:
      "무료로 어디까지 쓸 수 있는지, AI가 만든 콘텐츠를 믿어도 되는지, 관심 주제를 나중에 바꿀 수 있는지. 이어에 대해 가장 많이 묻는 것들을 모았습니다.",
    ogImage: "/og/faq.png",
    inNav: true,
    footerGroup: "resources",
    priority: 0.8,
    changeFrequency: "monthly",
  },

  privacy: {
    path: "/privacy/",
    label: "개인정보 처리방침",
    title: "개인정보 처리방침",
    description:
      "이어가 수집하는 개인정보 항목과 이용 목적, 보유 기간, 파기 절차, 이용자의 권리와 행사 방법을 안내합니다.",
    ogImage: "/og/legal.png",
    inNav: false,
    footerGroup: "legal",
    priority: 0.3,
    changeFrequency: "yearly",
  },

  terms: {
    path: "/terms/",
    label: "이용약관",
    title: "이용약관",
    description:
      "이어 서비스의 이용 조건과 절차, 구독·결제와 해지, 콘텐츠 저작권, 회사와 이용자의 권리·의무를 정한 약관입니다.",
    ogImage: "/og/legal.png",
    inNav: false,
    footerGroup: "legal",
    priority: 0.3,
    changeFrequency: "yearly",
  },
};

export const routeList: RouteMeta[] = Object.values(routes);

/** 상단 내비게이션. 순서는 사용자가 궁금해하는 순서 — 무엇을/얼마에/왜/그밖에. */
export const navRoutes = routeList.filter((r) => r.inNav);

export const footerGroups: { title: string; items: RouteMeta[] }[] = [
  {
    title: "서비스",
    items: routeList.filter((r) => r.footerGroup === "product"),
  },
  {
    title: "더 보기",
    items: routeList.filter((r) => r.footerGroup === "resources"),
  },
  {
    title: "정책",
    items: routeList.filter((r) => r.footerGroup === "legal"),
  },
];

/** 블로그 글의 경로. 목록·사이트맵·구조화 데이터가 같은 규칙을 쓰게 한다. */
export function postPath(slug: string): string {
  return `${routes.blog.path}${slug}/`;
}
