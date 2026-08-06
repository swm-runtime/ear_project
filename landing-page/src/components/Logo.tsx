/**
 * 이어 심볼 — 고리(ㅇ) 하나와 퍼져 나가는 호 두 개.
 * 귀와 소리, 그리고 '이어'의 ㅇ을 같은 형태로 읽히게 한 도형이다.
 * 색은 상속(currentColor)받으므로 어두운 배경·밝은 배경 모두에서 그대로 쓴다.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="10.5" cy="16" r="5.4" stroke="currentColor" strokeWidth="2.7" />
      <path
        d="M20.5 10.6a8.6 8.6 0 0 1 0 10.8"
        stroke="currentColor"
        strokeWidth="2.7"
        strokeLinecap="round"
      />
      <path
        d="M26 6.4a15.2 15.2 0 0 1 0 19.2"
        stroke="currentColor"
        strokeWidth="2.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
