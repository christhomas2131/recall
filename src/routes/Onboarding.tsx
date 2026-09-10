import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { BridgeBackdrop, SiteHeader } from '@/components/Shell';
import { saveSettings, useSettings } from '@/db/hooks';
import { cn } from '@/lib/utils';

const PANELS = 4;
const PANEL_LABELS = ['Intro', 'Mechanism', 'Limits', 'Output'];

/**
 * Their sliding home deck: four panels tracking horizontally over the fixed
 * pixel-art scene, driven by the wheel, arrow keys, the dots or a swipe.
 * Falls back to a stacked vertical scroll at 768px, as theirs does.
 */
export default function Onboarding() {
  const navigate = useNavigate();
  const { hasAcknowledged } = useSettings();

  const [index, setIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const lockRef = useRef(false);
  const accumRef = useRef(0);
  const touchStartRef = useRef<number | null>(null);

  const acknowledge = () => {
    saveSettings({ hasAcknowledged: true });
    navigate('/');
  };

  const go = useCallback((dir: number) => {
    setIndex((i) => Math.min(PANELS - 1, Math.max(0, i + dir)));
  }, []);

  const lock = useCallback(() => {
    lockRef.current = true;
    window.setTimeout(() => {
      lockRef.current = false;
    }, 850);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (isMobile) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (lockRef.current) return;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      accumRef.current += delta;
      if (Math.abs(accumRef.current) > 40) {
        go(accumRef.current > 0 ? 1 : -1);
        accumRef.current = 0;
        lock();
      }
    };

    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      if (lockRef.current) return;
      if (['ArrowRight', 'ArrowDown', 'PageDown'].includes(e.key)) {
        go(1);
        lock();
      } else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) {
        go(-1);
        lock();
      }
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, [isMobile, go, lock]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (isMobile || touchStartRef.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current;
    if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
    touchStartRef.current = null;
  };

  return (
    <div className="deck" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <BridgeBackdrop variant="hero" pan={index / (PANELS - 1)} />
      <SiteHeader
        right={
          hasAcknowledged ? (
            <button onClick={() => navigate('/')} className="hover:opacity-60">
              Projects
            </button>
          ) : null
        }
      />

      <div
        className="deck__track"
        style={isMobile ? undefined : { transform: `translateX(-${index * 100}vw)` }}
      >
        {/* Panel 1 — the pitch */}
        <section className="deck__panel">
          <div className="deck__inner">
            <p className="eyebrow mb-5 opacity-70">Interview preparation</p>
            <h1 className="hero-title">
              Recall writes <em className="italic">wrong</em> answers on purpose.
            </h1>
            <p className="hero-sub mt-6">
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
            <p className="eyebrow mb-5 opacity-70">The mechanism</p>
            <h2 className="deck__panel-title">
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
            <p className="hero-sub mt-6">
              The fabrication is scaffolding, not output. You correct it, and what is left is
              yours.
            </p>
          </div>
        </section>

        {/* Panel 3 — the limits */}
        <section className="deck__panel">
          <div className="deck__inner">
            <p className="eyebrow mb-5 opacity-70">The limits</p>
            <h2 className="deck__panel-title">
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
            <p className="eyebrow mb-5 opacity-70">What you leave with</p>
            <h2 className="deck__panel-title">
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
                onClick={() => setIndex(i)}
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
