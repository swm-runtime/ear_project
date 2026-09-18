/**
 * API에서 오는 동적 텍스트(콘텐츠 제목·출처)용 웹폰트.
 *
 * 이 사이트의 웹폰트는 빌드 시점에 쓰인 글자만 남긴 서브셋이라(`scripts/subset-fonts.sh`), 빌드 뒤에
 * 서버에서 내려오는 글자는 서브셋에 없어 시스템 글꼴로 떨어지고 한 문장 안에서 서체가 섞인다.
 * 그 자리에는 Pretendard의 **동적 서브셋**(글자 구간별로 쪼개진 100여 개 woff2 + unicode-range CSS)을
 * 쓴다 — 브라우저가 실제로 그리는 구간의 파일만 받아 오므로 전체 폰트(1.7MB)를 받지 않는다.
 *
 * 전역 CSS에 넣지 않고 **필요해질 때 한 번** 링크를 꽂는다. 첫 화면에는 동적 텍스트가 없어
 * 53KB CSS를 초기 로드에 얹을 이유가 없다(결정 2026-09-18 — 랜딩 고급화 5/6).
 * 가족명은 "Pretendard Variable"이라 서브셋 "Pretendard"와 겹치지 않는다.
 */
const DYNAMIC_FONT_HREF =
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css";
const LINK_ID = "dynamic-font-pretendard";

export function ensureDynamicFont(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(LINK_ID)) return;
  const link = document.createElement("link");
  link.id = LINK_ID;
  link.rel = "stylesheet";
  link.href = DYNAMIC_FONT_HREF;
  link.crossOrigin = "anonymous";
  document.head.appendChild(link);
}
