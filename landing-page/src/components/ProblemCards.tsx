"use client";

import { useState } from "react";
import { problems } from "@/content/site";
import s from "./Problem.module.css";

/**
 * Why 카드 뒤집기 — 앞면은 문제, 뒷면은 이어의 답(랜딩 고급화, 2026-09-18).
 *
 * - 마우스: 올리면 뒤집힌다(CSS `:hover`). 터치·키보드: 카드를 누르면 뒤집히고 다시 누르면 돌아온다(state).
 *   둘을 합치는 이유 — hover만 있으면 터치에서 뒷면을 볼 길이 없고, 클릭만 있으면 데스크톱에서 "눌러야 하는지" 모른다.
 * - 카드 전체가 `button`이고 `aria-pressed`로 상태를 읊는다. 보조기기에는 앞·뒷면이 모두 읽히도록 뒷면을
 *   `aria-hidden`으로 숨기지 않는다 — 시각적으로만 한 면씩 보인다.
 * - `prefers-reduced-motion`이면 회전 대신 앞·뒷면이 교차 페이드한다(Problem.module.css).
 */
export function ProblemCards() {
  const [flipped, setFlipped] = useState<number | null>(null);

  return (
    <ul className={s.grid}>
      {problems.map((p, i) => {
        const isFlipped = flipped === i;
        return (
          <li key={p.title} className={s.cardSlot}>
            <button
              type="button"
              className={`${s.flip} ${isFlipped ? s.flipOn : ""}`}
              onClick={() => setFlipped(isFlipped ? null : i)}
              aria-pressed={isFlipped}
              aria-label={`${p.title} — 이어의 답 보기`}
            >
              <span className={`${s.card} ${s.front}`}>
                <span className={s.num} aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className={s.cardTitle}>{p.title}</span>
                <span className={s.cardBody}>{p.body}</span>
                <span className={s.hint} aria-hidden="true">
                  이어는 이렇게 해요 →
                </span>
              </span>
              <span className={`${s.card} ${s.back}`}>
                <span className={s.backEyebrow}>이어는 이렇게 해요</span>
                <span className={s.cardTitle}>{p.solution.title}</span>
                <span className={s.cardBody}>{p.solution.body}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
