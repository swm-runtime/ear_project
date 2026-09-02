import Image from "next/image";

/** 원본 마크의 가로세로비(public/logo.png). 높이는 여기서 계산해 CLS를 막는다. */
const MARK_W = 480;
const MARK_H = 388;

/**
 * 이어 심볼 — 앱과 같은 마크를 쓴다(`frontend/assets/logo.png`가 원본).
 *
 * 여백을 잘라내고 배경을 투명하게 만든 판본이 `public/logo.png`에 있고,
 * `scripts/brand-assets.mjs`가 원본에서 그걸 만든다. 원본이 바뀌면 그 스크립트를 다시 돌린다.
 *
 * 색이 잉크에 구워진 검정 PNG라 SVG 때처럼 currentColor로 따라오지 않는다.
 * 지금은 헤더·바닥글이 모두 흰 배경이라 문제가 없지만, 어두운 면에 올릴 일이
 * 생기면 흰색 판본을 따로 뽑아야 한다.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      className={className}
      src="/logo.png"
      alt=""
      width={MARK_W}
      height={MARK_H}
      priority
      aria-hidden="true"
    />
  );
}
