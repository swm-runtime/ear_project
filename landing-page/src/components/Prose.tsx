import type { Block } from "@/content/prose";
import s from "./Prose.module.css";

/**
 * 블록 배열을 본문 HTML로 바꾼다. 블로그 글과 정책 문서가 같이 쓴다.
 *
 * 지원하는 인라인 문법은 `**강조**` 하나뿐이다. 마크다운 파서를 넣지 않은 이유는
 * `content/prose.ts` 주석에 적어 두었다.
 */

/** `**...**`만 <strong>으로 바꾼다. 그 밖의 문자는 React가 그대로 이스케이프한다. */
function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      part
    )
  );
}

/**
 * h2에 붙일 id. 한글 제목을 그대로 쓰면 주소에 퍼센트 인코딩이 잔뜩 붙으므로
 * 순번으로 만든다. 글 중간에 소제목을 끼워 넣으면 뒤쪽 앵커가 밀리는 건 감수한다 —
 * 외부에서 앵커로 걸어 두는 문서가 아니라 목차 이동용이다.
 */
export function headingId(index: number): string {
  return `s${index + 1}`;
}

/** 목차. h2만 모은다. */
export function tableOfContents(blocks: Block[]): { id: string; text: string }[] {
  return blocks
    .filter((b): b is Extract<Block, { type: "h2" }> => b.type === "h2")
    .map((b, i) => ({ id: headingId(i), text: b.text }));
}

export function Prose({ blocks }: { blocks: Block[] }) {
  let h2Count = 0;

  return (
    <div className={s.prose}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "h2": {
            const id = headingId(h2Count++);
            return (
              <h2 key={i} id={id}>
                {block.text}
              </h2>
            );
          }
          case "h3":
            return <h3 key={i}>{block.text}</h3>;
          case "p":
            return <p key={i}>{inline(block.text)}</p>;
          case "ul":
            return (
              <ul key={i} className={s.ul}>
                {block.items.map((item, j) => (
                  <li key={j}>{inline(item)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className={s.ol}>
                {block.items.map((item, j) => (
                  <li key={j}>{inline(item)}</li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <blockquote key={i} className={s.quote}>
                <p>{inline(block.text)}</p>
                {block.cite && <cite>{block.cite}</cite>}
              </blockquote>
            );
          case "note":
            return (
              <aside key={i} className={s.note}>
                <p className={s.noteTitle}>{block.title}</p>
                <p>{inline(block.text)}</p>
              </aside>
            );
          case "dl":
            return (
              <dl key={i} className={s.dl}>
                {block.items.map((item, j) => (
                  <div key={j}>
                    <dt>{item.term}</dt>
                    <dd>{inline(item.desc)}</dd>
                  </div>
                ))}
              </dl>
            );
        }
      })}
    </div>
  );
}
