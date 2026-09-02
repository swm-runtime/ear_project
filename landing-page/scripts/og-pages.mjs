/**
 * 페이지별 공유 미리보기 이미지에 들어갈 문구.
 *
 * 왜 TypeScript 콘텐츠(`src/content/`)에서 가져오지 않는가:
 * 이 목록은 `next build` **이전에**(package.json의 prebuild) 평범한 node로 실행되는
 * 스크립트가 읽는다. 배포 환경(Vercel 등)의 node 버전에 따라 TS를 그대로 import할 수
 * 있는지가 갈리므로, 빌드가 그것에 의존하지 않게 순수 JS로 따로 둔다.
 *
 * `file`은 `src/content/routes.ts`의 `ogImage` 값과 짝이 맞아야 한다.
 * 어긋나도 빌드는 통과하고 이미지 문구만 엉뚱해지므로, 라우트를 추가할 때 여기도 본다.
 *
 * 문구를 고치면 **폰트 서브셋을 다시 만들어야 한다** — `bash scripts/subset-og-fonts.sh`.
 * 서브셋에 없는 글자는 이미지에서 네모(tofu)로 찍힌다.
 */
export const OG_PAGES = [
  {
    file: "home.png",
    line1: "출근길에 열면,",
    line2: "오늘 들을 게 준비되어 있어요",
    foot: ["자기계발 · 커리어 · 교양", "매일 2편, 오디오로 도착하는 AI 팟캐스트"],
  },
  {
    file: "features.png",
    eyebrow: "기능",
    line1: "고르지 않아도,",
    line2: "매일 도착합니다",
    foot: ["드립 · 즉시 재생 · 이어듣기", "듣기까지 걸리는 단계를 없앴습니다"],
  },
  {
    file: "pricing.png",
    eyebrow: "요금제",
    line1: "무료로도 매일 2편,",
    line2: "그대로 도착합니다",
    foot: ["라이트 · 데일리 · 프로", "요금제가 가르는 건 재생 한도뿐입니다"],
  },
  {
    file: "blog.png",
    eyebrow: "블로그",
    line1: "만들면서 정리한",
    line2: "기준들",
    foot: ["오디오 자기계발 서비스를 만드는 이야기"],
  },
  {
    file: "faq.png",
    eyebrow: "자주 묻는 질문",
    line1: "궁금한 것들에",
    line2: "미리 답했습니다",
    foot: ["서비스 · 콘텐츠 · 요금 · 계정"],
  },
  {
    file: "legal.png",
    eyebrow: "정책",
    line1: "이용약관과",
    line2: "개인정보 처리방침",
    foot: ["이어가 정보를 다루는 기준"],
  },
];

/** 서브셋 스크립트가 쓰는 문자 집합. 이미지에 찍히는 모든 글자를 한 줄로 모은다. */
export function ogCharacters() {
  const parts = ["이어"];
  for (const p of OG_PAGES) {
    parts.push(p.eyebrow ?? "", p.line1, p.line2, ...p.foot);
  }
  return parts.join("");
}
