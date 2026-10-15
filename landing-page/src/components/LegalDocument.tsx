import type { Block } from "@/content/prose";
import { legalMeta, legalNotice } from "@/content/legal";
import { Prose, tableOfContents } from "./Prose";
import s from "./LegalDocument.module.css";

/**
 * 정책 문서(개인정보 처리방침·이용약관)의 공통 틀.
 *
 * 두 문서는 구조가 같으므로 본문 블록만 갈아 끼운다. 상단의 시행일·버전과
 * 상단 안내(`notice`)는 있을 때만 붙인다 — 출시 전 문구는 2026-10-15에 걷었다.
 */
/** 화면 고정 문구. 영어 문서(`legal-en.ts`)가 갈아 끼운다 */
const LABELS_KO = { effectiveDate: "시행일", version: "버전", toc: "목차", tocAria: "문서 목차" };

export function LegalDocument({ blocks, meta = legalMeta, notice = legalNotice, labels = LABELS_KO }: {
  blocks: Block[];
  meta?: { effectiveDate: string; version: string };
  notice?: string;
  labels?: { effectiveDate: string; version: string; toc: string; tocAria: string };
}) {
  const toc = tableOfContents(blocks);

  return (
    <div className="section">
      <div className="container">
        {notice ? <p className={s.notice}>{notice}</p> : null}

        <dl className={s.meta}>
          <div>
            <dt>{labels.effectiveDate}</dt>
            <dd>{meta.effectiveDate}</dd>
          </div>
          <div>
            <dt>{labels.version}</dt>
            <dd>{meta.version}</dd>
          </div>
        </dl>

        <div className={s.layout}>
          <nav className={s.toc} aria-label={labels.tocAria}>
            <p className={s.tocTitle}>{labels.toc}</p>
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
