import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PixelScene, type PixelSceneHandle } from '@/components/PixelScene';
import { SiteHeader } from '@/components/Shell';
import { saveSettings, useSettings } from '@/db/hooks';
import { cn } from '@/lib/utils';

const PANELS = 4;
const PANEL_LABELS = ['Intro', 'Mechanism', 'Limits', 'Output'];

const WHEEL_GAIN = 2;      // wheel delta to pixels
const FRICTION = 0.95;     // per-frame momentum decay after a swipe
const MIN_VELOCITY = 0.5;  // below this the momentum loop stops
const ARROW_STEP = 400;

/**
 * A continuously scrolling deck over the pixel scene — no panels, no snapping.
 * The wheel maps straight onto a clamped offset, a swipe carries momentum that
 * decays each frame, and the arrows step a fixed distance. The scene pans in
 * lockstep, so content and scenery move as one.
 */
export default function Onboarding() {
  const navigate = useNavigate();
  const { hasAcknowledged } = useSettings();

  const trackRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<PixelSceneHandle>(null);
  const scroll = useRef(0);
  const velocity = useRef(0);
  const momentum = useRef<number | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const tween = useRef<number | null>(null);
  const [nearest, setNearest] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  const acknowledge = () => {
    saveSettings({ hasAcknowledged: true });
    navigate('/projects');
  };

  const maxScroll = useCallback(
    () => Math.max(1, (PANELS - 1) * window.innerWidth),
    [],
  );

  /** Write the current offset straight to the DOM and the canvas. */
  const paint = useCallback(() => {
    const max = maxScroll();
    scroll.current = Math.max(0, Math.min(max, scroll.current));
    if (trackRef.current) {
      trackRef.current.style.transform = `translate3d(${-scroll.current}px,0,0)`;
    }
    sceneRef.current?.setPan(scroll.current / max);
    setNearest(Math.round(scroll.current / window.innerWidth));
  }, [maxScroll]);

  const stopMomentum = useCallback(() => {
    if (momentum.current !== null) cancelAnimationFrame(momentum.current);
    momentum.current = null;
    if (tween.current !== null) cancelAnimationFrame(tween.current);
    tween.current = null;
  }, []);

  const runMomentum = useCallback(() => {
    const step = () => {
      if (Math.abs(velocity.current) <= MIN_VELOCITY) {
        momentum.current = null;
        return;
      }
      scroll.current += velocity.current;
      velocity.current *= FRICTION;
      paint();
      momentum.current = requestAnimationFrame(step);
    };
    momentum.current = requestAnimationFrame(step);
  }, [paint]);

  /** Dots and the CTA jump: ease to a panel instead of teleporting. */
  const glideTo = useCallback(
    (panel: number) => {
      stopMomentum();
      const target = Math.max(0, Math.min(maxScroll(), panel * window.innerWidth));
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        scroll.current = target;
        paint();
        return;
      }
      const from = scroll.current;
      const started = performance.now();
      const ms = 700;
      const step = (now: number) => {
        const t = Math.min(1, (now - started) / ms);
        const eased = 1 - Math.pow(1 - t, 3);
        scroll.current = from + (target - from) * eased;
        paint();
        if (t < 1) tween.current = requestAnimationFrame(step);
        else tween.current = null;
      };
      tween.current = requestAnimationFrame(step);
    },
    [maxScroll, paint, stopMomentum],
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    paint();
    const onResize = () => paint();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [paint]);

  useEffect(() => {
    if (isMobile) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stopMomentum();
      const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      scroll.current += delta * WHEEL_GAIN;
      paint();
    };

    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      if (['ArrowRight', 'ArrowDown', 'PageDown'].includes(e.key)) {
        e.preventDefault();
        stopMomentum();
        scroll.current += ARROW_STEP;
        paint();
      } else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        stopMomentum();
        scroll.current -= ARROW_STEP;
        paint();
      }
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      stopMomentum();
    };
  }, [isMobile, paint, stopMomentum]);

  const onTouchStart = (e: React.TouchEvent) => {
    stopMomentum();
    velocity.current = 0;
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!touch.current) return;
    const dx = touch.current.x - e.touches[0].clientX;
    const dy = touch.current.y - e.touches[0].clientY;
    const delta = Math.abs(dy) > Math.abs(dx) ? dy : dx;
    velocity.current = delta * WHEEL_GAIN;
    scroll.current += velocity.current;
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    paint();
  };

  const onTouchEnd = () => {
    touch.current = null;
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) runMomentum();
  };

  const index = nearest;
  const go = (dir: number) => glideTo(Math.max(0, Math.min(PANELS - 1, nearest + dir)));

  return (
    <div
      className="deck"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <PixelScene ref={sceneRef} />
      <SiteHeader
        right={
          hasAcknowledged ? (
            <button onClick={() => navigate('/projects')} className="hover:opacity-60">
              Projects
            </button>
          ) : null
        }
      />

      <div ref={trackRef} className="deck__track">
        {/* Panel 1 — the pitch */}
        <section className="deck__panel">
          <div className="deck__inner">
            <p className="eyebrow on-scene mb-5">Interview preparation</p>
            <h1 className="hero-title on-scene on-scene-lg">
              Recall writes <em className="italic">wrong</em> answers on purpose.
            </h1>
            <p className="hero-sub on-scene mt-6">
              You cannot recall the specifics of your own work under pressure. Asked what you
              accomplished, you produce a summary. Asked to correct someone, you produce the
              detail.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-4">
              <Button onClick={acknowledge}>I understand — the drafts are guesses</Button>
              <Button variant="outline" onClick={() => go(1)}>
                How it works
              </Button>
            </div>
          </div>
        </section>

        {/* Panel 2 — the mechanism */}
        <section className="deck__panel">
          <div className="deck__inner">
            <p className="eyebrow on-scene mb-5">The mechanism</p>
            <h2 className="deck__panel-title on-scene on-scene-lg">
              A specific wrong guess
              <br />
              beats a <em className="italic">vague</em> question.
            </h2>
            <div className="glass-card mt-8 text-left">
              <p className="answer-prose">
                Recall drafts an answer for every question and fills it with invented specifics —
                durations, counts, sequences, outcomes. They will often be wrong. That is the
                point. When you read{' '}
                <span className="token-unverified">
                  you cut the approval chain from seven weeks to four
                </span>{' '}
                and think <em>no, six weeks, and it was the finance handoff</em>, that correction
                is the real memory.
              </p>
            </div>
            <p className="hero-sub on-scene mt-6">
              The fabrication is scaffolding, not output. You correct it, and what is left is
              yours.
            </p>
          </div>
        </section>

        {/* Panel 3 — the limits */}
        <section className="deck__panel">
          <div className="deck__inner">
            <p className="eyebrow on-scene mb-5">The limits</p>
            <h2 className="deck__panel-title on-scene on-scene-lg">
              It never invents
              <br />
              what it cannot <em className="italic">know</em>.
            </h2>
            <div className="mt-9 flex flex-wrap justify-center gap-16">
              <div>
                <div className="stat-value">2–5</div>
                <div className="stat-label">INVENTED DETAILS PER ANSWER</div>
              </div>
              <div>
                <div className="stat-value">0</div>
                <div className="stat-label">LEAVE UNMARKED</div>
              </div>
              <div>
                <div className="stat-value">100%</div>
                <div className="stat-label">STAYS IN THIS BROWSER</div>
              </div>
            </div>
            <div className="mt-10 grid grid-cols-2 gap-6 text-left max-md:grid-cols-1">
              <div className="glass-card">
                <p className="eyebrow mb-3 opacity-70">Off limits</p>
                <p className="font-mono text-[13px] leading-relaxed">
                  Employers, titles, dates, degrees, certifications — and never words, conduct or
                  failures put in a named person's mouth. Those come from your resume or stay
                  blank.
                </p>
              </div>
              <div className="glass-card">
                <p className="eyebrow mb-3 opacity-70">Fair game</p>
                <p className="font-mono text-[13px] leading-relaxed">
                  Your own scope, actions, methods, counts, durations, sequences and outcomes —
                  every one of them marked until you say otherwise.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Panel 4 — what you leave with */}
        <section className="deck__panel">
          <div className="deck__inner">
            <p className="eyebrow on-scene mb-5">What you leave with</p>
            <h2 className="deck__panel-title on-scene on-scene-lg">
              Answers you can
              <br />
              actually <em className="italic">say</em>.
            </h2>
            <div className="mt-8 grid grid-cols-2 gap-6 text-left max-md:grid-cols-1">
              <div className="glass-card">
                <p className="font-serif text-[17px]">A verified answer per question</p>
                <p className="mt-2 font-mono text-[13px] leading-relaxed opacity-80">
                  Every invented span confirmed, corrected or cut by you.
                </p>
              </div>
              <div className="glass-card">
                <p className="font-serif text-[17px]">A coaching note that names the mechanism</p>
                <p className="mt-2 font-mono text-[13px] leading-relaxed opacity-80">
                  Two sentences on what makes the answer land, and where people trail off.
                </p>
              </div>
              <div className="glass-card">
                <p className="font-serif text-[17px]">Drill mode with a timer</p>
                <p className="mt-2 font-mono text-[13px] leading-relaxed opacity-80">
                  Answer hidden, clock running, thresholds at 60 and 90 seconds.
                </p>
              </div>
              <div className="glass-card">
                <p className="font-serif text-[17px]">An export with its receipts</p>
                <p className="mt-2 font-mono text-[13px] leading-relaxed opacity-80">
                  Markdown, Word or print, each carrying what you corrected beside the original
                  guess.
                </p>
              </div>
            </div>
            <div className="mt-10 flex justify-center">
              <Button onClick={acknowledge}>I understand — the drafts are guesses</Button>
            </div>
          </div>
        </section>
      </div>

      {!isMobile ? (
        <>
          <div className="deck__progress">
            {PANEL_LABELS.map((label, i) => (
              <button
                key={label}
                className={cn('deck__dot', i === index && 'deck__dot--active')}
                aria-label={`Go to ${label}`}
                onClick={() => glideTo(i)}
              />
            ))}
          </div>
          <div className="deck__hint">
            {index < PANELS - 1 ? 'scroll to explore →' : '← back'}
          </div>
        </>
      ) : null}
    </div>
  );
}
