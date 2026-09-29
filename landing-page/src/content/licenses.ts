import type { Block } from "./prose";

/**
 * 오픈소스 라이선스 — 앱이 코드에 직접 옮겨 넣은 제3자 저작물의 고지.
 *
 * CC BY 4.0 저작물은 **저작자 · 라이선스 링크 · 변경 여부**를 밝혀야 한다. 앱 안에는 고지 화면을 두지 않고
 * 설정의 [오픈소스 라이선스] 행이 이 페이지를 연다(PM 2026-09-30 "랜딩 웹페이지 링크로").
 * 원본 기록은 저장소 `frontend/THIRD_PARTY_NOTICES.md` — 항목을 늘리면 두 곳을 함께 고친다.
 */
export const licensesBlocks: Block[] = [
  {
    type: "p",
    text: "이어 앱이 사용하는 제3자 저작물과 그 라이선스를 밝힙니다. 앱에 포함된 오픈소스 소프트웨어 패키지는 각 패키지의 라이선스를 따릅니다.",
  },
  { type: "h2", text: "아이콘" },
  { type: "h3", text: "Solar Icon Set — library" },
  {
    type: "dl",
    items: [
      { term: "저작자", desc: "480 Design (Solar Icons)" },
      {
        term: "라이선스",
        desc: "Creative Commons Attribution 4.0 International (CC BY 4.0) — https://creativecommons.org/licenses/by/4.0/",
      },
      { term: "사용처", desc: "Android 앱 하단 탭의 '라이브러리' 아이콘" },
      { term: "변경 사항", desc: "선 모양(library-linear)의 획 굵기를 1.5에서 1.25로 줄였습니다. 채운 모양(library-bold)은 원본 그대로입니다." },
    ],
  },
];
