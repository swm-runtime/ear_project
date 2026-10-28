import type { ReactNode } from "react";
import type { LevelArtKind } from "@/content/quiz-cs";
import s from "./page.module.css";

/**
 * 결과 화면의 레벨 그림 — 새싹(젖병) → 주니어(책 더미 앞에서 머리 긁는 사람) → 시니어(노트북 앞 개발자) → 마스터(로봇).
 *
 * 네 장 모두 같은 틀(200×160, 회색 원 배경, 3px 선)로 그려 레벨이 바뀌어도 크기·무게가 같아 보이게 한다.
 * 색은 `page.module.css`의 `art*` 클래스가 사이트 토큰으로 칠한다. 레벨 이름이 바로 위에 있어 그림은 장식이다.
 */
export function LevelArt({ kind }: { kind: LevelArtKind }) {
  return (
    <svg className={s.art} viewBox="0 0 200 160" aria-hidden="true" focusable="false">
      <circle className={s.artBg} cx="100" cy="84" r="62" />
      {ART[kind]}
    </svg>
  );
}

const ART: Record<LevelArtKind, ReactNode> = {
  bottle: (
    <>
      <ellipse className={s.artShadow} cx="100" cy="142" rx="34" ry="4" />
      <path
        className={s.artFill}
        d="M90 47 C90 40 95 37 96 34 C93 31 94.5 22.5 100 22.5 C105.5 22.5 107 31 104 34 C105 37 110 40 110 47 Z"
      />
      <rect className={s.artDark} x="80" y="44" width="40" height="13" rx="4" />
      <rect className={s.artFill} x="78" y="57" width="44" height="80" rx="15" />
      <path
        className={s.artSoft}
        stroke="none"
        d="M78 98 Q89 92 100 98 T122 98 V122 A15 15 0 0 1 107 137 H93 A15 15 0 0 1 78 122 Z"
      />
      <path d="M88 72 H96 M88 84 H93 M88 96 H96 M88 108 H93" strokeWidth="2.5" />
      <rect x="78" y="57" width="44" height="80" rx="15" fill="none" />
      {/* 우유 방울 */}
      <path
        className={s.artSoft}
        strokeWidth="2.5"
        d="M122 22 C125 27 128 30 128 34 A6 6 0 0 1 116 34 C116 30 119 27 122 22 Z M134 42 C136 45 138 47 138 49.5 A4 4 0 0 1 130 49.5 C130 47 132 45 134 42 Z"
      />
    </>
  ),
  study: (
    <>
      <path className={s.artGround} d="M24 141 H170" />
      <rect className={s.artFill} x="105" y="68" width="14" height="14" rx="3" />
      <path className={s.artSoft} d="M84 141 C84 106 96 85 112 85 C128 85 140 106 140 141 Z" />
      <circle className={s.artFill} cx="112" cy="56" r="16" />
      <path
        className={s.artDark}
        d="M96 54 C95 42 102 38 112 38 C122 38 129 44 128 52 C122 48 114 47 108 48 C103 49 99 51 96 54 Z M112 39 Q114 32 120 33"
      />
      <circle className={s.artDark} stroke="none" cx="106" cy="58" r="2" />
      <circle className={s.artDark} stroke="none" cx="118" cy="58" r="2" />
      <path d="M106 66 Q109 64 112 66 T118 66" strokeWidth="2.5" />
      {/* 물음표 */}
      <path d="M83 23 C83 16 93 16 93 23 C93 28 88 28 88 33" />
      <circle className={s.artDark} stroke="none" cx="88" cy="40" r="2" />
      {/* 머리 긁는 팔 — 굵은 선 위에 가는 회색 선을 겹쳐 속이 찬 팔로 보이게 한다 */}
      <path className={s.artLimb} d="M134 100 L154 74 L133 48" />
      <path className={s.artLimbFill} d="M134 100 L154 74 L133 48" />
      <circle className={s.artFill} cx="131" cy="45" r="6" />
      <path d="M140 33 Q145 35 146 41 M134 29 Q140 29 143 32" strokeWidth="2.5" />
      {/* 쌓아 둔 책 */}
      <rect className={s.artFill} x="28" y="127" width="50" height="14" rx="2" />
      <path d="M36 127 V141" strokeWidth="2.5" />
      <rect className={s.artSoft} x="33" y="114" width="40" height="13" rx="2" />
      <path d="M65 114 V127" strokeWidth="2.5" />
      <rect className={s.artDark} x="26" y="102" width="46" height="12" rx="2" />
      {/* 펼친 책 */}
      <path
        className={s.artFill}
        d="M84 122 Q98 116 112 123 Q126 116 140 122 V139 Q126 133 112 140 Q98 133 84 139 Z"
      />
      <path d="M112 123 V140" strokeWidth="2.5" />
      <path
        className={s.artFaint}
        d="M90 127 Q98 124 106 128 M90 132 Q98 129 106 133 M118 128 Q126 124 134 127 M118 133 Q126 129 134 132"
      />
    </>
  ),
  laptop: (
    <>
      <path className={s.artGround} d="M30 141 H170" />
      <rect className={s.artFill} x="93" y="64" width="14" height="14" rx="3" />
      <path className={s.artSoft} d="M64 124 C64 98 80 77 100 77 C120 77 136 98 136 124 Z" />
      <circle className={s.artFill} cx="100" cy="52" r="16" />
      <path
        className={s.artDark}
        d="M84 51 C83 40 90 34 100 34 C110 34 117 40 116 50 C110 46 103 45 97 46 C91 47 87 49 84 51 Z"
      />
      {/* 안경 */}
      <circle className={s.artFill} cx="93" cy="55" r="5" strokeWidth="2.5" />
      <circle className={s.artFill} cx="107" cy="55" r="5" strokeWidth="2.5" />
      <path d="M98 55 H102 M96 63 Q100 66 104 63" strokeWidth="2.5" />
      <rect className={s.artDark} x="60" y="92" width="80" height="42" rx="6" />
      <path className={s.artOnDark} d="M91 106 L85 113 L91 120 M109 106 L115 113 L109 120 M103 104 L97 122" />
      <path className={s.artFill} d="M48 134 H152 L146 141 H54 Z" />
      {/* 커피 */}
      <rect className={s.artFill} x="154" y="118" width="15" height="23" rx="3" />
      <path d="M169 123 C175 123 175 134 169 134" />
      <path className={s.artFaint} d="M158 112 C156 108 160 106 158 102 M165 112 C163 108 167 106 165 102" />
    </>
  ),
  robot: (
    <>
      <ellipse className={s.artShadow} cx="100" cy="142" rx="34" ry="4" />
      <path d="M100 40 V29" />
      <circle className={s.artDark} cx="100" cy="25" r="5" />
      <rect className={s.artSoft} x="62" y="54" width="9" height="18" rx="3" />
      <rect className={s.artSoft} x="129" y="54" width="9" height="18" rx="3" />
      <rect className={s.artFill} x="70" y="40" width="60" height="46" rx="12" />
      <rect className={s.artDark} x="78" y="50" width="44" height="26" rx="8" />
      {/* 웃는 눈 ^^ */}
      <path className={s.artOnDark} d="M85 64 Q90 57 95 64 M105 64 Q110 57 115 64" />
      <rect className={s.artSoft} x="93" y="86" width="14" height="6" />
      <path d="M74 102 C64 106 60 114 60 120 M126 100 C136 96 142 88 144 80 M88 132 V137 M112 132 V137" />
      <circle className={s.artFill} cx="60" cy="124" r="5" />
      <circle className={s.artFill} cx="145" cy="76" r="5" />
      <rect className={s.artFill} x="74" y="92" width="52" height="40" rx="10" />
      <circle className={s.artDark} cx="100" cy="107" r="6" />
      <path d="M88 121 H112" strokeWidth="2.5" />
      <rect className={s.artDark} x="80" y="136" width="16" height="5" rx="2.5" />
      <rect className={s.artDark} x="104" y="136" width="16" height="5" rx="2.5" />
      {/* 반짝임 */}
      <path
        className={s.artDark}
        stroke="none"
        d="M160 42 Q161.5 48.5 168 50 Q161.5 51.5 160 58 Q158.5 51.5 152 50 Q158.5 48.5 160 42 Z M46 56 Q47 60 51 61 Q47 62 46 66 Q45 62 41 61 Q45 60 46 56 Z"
      />
    </>
  ),
};
