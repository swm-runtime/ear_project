import type { Block } from "@/content/prose";
import { legalMeta, legalNotice } from "@/content/legal";
import { Prose, tableOfContents } from "./Prose";
import s from "./LegalDocument.module.css";

/**
 * 정책 문서(개인정보 처리방침·이용약관)의 공통 틀.
 *
 * 두 문서는 구조가 같으므로 본문 블록만 갈아 끼운다. 상단의 시행일·버전과
 * 출시 준비 중이라는 안내는 두 문서에 반드시 함께 나가야 하므로 여기서 붙인다.
 */
export function LegalDocument({ blocks }: { blocks: Block[] }) {
  const toc = tableOfContents(blocks);

  return (
    <div className="section">
      <div className="container">
        <p className={s.notice}>{legalNotice}</p>

        <dl className={s.meta}>
          <div>
            <dt>시행일</dt>
            <dd>{legalMeta.effectiveDate}</dd>
          </div>
          <div>
            <dt>버전</dt>
            <dd>{legalMeta.version}</dd>
          </div>
        </dl>

        <div className={s.layout}>
          <nav className={s.toc} aria-label="문서 목차">
            <p className={s.tocTitle}>목차</p>
            <ol>
              {toc.map((item) => (
                <li key={item.id}>
                  <a href={`#${item.id}`}>{item.text}</a>
                </li>
              ))}
            </ol>
          </nav>

          <div className={s.body}>
            <Prose blocks={blocks} />
          </div>
        </div>
      </div>
    </div>
  );
}
