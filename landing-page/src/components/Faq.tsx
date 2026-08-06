import { faqs } from "@/content/site";
import s from "./Faq.module.css";

/**
 * 아코디언을 native <details>/<summary>로 만든다.
 * 자바스크립트가 필요 없고, 접힌 답변도 HTML에 그대로 들어 있어 크롤러가 읽는다.
 * 같은 내용이 JsonLd의 FAQPage로도 나가므로 원본은 `content/site.ts` 하나다.
 */
export function Faq() {
  return (
    <section id="faq" className={`section ${s.wrap}`}>
      <div className="container">
        <div className={s.inner}>
          <div className={s.head}>
            <p className="eyebrow">FAQ</p>
            <h2 className="sectionTitle">자주 묻는 질문</h2>
            <p className={s.headLede}>
              여기서 답을 찾지 못하셨다면 편하게 물어봐 주세요.
            </p>
          </div>

          <ul className={s.list}>
            {faqs.map((item) => (
              <li key={item.q}>
                <details className={s.item}>
                  <summary className={s.q}>
                    <span>{item.q}</span>
                    <svg
                      className={s.chev}
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path
                        d="M12 5v14M5 12h14"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </summary>
                  <p className={s.a}>{item.a}</p>
                </details>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
