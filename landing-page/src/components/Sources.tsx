import { sources } from "@/content/site";
import { LogoMark } from "./Logo";
import { Sentences } from "./Sentences";
import s from "./Sources.module.css";

/** 위쪽 워드마크 띠에서 아래 한 점으로 모이는 선의 시작 x(viewBox 1200 기준). 6줄 */
const LINE_STARTS = [90, 300, 500, 700, 900, 1110];

/**
 * Sources 섹션 — 히어로 아래, TRY 위(2026-09-18, UIUX 멘토 피드백: "팟캐스트로는 못 듣던 자료"가 강점).
 *
 * 1) 자료 워드마크가 두 줄로 반대 방향으로 천천히 흐른다(CSS 마퀴 — 같은 줄을 두 번 이어 붙여 이음새 없음).
 * 2) 스크롤로 섹션이 나타나면(ScrollReveal의 .is-visible) 띠 아래에서 **여섯 줄기 선이 한 점으로 모여 그려지고**,
 *    그 점에 이어 마크 + "이런 자료를 담아…" 캡션이 뜬 뒤, 선이 아래로 이어져 TRY 섹션 윗선에 닿는다.
 *    표식이 없으면(JS 꺼짐·reduced-motion) 완성된 상태로 보인다.
 * 로고 이미지는 쓰지 않는다 — 워드마크 글자만(site.ts sources 주석).
 */
export function Sources() {
  const row = [...sources.items, ...sources.items];

  return (
    <section id="sources" className={`section ${s.wrap}`}>
      <div className="container">
        <p className="eyebrow">{sources.eyebrow}</p>
        <h2 className="sectionTitle">{sources.title}</h2>
        <p className="sectionLede">
          <Sentences text={sources.lede} />
        </p>
      </div>

      {/* 워드마크 띠 — 컨테이너 밖까지 흐른다. 반복 목록이라 보조기기에는 첫 목록만 읽힌다 */}
      <div className={s.band}>
        <ul className={`${s.row} ${s.rowA}`} aria-label="참고하는 자료">
          {row.map((item, i) => (
            <li
              key={`${item.name}-${i}`}
              className={`${s.mark} ${s[`mark_${item.style}`]}`}
              aria-hidden={i >= sources.items.length || undefined}
            >
              {item.name}
            </li>
          ))}
        </ul>
        <ul className={`${s.row} ${s.rowB}`} aria-hidden="true">
          {[...row].reverse().map((item, i) => (
            <li key={`${item.name}-${i}`} className={`${s.mark} ${s[`mark_${item.style}`]}`}>
              {item.name}
            </li>
          ))}
        </ul>
      </div>

      {/* 모이는 선 — 여섯 줄기가 가운데 한 점으로. 그 점 아래 이어 마크와 캡션, 다시 한 줄기가 TRY로 */}
      <div className={`container ${s.funnelWrap}`}>
        <svg className={s.funnel} viewBox="0 0 1200 220" preserveAspectRatio="none" aria-hidden="true">
          {LINE_STARTS.map((x, i) => (
            <path
              key={x}
              className={s.line}
              style={{ animationDelay: `${0.12 * i}s` }}
              pathLength={1}
              d={`M${x} 0 C ${x} 120, 600 90, 600 220`}
            />
          ))}
        </svg>

        <div className={s.node}>
          <span className={s.nodeMark}>
            <LogoMark className={s.nodeLogo} />
          </span>
          <p className={s.caption}>{sources.caption}</p>
        </div>

        <span className={s.tail} aria-hidden="true" />
      </div>
    </section>
  );
}
