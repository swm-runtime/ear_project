/**
 * Google Play로 가는 버튼 앞에 놓는 재생 삼각형. `AppleLogo`와 같은 규칙이다 — 글자색(currentColor)을
 * 따라가고, 크기는 글자 크기를 따르며, 장식이라 낭독기에는 숨긴다(버튼의 글자가 목적지를 말한다).
 *
 * 공식 로고의 네 색을 쓰지 않고 한 색으로 그린다 — 옆의 Apple 로고가 단색이라 색이 들어가면 두 버튼의
 * 무게가 달라진다.
 */
export function GooglePlayLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="1.05em"
      height="1.05em"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      style={{ flex: "none" }}
    >
      <path d="M4.6 2.3c-.4.3-.6.8-.6 1.4v16.6c0 .6.2 1.1.6 1.4l9.3-9.7-9.3-9.7Zm10.6 11 2.7 2.8-10.7 6c-.4.2-.8.3-1.2.2l9.2-9Zm0-2.6L6 1.7c.4-.1.8 0 1.2.2l10.7 6-2.7 2.8Zm4-1.6 2.3 1.3c1 .6 1 1.6 0 2.2l-2.3 1.3-3-2.9 3-1.9Z" />
    </svg>
  );
}
