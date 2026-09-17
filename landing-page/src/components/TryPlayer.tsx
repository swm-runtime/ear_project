"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PUBLIC_API_BASE_URL, trySample } from "@/content/site";
import s from "./TrySample.module.css";

/** `GET /public/sample` 응답(public-api.md 2.2). 표시에 필요한 값과 서명 URL만 온다 */
type SampleResponse = {
  content: {
    title: string;
    author_name: string | null;
    source_name: string;
    duration_sec: number;
    thumbnail_url: string;
  };
  audio: {
    url: string;
    expires_at: string;
    expires_in_sec: number;
  };
};

type Sample = {
  title: string;
  meta: string;
  durationSec: number;
  thumbnailUrl: string;
};

type Status = "loading" | "ready" | "unavailable";

/** 앱 플레이어와 같은 값 — 10초 뒤로/앞으로 */
const SKIP_SEC = 10;
/** 배속 칩이 순서대로 도는 값. 마지막 다음은 처음으로 */
const RATES = [1, 1.25, 1.5, 2] as const;
/** 만료 몇 초 전부터는 새 URL을 받고 재생한다 — 재생 도중 끊기지 않게 여유를 둔다 */
const REFRESH_MARGIN_MS = 10_000;

function formatTime(sec: number): string {
  const whole = Math.max(0, Math.floor(sec));
  const m = Math.floor(whole / 60);
  const ss = String(whole % 60).padStart(2, "0");
  return `${m}:${ss}`;
}

function formatRate(rate: number): string {
  return `${Number.isInteger(rate) ? rate.toFixed(1) : String(rate)}×`;
}

function toSample(body: SampleResponse): Sample {
  const { content } = body;
  return {
    title: content.title,
    meta: content.author_name
      ? `${content.source_name} · ${content.author_name}`
      : content.source_name,
    durationSec: content.duration_sec,
    thumbnailUrl: content.thumbnail_url,
  };
}

async function fetchSample(): Promise<SampleResponse> {
  const response = await fetch(`${PUBLIC_API_BASE_URL}/public/sample`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`public/sample ${response.status}`);
  return (await response.json()) as SampleResponse;
}

/**
 * 샘플 플레이어. 실제 이어 앱의 플레이어 구성(아트워크 · 제목 · 시크바 + 시간 · 10초 뒤로 /
 * 재생·일시정지 / 10초 앞으로 · 배속 칩 — player-uiux.md 4.1)을 웹에 옮긴 것이다.
 *
 * - **오디오는 서명 URL로 받는다.** 파일을 랜딩에 두지 않고 `GET /public/sample`이 앱 재생과 같은
 *   서명기로 짧은 만료의 URL을 발급한다(public-api.md 2.2). 만료가 가까우면 재생 전에 다시 받고,
 *   재생 위치는 그대로 이어 간다.
 * - 브라우저 `<audio>` 하나로 재생한다. 외부 플레이어 라이브러리를 넣지 않는다 — 정적 페이지에
 *   런타임 의존성을 늘리지 않는다(Icons.tsx와 같은 이유).
 * - API가 실패하거나(404·403·네트워크) 오디오가 깨지면 안내 문구를 띄우고 조작을 잠근다.
 * - 일시정지는 별도 상태 화면이 아니다 — 같은 자리에서 중앙 버튼만 ⏸ ↔ ▶ 로 바뀐다(앱 규칙).
 */
export function TryPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  /** 새 URL로 바꾼 뒤 되돌아갈 재생 위치. 메타데이터가 읽히면 한 번 적용한다 */
  const pendingSeekRef = useRef<number | null>(null);
  /** 오디오 오류 시 URL을 한 번만 다시 받는다 — 만료가 원인인 경우를 흡수한다 */
  const retriedRef = useRef(false);
  const expiresAtRef = useRef(0);
  /**
   * 현재 배속. state(`rateIndex`)와 별도로 ref에도 두는 이유 — `applyAudio`가 배속을 읽으면서
   * state에 의존하면 배속을 바꿀 때마다 `applyAudio` → `load`가 새 함수가 되고, 마운트 시 한 번만
   * 돌아야 할 `load` 효과가 다시 돌아 `audio.src`를 갈아끼운다. 그러면 재생이 멈추고 처음으로
   * 돌아간다(2026-09-18 버그). ref는 함수 정체성을 바꾸지 않는다.
   */
  const rateRef = useRef<number>(RATES[0]);

  const [status, setStatus] = useState<Status>("loading");
  const [sample, setSample] = useState<Sample | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [rateIndex, setRateIndex] = useState(0);

  const applyAudio = useCallback((body: SampleResponse) => {
    const audio = audioRef.current;
    if (!audio) return;
    expiresAtRef.current = Date.now() + body.audio.expires_in_sec * 1000;
    audio.src = body.audio.url;
    audio.playbackRate = rateRef.current;
  }, []);

  /** 표시 정보와 첫 URL을 받는다 */
  const load = useCallback(async () => {
    try {
      const body = await fetchSample();
      setSample(toSample(body));
      setDurationSec(body.content.duration_sec);
      applyAudio(body);
      setStatus("ready");
    } catch {
      setStatus("unavailable");
    }
  }, [applyAudio]);

  /** URL만 새로 받는다. 위치는 유지한다 */
  const refreshAudio = useCallback(async (): Promise<boolean> => {
    const audio = audioRef.current;
    if (!audio) return false;
    try {
      const body = await fetchSample();
      pendingSeekRef.current = audio.currentTime;
      applyAudio(body);
      return true;
    } catch {
      setStatus("unavailable");
      return false;
    }
  }, [applyAudio]);

  useEffect(() => {
    // 동기 setState 회피(react-hooks/set-state-in-effect) — 마운트 직후 한 번 받는다
    queueMicrotask(() => void load());
  }, [load]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoaded = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDurationSec(audio.duration);
      // 소스를 갈아끼우면 브라우저가 배속을 1로 되돌릴 수 있다 — 고른 값을 다시 건다
      audio.playbackRate = rateRef.current;
      if (pendingSeekRef.current !== null) {
        audio.currentTime = pendingSeekRef.current;
        pendingSeekRef.current = null;
      }
    };
    const onTime = () => setCurrentSec(audio.currentTime);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentSec(0);
      audio.currentTime = 0;
    };
    const onError = () => {
      setIsPlaying(false);
      if (!audio.src) return; // src 비운 상태의 오류는 무시한다
      if (retriedRef.current) {
        setStatus("unavailable");
        return;
      }
      retriedRef.current = true;
      void refreshAudio();
    };

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("durationchange", onLoaded);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("durationchange", onLoaded);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [refreshAudio]);

  const isLocked = status !== "ready";

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || isLocked) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    // 만료가 가까우면 새 URL을 먼저 받는다. 실패하면 잠긴 상태로 돌아간다
    if (Date.now() > expiresAtRef.current - REFRESH_MARGIN_MS) {
      const ok = await refreshAudio();
      if (!ok) return;
    }
    // 자동재생 정책으로 거부되면 멈춘 상태를 유지한다 — 사용자 탭이라 보통 통과한다
    void audio.play().catch(() => setIsPlaying(false));
  }, [isLocked, refreshAudio]);

  const skip = useCallback(
    (delta: number) => {
      const audio = audioRef.current;
      if (!audio || isLocked) return;
      const next = Math.min(Math.max(0, audio.currentTime + delta), durationSec);
      audio.currentTime = next;
      setCurrentSec(next);
    },
    [durationSec, isLocked],
  );

  const seek = useCallback((sec: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = sec;
    setCurrentSec(sec);
  }, []);

  /** 배속만 바꾼다 — 소스·위치·재생 상태는 건드리지 않는다 */
  const cycleRate = useCallback(() => {
    const audio = audioRef.current;
    const nextIndex = (rateIndex + 1) % RATES.length;
    rateRef.current = RATES[nextIndex];
    setRateIndex(nextIndex);
    if (audio) audio.playbackRate = RATES[nextIndex];
  }, [rateIndex]);

  const progress = durationSec > 0 ? Math.min(100, (currentSec / durationSec) * 100) : 0;
  const remaining = Math.max(0, durationSec - currentSec);
  const title =
    sample?.title ?? (status === "loading" ? trySample.loadingTitle : trySample.unavailableTitle);

  return (
    <div className={`${s.player} ${isLocked ? s.playerLocked : ""}`} aria-busy={status === "loading"}>
      <audio ref={audioRef} preload="metadata" />

      {/* 썸네일은 서명 URL과 같은 CDN에서 온다. 호스트가 배포마다 달라 next/image 원격 패턴에 묶지
          않고, 정적 내보내기라 이미지 최적화도 꺼져 있어(next.config.ts) 순수 img로 그린다 */}
      {sample ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={s.cover} src={sample.thumbnailUrl} alt="" width={420} height={420} loading="lazy" />
      ) : (
        <span className={`${s.cover} ${s.coverBlank}`} aria-hidden="true" />
      )}

      <div className={s.body}>
        <p className={s.meta}>{sample?.meta ?? " "}</p>
        <h3 className={s.trackTitle}>{title}</h3>

        {status === "unavailable" ? (
          <p className={s.unavailable} role="status">
            {trySample.unavailableBody}
          </p>
        ) : null}

        {/* 시크바 — 채워진 만큼을 --p 로 넘겨 트랙 배경을 그린다 */}
        <div className={s.seek} style={{ ["--p" as string]: `${progress}%` }}>
          <input
            className={s.range}
            type="range"
            min={0}
            max={Math.max(1, Math.floor(durationSec))}
            step={1}
            value={Math.floor(currentSec)}
            onChange={(e) => seek(Number(e.target.value))}
            disabled={isLocked}
            aria-label="재생 위치"
            aria-valuetext={`${formatTime(currentSec)} / ${formatTime(durationSec)}`}
          />
          <div className={s.times} aria-hidden="true">
            <span>{formatTime(currentSec)}</span>
            <span>-{formatTime(remaining)}</span>
          </div>
        </div>

        {/* 이동·재생 묶음은 시크바 가운데에, 배속 칩은 오른쪽 끝에 둔다 — 앱 플레이어의 컨트롤 줄과 같은 배치 */}
        <div className={s.controls}>
          <div className={s.transport}>
            <button
              type="button"
              className={s.skipBtn}
              onClick={() => skip(-SKIP_SEC)}
              disabled={isLocked}
              aria-label={`${SKIP_SEC}초 뒤로`}
            >
              <SkipIcon direction="back" />
            </button>

            <button
              type="button"
              className={s.playBtn}
              onClick={() => void togglePlay()}
              disabled={isLocked}
              aria-label={isPlaying ? "일시정지" : "재생"}
              aria-pressed={isPlaying}
            >
              {isPlaying ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="currentColor" d="M7.5 5h3.2v14H7.5zM13.3 5h3.2v14h-3.2z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="currentColor" d="M8 5.2 19 12 8 18.8z" />
                </svg>
              )}
            </button>

            <button
              type="button"
              className={s.skipBtn}
              onClick={() => skip(SKIP_SEC)}
              disabled={isLocked}
              aria-label={`${SKIP_SEC}초 앞으로`}
            >
              <SkipIcon direction="forward" />
            </button>
          </div>

          <button
            type="button"
            className={s.rateChip}
            onClick={cycleRate}
            disabled={isLocked}
            aria-label={`재생 속도 ${formatRate(RATES[rateIndex])}, 눌러서 바꾸기`}
          >
            {formatRate(RATES[rateIndex])}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 10초 건너뛰기 — 둥근 화살표 안에 숫자. 앱의 [10초 뒤로]·[10초 앞으로]와 같은 뜻이다 */
function SkipIcon({ direction }: { direction: "back" | "forward" }) {
  const flip = direction === "forward" ? "scale(-1 1) translate(-24 0)" : undefined;
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <g transform={flip} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
        <path d="M4.2 3.6v4.2h4.2" />
      </g>
      <text x="12" y="15.2" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="currentColor" fontFamily="var(--sans)">
        {SKIP_SEC}
      </text>
    </svg>
  );
}
