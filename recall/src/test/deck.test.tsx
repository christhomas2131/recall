import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '@/App';
import { DEFAULT_SETTINGS, saveSettings } from '@/db/hooks';

const W = () => window.innerWidth;

function track() {
  return document.querySelector('.deck__track') as HTMLElement;
}
function scene() {
  return document.querySelector('[data-scene-pan]') as HTMLElement;
}
function offset(): number {
  const m = /translate3d\((-?[\d.]+)px/.exec(track().style.transform);
  // `+ 0` normalises -0, which toBe treats as distinct from 0.
  return m ? -Number(m[1]) + 0 : 0;
}
function wheel(deltaY: number) {
  window.dispatchEvent(new WheelEvent('wheel', { deltaY, cancelable: true }));
}

beforeEach(() => {
  saveSettings({ ...DEFAULT_SETTINGS, hasAcknowledged: false });
  window.history.pushState({}, '', '/onboarding');
});

describe('the deck scrolls continuously', () => {
  it('starts at the beginning with all four panels present', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: /writes wrong answers on purpose/i });
    expect(document.querySelectorAll('.deck__panel')).toHaveLength(4);
    expect(offset()).toBe(0);
    expect(scene().dataset.scenePan).toBe('0');
  }, 30000);

  it('maps wheel delta straight onto the offset, with no snapping', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: /writes wrong answers on purpose/i });

    wheel(50);
    // Gain of 2, and it lands wherever it lands — not on a panel boundary.
    await waitFor(() => expect(offset()).toBe(100));
    expect(offset() % W()).not.toBe(0);

    wheel(30);
    await waitFor(() => expect(offset()).toBe(160));
  }, 30000);

  it('pans the scene in lockstep with the scroll', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: /writes wrong answers on purpose/i });

    const max = 3 * W();
    wheel(max / 2);
    await waitFor(() => expect(Number(scene().dataset.scenePan)).toBeCloseTo(1, 5));
  }, 30000);

  it('clamps at both ends', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: /writes wrong answers on purpose/i });

    wheel(-5000);
    await waitFor(() => expect(offset()).toBe(0));

    wheel(999999);
    await waitFor(() => expect(offset()).toBe(3 * W()));
    expect(scene().dataset.scenePan).toBe('1');
  }, 30000);

  it('steps a fixed distance on the arrow keys', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: /writes wrong answers on purpose/i });

    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(offset()).toBe(400));
    await user.keyboard('{ArrowLeft}');
    await waitFor(() => expect(offset()).toBe(0));
  }, 30000);

  it('glides to a panel from its dot', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: /writes wrong answers on purpose/i });

    await user.click(screen.getByRole('button', { name: 'Go to Output' }));
    await waitFor(() => expect(offset()).toBe(3 * W()), { timeout: 8000, interval: 50 });
  }, 30000);
});
