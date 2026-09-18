"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TopicGroup } from "@/content/public-topics";
import { site, topicPicker } from "@/content/site";
import s from "./Topics.module.css";

const TOAST_MS = 2200;

/**
 * 주제 고르기 — 앱 온보딩 1단계의 규칙을 그대로 옮겼다(`onboarding.md` 3장).
 *
 * - 최대 3개. **3개를 채우면 나머지 칩은 흐려지고**, 눌러도 선택되지 않고 토스트만 뜬다
 *   (앱은 비활성 + 토스트 — 여기서도 버튼을 `disabled`로 막지 않는다. 막으면 눌러 볼 수 없어 왜 안 되는지 모른다).
 * - 서버에 저장하지 않는다. 고른 주제는 출시 알림 메일 본문에 실려 간다 — 랜딩에서 유일하게 "이어지는" 곳이다.
 * - 칩은 `button` + `aria-pressed`. 개수는 `aria-live`로 읊어 준다.
 */
export function TopicPicker({ groups }: { groups: TopicGroup[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>(0);
  const isFull = selected.length >= topicPicker.max;

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const toggle = (name: string) => {
    if (selected.includes(name)) {
      setSelected(selected.filter((item) => item !== name));
      return;
    }
    if (isFull) {
      showToast(topicPicker.limitToast(topicPicker.max));
      return;
    }
    setSelected([...selected, name]);
  };

  const mailto = `mailto:${site.contactEmail}?subject=${encodeURIComponent("이어 출시 소식 받고 싶어요")}&body=${encodeURIComponent(
    `관심 주제: ${selected.join(", ")}`,
  )}`;

  return (
    <div className={s.picker}>
      <p className={`${s.counter} ${selected.length > 0 ? s.counterOn : ""}`} aria-live="polite">
        {selected.length > 0
          ? topicPicker.countLabel(selected.length, topicPicker.max)
          : topicPicker.emptyHint}
      </p>

      <div className={s.groups}>
        {groups.map((group) => (
          <div key={group.name} className={s.group}>
            <h3 className={s.groupName}>{group.name}</h3>
            <ul className={s.chips}>
              {group.topics.map((item) => {
                const on = selected.includes(item);
                const blocked = !on && isFull;
                return (
                  <li key={item}>
                    <button
                      type="button"
                      className={`${s.chip} ${s.chipBtn} ${on ? s.chipOn : ""} ${blocked ? s.chipBlocked : ""}`}
                      onClick={() => toggle(item)}
                      aria-pressed={on}
                      aria-disabled={blocked || undefined}
                    >
                      {item}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* 고른 주제 요약 — 1개 이상 고르면 나타난다. 앱의 다음 단계(담기) 대신 출시 알림으로 잇는다 */}
      <div className={`${s.summary} ${selected.length > 0 ? s.summaryOn : ""}`} aria-hidden={selected.length === 0}>
        <div className={s.summaryText}>
          <p className={s.summaryTitle}>{topicPicker.summaryTitle}</p>
          <p className={s.summaryBody}>{topicPicker.summaryBody}</p>
          <ul className={s.summaryChips} aria-label="고른 주제">
            {selected.map((item) => (
              <li key={item} className={`${s.chip} ${s.chipOn} ${s.chipSmall}`}>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className={s.summaryActions}>
          <a href={mailto} className="btn btnPrimary" tabIndex={selected.length > 0 ? 0 : -1}>
            {topicPicker.cta}
          </a>
          <button
            type="button"
            className={`btn btnGhost ${s.resetBtn}`}
            onClick={() => setSelected([])}
            tabIndex={selected.length > 0 ? 0 : -1}
          >
            {topicPicker.reset}
          </button>
        </div>
      </div>

      {/* 상한 토스트 — 앱과 같은 문구. 화면 아래 가운데에 잠깐 */}
      <div className={`${s.toast} ${toast ? s.toastOn : ""}`} role="status" aria-live="polite">
        {toast ?? ""}
      </div>
    </div>
  );
}
