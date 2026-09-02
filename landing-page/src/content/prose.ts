/**
 * 긴 글(블로그·약관·처리방침)의 본문 표현.
 *
 * 마크다운 파서를 넣지 않는 이유: 이 사이트에 필요한 문법은 문단·소제목·목록·인용
 * 정도이고, 파서 하나를 위해 런타임 의존성과 번들을 늘릴 만한 값이 아니다.
 * 블록 배열로 두면 타입이 잡히고, JSON-LD용 본문 추출도 그냥 map 한 번이면 된다.
 *
 * 텍스트 안에서는 `**강조**` 하나만 지원한다(`components/Prose.tsx`가 해석).
 * 그 이상이 필요해지면 그때 MDX 도입을 검토한다.
 */

export type Block =
  /** 소제목. 글 안에서 h2로 나간다. */
  | { type: "h2"; text: string }
  /** 더 작은 소제목. h3. */
  | { type: "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  /** 인용. `cite`는 출처 표기. */
  | { type: "quote"; text: string; cite?: string }
  /** 눈에 띄게 묶어 두는 상자. 규칙·요약처럼 본문에서 튀어나와야 하는 내용에 쓴다. */
  | { type: "note"; title: string; text: string }
  /** 정의형 목록. 약관의 용어 정의나 항목별 설명에 쓴다. */
  | { type: "dl"; items: { term: string; desc: string }[] };

/**
 * 블록에서 사람이 읽는 텍스트만 뽑는다.
 * 글자 수 기반 읽는 시간 계산과 JSON-LD의 articleBody에 쓴다.
 */
export function blocksToText(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "h2":
        case "h3":
        case "p":
          return b.text;
        case "ul":
        case "ol":
          return b.items.join(" ");
        case "quote":
          return [b.text, b.cite].filter(Boolean).join(" ");
        case "note":
          return `${b.title} ${b.text}`;
        case "dl":
          return b.items.map((i) => `${i.term} ${i.desc}`).join(" ");
      }
    })
    .join("\n")
    .replace(/\*\*/g, "");
}

/**
 * 읽는 데 걸리는 시간(분).
 * 한국어는 단어 수보다 글자 수가 안정적이라 분당 500자를 기준으로 잡는다.
 */
export function readingMinutes(blocks: Block[]): number {
  return Math.max(1, Math.round(blocksToText(blocks).length / 500));
}
