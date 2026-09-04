import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

// jsdom does not implement these; Radix and the app touch them.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// Vitest globals are off, so React Testing Library's auto-cleanup never
// registers. Do it explicitly or renders stack up across tests.
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);
