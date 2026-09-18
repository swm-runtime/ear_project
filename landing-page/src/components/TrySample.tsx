import { trySample } from "@/content/site";
import { TryPlayer } from "./TryPlayer";
import s from "./TrySample.module.css";
import { Sentences } from "./Sentences";

/**
 * Try 섹션 — 히어로 바로 아래에서 샘플 한 편을 들려준다.
 *
 * 섹션 껍데기(제목·문구)는 서버 컴포넌트로 두고, 재생 상태를 가진 플레이어만 클라이언트
 * 컴포넌트(TryPlayer)로 뗐다. 정적 내보내기라 첫 HTML에 제목·문구가 그대로 실리고,
 * JS는 플레이어 하나만 받는다.
 */
export function TrySample() {
  return (
    <section id="try" className={`section ${s.section}`}>
      <div className="container">
        <p className="eyebrow">{trySample.eyebrow}</p>
        <h2 className="sectionTitle">{trySample.title}</h2>
        <p className="sectionLede">
          <Sentences text={trySample.lede} />
        </p>

        <div className={s.playerWrap}>
          <TryPlayer />
        </div>

        <p className={s.note}>
          <Sentences text={trySample.note} />
        </p>
      </div>
    </section>
  );
}
