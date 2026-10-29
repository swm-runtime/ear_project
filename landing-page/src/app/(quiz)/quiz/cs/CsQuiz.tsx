"use client";

import Script from "next/script";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import s from "./page.module.css";
import { LevelArt } from "./LevelArt";
import { csQuestions, csQuiz, levelFor } from "@/content/quiz-cs";
import { KAKAO_JS_KEY, SITE_URL } from "@/content/site";

/**
 * CS 지식 테스트 화면 — 시작 → 10문제(고를 때마다 정답·풀이) → 결과(레벨·앱 받기·공유).
 *
 * 점수는 이 화면 안에서만 센다. 서버로 보내지 않고 저장하지도 않는다 — 측정은 GA4 이벤트
 * (`quiz_start`·`quiz_complete`·`quiz_share`·`quiz_app_click`)뿐이다.
 *
 * 공유 링크에는 `utm_source=kakao|link`를 붙인다. GA4 세션 소스로 "공유로 들어온 방문"을 세기 위해서다.
 * 앱 받기는 `/app/?src=quiz_cs_<들어온 utm_source>` — 채널별로 퀴즈 링크를 나눠 올리면(`?utm_source=everytime`)
 * 설치도 채널별로 갈린다(2026-10-27). 스토어 쪽 출처 집계 규칙은 `app/AppStoreRedirect.tsx`.
 */

/** 카카오 SDK — 버전과 무결성 해시를 함께 고정한다(kakaocdn 원본 파일의 sha384, 2026-10-27 확인). */
const KAKAO_SDK = {
  src: "https://t1.kakaocdn.net/kakao_js_sdk/2.8.4/kakao.min.js",
  integrity: "sha384-BGX7Wb16GmRFagri4bLJV2DgipVZaU2AI812GZtHtHzzDQJnfHasDXN5houxv45w",
};

type KakaoSdk = {
  isInitialized(): boolean;
  init(key: string): void;
  Share: { sendDefault(settings: Record<string, unknown>): void };
};

declare global {
  interface Window {
    Kakao?: KakaoSdk;
    gtag?: (...args: unknown[]) => void;
  }
}

type Phase = "intro" | "quiz" | "result";

/** 바뀔 일이 없는 브라우저 기능 값을 `useSyncExternalStore`로 읽을 때 쓰는 빈 구독. */
const noSubscribe = () => () => {};

function shareUrl(source: "kakao" | "link"): string {
  const query = new URLSearchParams({
    utm_source: source,
    utm_medium: "share",
    utm_campaign: `quiz_${csQuiz.id}`,
  });
  return `${SITE_URL}${csQuiz.path}?${query}`;
}

/**
 * 앱 받기 출처(`/app/?src=`) — 들어온 링크의 `utm_source`를 붙여 채널별 설치를 나눈다(`quiz_cs_everytime`).
 * `utm_source`가 없거나 스토어 출처 형식(`AppStoreRedirect.tsx` — 소문자·숫자·`_`·`-` 40자)에 맞지 않으면 `quiz_cs`.
 * 퀴즈 결과를 공유받아 들어온 사람은 `quiz_cs_kakao`처럼 공유 방식이 붙는다.
 */
function appSourceFor(search: string): string {
  const base = csQuiz.appSource;
  const channel = new URLSearchParams(search).get("utm_source")?.toLowerCase() ?? "";
  const source = `${base}_${channel}`;
  return /^[a-z0-9_-]+$/.test(channel) && source.length <= 40 ? source : base;
}

function track(event: string, params: Record<string, string | number> = {}) {
  window.gtag?.("event", event, { quiz_id: csQuiz.id, ...params });
}

/** 카톡 인앱 브라우저처럼 Clipboard API가 막힌 곳을 위한 옛 방식. 실패하면 false. */
function copyWithSelection(text: string): boolean {
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  field.remove();
  return ok;
}

export function CsQuiz() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<number[]>([]);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">("idle");
  const [kakaoReady, setKakaoReady] = useState(false);
  // 들어온 링크의 쿼리(채널 UTM). 서버 HTML에는 없으므로 빈 값으로 그리고 브라우저에서 다시 읽는다.
  const search = useSyncExternalStore(
    noSubscribe,
    () => window.location.search,
    () => "",
  );
  const topRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const total = csQuestions.length;
  const current = csQuestions[index];
  const picked = picks[index];
  const answered = picked !== undefined;
  const score = csQuestions.filter((q, i) => picks[i] === q.answer).length;
  const level = levelFor(score);
  const appSource = appSourceFor(search);
  const appHref = `/app/?src=${appSource}`;

  // 문제가 바뀌면 카드 머리로 올린다 — 휴대폰에서는 풀이를 읽느라 내려간 화면이 그대로 남는다.
  useEffect(() => {
    if (phase === "intro") return;
    const top = topRef.current;
    if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: "start" });
  }, [phase, index]);

  // 답을 고르면 [다음 문제]로 포커스를 옮긴다. 풀이가 그 위에 있어 함께 화면에 들어온다.
  useEffect(() => {
    if (answered) nextRef.current?.focus();
  }, [answered, index]);

  function start() {
    setPicks([]);
    setIndex(0);
    setCopyState("idle");
    setPhase("quiz");
    track("quiz_start");
  }

  function pick(option: number) {
    if (answered) return;
    const next = [...picks];
    next[index] = option;
    setPicks(next);
  }

  function goNext() {
    if (index + 1 < total) {
      setIndex(index + 1);
      return;
    }
    setPhase("result");
    track("quiz_complete", { score, level: level.title });
  }

  function shareKakao() {
    const kakao = window.Kakao;
    if (!KAKAO_JS_KEY || !kakao) return;
    if (!kakao.isInitialized()) kakao.init(KAKAO_JS_KEY);
    const url = shareUrl("kakao");
    kakao.Share.sendDefault({
      objectType: "feed",
      content: {
        title: `나의 CS 지식 레벨은 ${level.title} (${score}/${total})`,
        description: "키워드 10문제로 알아보는 CS 지식 수준. 너도 풀어 볼래?",
        imageUrl: `${SITE_URL}/og/quiz-cs.png`,
        imageWidth: 1200,
        imageHeight: 630,
        link: { mobileWebUrl: url, webUrl: url },
      },
      buttons: [{ title: "나도 풀어 보기", link: { mobileWebUrl: url, webUrl: url } }],
    });
    track("quiz_share", { method: "kakao" });
  }

  async function copyLink() {
    const url = shareUrl("link");
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      ok = copyWithSelection(url);
    }
    setCopyState(ok ? "copied" : "manual");
    track("quiz_share", { method: "link" });
  }

  return (
    <div className={s.wrap}>
      {KAKAO_JS_KEY && (
        <Script
          src={KAKAO_SDK.src}
          integrity={KAKAO_SDK.integrity}
          crossOrigin="anonymous"
          strategy="lazyOnload"
          onReady={() => setKakaoReady(true)}
        />
      )}

      <div className="container" ref={topRef}>
        {phase === "intro" && (
          <section className={s.card}>
            <p className={s.eyebrow}>CS 지식 테스트</p>
            <h1 className={s.title}>{csQuiz.title}</h1>
            <p className={s.lede}>
              자료구조부터 네트워크·보안까지, 개발자라면 한 번쯤 들어 본 키워드 10문제예요.
            </p>
            <ul className={s.facts}>
              <li>10문제</li>
              <li>약 2분</li>
              <li>정답·풀이 바로 확인</li>
            </ul>
            <button type="button" className="btn btnPrimary" onClick={start}>
              테스트 시작
            </button>
          </section>
        )}

        {phase === "quiz" && (
          <section className={s.card} aria-labelledby="quiz-question">
            <div className={s.progressRow}>
              {/* 키워드는 곧 정답인 경우가 많아(#ARP) 문제 위에는 편 주제를, 상황형에는 상황 이름을 단다. */}
              <span className={s.keyword}>{current.title ?? current.episode?.title}</span>
              <span className={s.count}>
                {index + 1} / {total}
              </span>
            </div>
            <div
              className={s.progress}
              role="progressbar"
              aria-label="푼 문제"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={index + (answered ? 1 : 0)}
            >
              <span style={{ width: `${((index + (answered ? 1 : 0)) / total) * 100}%` }} />
            </div>

            {current.situation && <p className={s.situation}>{current.situation}</p>}
            <h1 id="quiz-question" className={s.question}>
              {current.question}
            </h1>

            <ol className={s.options}>
              {current.options.map((option, i) => {
                const state = !answered
                  ? "idle"
                  : i === current.answer
                    ? "correct"
                    : i === picked
                      ? "wrong"
                      : "dim";
                return (
                  <li key={option}>
                    <button
                      type="button"
                      className={s.option}
                      data-state={state}
                      onClick={() => pick(i)}
                      disabled={answered}
                      aria-pressed={picked === i}
                    >
                      <span className={s.mark} aria-hidden="true">
                        {state === "correct" ? "✓" : state === "wrong" ? "✕" : String.fromCharCode(65 + i)}
                      </span>
                      <span className={s.optionText}>{option}</span>
                      {state === "correct" && <span className={s.tag}>정답</span>}
                      {state === "wrong" && <span className={s.tag}>내 선택</span>}
                    </button>
                  </li>
                );
              })}
            </ol>

            <div aria-live="polite">
              {answered && (
                <div className={s.explain}>
                  <p className={s.verdict}>{picked === current.answer ? "정답이에요" : "아쉬워요"}</p>
                  <p className={s.explainText}>{current.explanation}</p>
                  <button ref={nextRef} type="button" className="btn btnPrimary" onClick={goNext}>
                    {index + 1 < total ? "다음 문제" : "결과 보기"}
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {phase === "result" && (
          <section className={s.card}>
            <p className={s.eyebrow}>나의 CS 지식 레벨</p>
            <h1 className={s.levelTitle}>{level.title}</h1>
            <LevelArt kind={level.art} />
            <p className={s.score}>
              <strong>{score}</strong> / {total}
            </p>
            <p className={s.lede}>{level.summary}</p>

            <div className={s.cta}>
              <p className={s.ctaText}>
                CS 지식을 빠르게 공부해보고 싶다면, 이어 앱에서 「{csQuiz.series}」 시리즈를 들어보세요!
              </p>
              <a
                className="btn btnPrimary"
                href={appHref}
                onClick={() => track("quiz_app_click", { placement: "result", app_source: appSource })}
              >
                이어에서 무료로 듣기
              </a>
            </div>

            <div className={s.share}>
              <p className={s.shareTitle}>친구는 몇 점일까요?</p>
              <div className={s.shareActions}>
                {KAKAO_JS_KEY && (
                  <button
                    type="button"
                    className={`btn ${s.kakao}`}
                    onClick={shareKakao}
                    disabled={!kakaoReady}
                  >
                    카카오톡으로 공유
                  </button>
                )}
                <button type="button" className="btn btnGhost" onClick={copyLink}>
                  {copyState === "copied" ? "링크를 복사했어요" : "링크 복사"}
                </button>
              </div>
              {copyState === "manual" && (
                <p className={s.manualCopy}>
                  복사가 막혀 있어요. 아래 주소를 길게 눌러 복사해 주세요.
                  <br />
                  <span className={s.manualUrl}>{shareUrl("link")}</span>
                </p>
              )}
            </div>

            <button type="button" className={s.retry} onClick={start}>
              다시 풀기
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
