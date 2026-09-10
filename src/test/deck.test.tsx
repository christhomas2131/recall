import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '@/App';
import { DEFAULT_SETTINGS, saveSettings } from '@/db/hooks';

function track() {
  return document.querySelector('.deck__track') as HTMLElement;
}
function activeDotLabel() {
  return document
    .querySelector('.deck__dot--active')
    ?.getAttribute('aria-label');
}

beforeEach(() => {
  saveSettings({ ...DEFAULT_SETTINGS, hasAcknowledged: false });
  window.history.pushState({}, '', '/onboarding');
});

describe('the sliding deck', () => {
  it('starts on the first panel with all four rendered', async () => {
    render(<App />);
    await screen.findByRole('heading', { name: /writes wrong answers on purpose/i });

    expect(document.querySelectorAll('.deck__panel')).toHaveLength(4);
    expect(track()).toHaveStyle({ transform: 'translateX(-0vw)' });
    expect(activeDotLabel()).toBe('Go to Intro');
    expect(document.querySelector('.deck__hint')?.textContent).toContain('scroll to explore');
  }, 30000);

  it('advances a panel on ArrowRight and goes back on ArrowLeft', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: /writes wrong answers on purpose/i });

    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(track()).toHaveStyle({ transform: 'translateX(-100vw)' }));
    expect(activeDotLabel()).toBe('Go to Mechanism');

    // Their 850ms lock swallows anything sent during the transition.
    await new Promise((r) => setTimeout(r, 900));

    await user.keyboard('{ArrowLeft}');
    await waitFor(() => expect(track()).toHaveStyle({ transform: 'translateX(-0vw)' }));
    expect(activeDotLabel()).toBe('Go to Intro');
  }, 30000);

  it('jumps straight to a panel from its dot', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: /writes wrong answers on purpose/i });

    await user.click(screen.getByRole('button', { name: 'Go to Output' }));
    await waitFor(() => expect(track()).toHaveStyle({ transform: 'translateX(-300vw)' }));
    expect(activeDotLabel()).toBe('Go to Output');
  }, 30000);

  it('does not run past either end', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: /writes wrong answers on purpose/i });

    await user.keyboard('{ArrowLeft}');
    expect(track()).toHaveStyle({ transform: 'translateX(-0vw)' });

    await user.click(screen.getByRole('button', { name: 'Go to Output' }));
    await waitFor(() => expect(track()).toHaveStyle({ transform: 'translateX(-300vw)' }));
    await new Promise((r) => setTimeout(r, 900));

    await user.keyboard('{ArrowRight}');
    expect(track()).toHaveStyle({ transform: 'translateX(-300vw)' });
  }, 30000);

  it('the "How it works" button walks to the next panel', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: /writes wrong answers on purpose/i });

    await user.click(screen.getByRole('button', { name: /How it works/i }));
    await waitFor(() => expect(track()).toHaveStyle({ transform: 'translateX(-100vw)' }));
  }, 30000);
});

describe('the scene pans with the deck', () => {
  function bridge() {
    return document.querySelector('.bridge') as HTMLElement;
  }

  it('travels along the span as panels advance', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: /writes wrong answers on purpose/i });

    expect(bridge()).toHaveClass('bridge--pan');
    expect(bridge().style.getPropertyValue('--pan')).toBe('0%');

    await user.click(screen.getByRole('button', { name: 'Go to Mechanism' }));
    await waitFor(() =>
      expect(bridge().style.getPropertyValue('--pan')).toBe(`${(1 / 3) * 100}%`),
    );

    await user.click(screen.getByRole('button', { name: 'Go to Output' }));
    await waitFor(() => expect(bridge().style.getPropertyValue('--pan')).toBe('100%'));
  }, 30000);
});
