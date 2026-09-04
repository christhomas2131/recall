import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';

/*
 * The pixel-art panorama, drawn rather than shipped as an image.
 *
 * Same design as the tokens& site it is modelled on: a pixel grid sized from
 * the viewport, a world three screens wide, and procedural generators for the
 * scenery. `pan` (0..1) walks the world from the bridge, past the city, to the
 * houses and hills.
 *
 * Colours are sampled from the original plate (see public/images/hero-bridge.png).
 */

const P = {
  skyTop: [135, 175, 214],
  skyUpper: [160, 183, 212],
  skyMid: [189, 193, 210],
  horizon: [223, 203, 187],
  haze: [241, 208, 173],
} as const;

const SUN = '#fceaa8';
const SUN_GLOW = 'rgba(252,234,168,0.28)';
const CLOUD = '#fefeff';
const BRIDGE = '#be4b32';
const BRIDGE_DARK = '#9d3d29';
const SPAN = '#d5a07e';
const WATER = '#4d75a9';
const WATER_LIGHT = '#5b7ca5';
const WATER_FOAM = '#7c9fc4';

const TOWERS = ['#b9c4cf', '#c6cfd8', '#aab7c4', '#d2d8dd'];
const HOUSE_BODIES = ['#e8b7bd', '#d8c9a8', '#bcd0bb', '#b9c6de', '#cdbcd6', '#eae2d0'];
const HOUSE_ROOFS = ['#8f6f74', '#7f7460', '#6f8470', '#6d7a92', '#7d6f88', '#8a8272'];
const HILL = '#7d9c68';
const HILL_DARK = '#6b8a58';
const GRASS = '#8fae74';

/** Deterministic noise so the scene is identical across redraws and reloads. */
function rand(seed: number): number {
  const t = Math.sin(seed * 127.1) * 43758.5453;
  return t - Math.floor(t);
}

function lerp(a: readonly number[], b: readonly number[], t: number): string {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export interface PixelSceneHandle {
  /** Repaint at a new pan without a React render. Used by the scroll loop. */
  setPan: (pan: number) => void;
}

export const PixelScene = forwardRef<
  PixelSceneHandle,
  {
    /** 0 = bridge, 0.5 = city, 1 = houses and hills. */
    pan?: number;
    /** 0..1 wash over the whole scene, for screens carrying dense text. */
    dim?: number;
    className?: string;
  }
>(function PixelScene({ pan = 0, dim = 0, className }, handle) {
  const ref = useRef<HTMLCanvasElement>(null);
  const panRef = useRef(pan);
  panRef.current = pan;

  const draw = useCallback(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Their pixel grid: coarser on big screens, never below 4px.
    const px = Math.max(4, Math.min(8, Math.floor(W / 200)));
    const snap = (v: number) => Math.round(v / px) * px;
    const rect = (x: number, y: number, w: number, h: number, fill: string) => {
      ctx.fillStyle = fill;
      ctx.fillRect(snap(x), snap(y), Math.max(px, snap(w)), Math.max(px, snap(h)));
    };

    const world = W * 3;
    const offset = panRef.current * (world - W);
    const sea = snap(H * 0.78);
    const deck = snap(H * 0.72);

    /* ---------------------------------------------------------- sky --- */
    for (let y = 0; y < sea; y += px) {
      const t = y / sea;
      let fill: string;
      if (t < 0.28) fill = lerp(P.skyTop, P.skyUpper, t / 0.28);
      else if (t < 0.56) fill = lerp(P.skyUpper, P.skyMid, (t - 0.28) / 0.28);
      else if (t < 0.82) fill = lerp(P.skyMid, P.horizon, (t - 0.56) / 0.26);
      else fill = lerp(P.horizon, P.haze, (t - 0.82) / 0.18);
      ctx.fillStyle = fill;
      ctx.fillRect(0, y, W, px + 1);
    }

    /* ---------------------------------------------------------- sun --- */
    const sunX = W * 0.22 - offset * 0.25; // parallax: the sun barely moves
    const sunY = H * 0.42;
    if (sunX > -H && sunX < W + H) {
      for (let r = 11; r > 0; r--) {
        ctx.fillStyle = r > 4 ? SUN_GLOW : SUN;
        const s = r * px * 1.5;
        ctx.globalAlpha = r > 4 ? 0.1 : 1;
        ctx.beginPath();
        ctx.arc(snap(sunX), snap(sunY), s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    /* ------------------------------------------------------- clouds --- */
    for (let i = 0; i < 14; i++) {
      const cx = (rand(i * 3.7) * world - offset * 0.45 + world) % world;
      if (cx < -260 || cx > W + 260) continue;
      const cy = H * (0.05 + rand(i * 9.1) * 0.22);
      const puffs = 3 + Math.floor(rand(i * 5.5) * 3);
      for (let p = 0; p < puffs; p++) {
        const w = px * (7 + Math.floor(rand(i * 2.3 + p) * 9));
        const h = px * (2 + Math.floor(rand(i * 4.1 + p) * 2));
        rect(cx + p * px * 6, cy + rand(i + p) * px * 2, w, h, CLOUD);
      }
    }

    /* -------------------------------------------------------- water --- */
    for (let y = sea; y < H; y += px) {
      const t = (y - sea) / Math.max(1, H - sea);
      ctx.fillStyle = t < 0.5 ? WATER_LIGHT : WATER;
      ctx.fillRect(0, y, W, px + 1);
    }
    for (let i = 0; i < 90; i++) {
      const wx = (rand(i * 1.7) * world - offset * 0.85 + world) % world;
      if (wx < -80 || wx > W + 80) continue;
      const wy = sea + rand(i * 6.1) * (H - sea) * 0.8;
      rect(wx, wy, px * (2 + Math.floor(rand(i * 8.3) * 5)), px, WATER_FOAM);
    }

    /* ------------------------------------------ region 1: the bridge --- */
    const bx = -offset; // bridge occupies world 0..W
    if (bx > -W * 1.4 && bx < W) {
      const towerX = bx + W * 0.34;
      const capY = H * 0.34;

      // Suspension cable: a parabola sagging from the tower to each side.
      for (let x = 0; x < W * 1.15; x += px) {
        const d = (x - W * 0.34) / (W * 0.62);
        const y = capY + Math.pow(Math.abs(d), 1.7) * H * 0.3;
        const sx = bx + x;
        if (sx < -px || sx > W) continue;
        rect(sx, Math.min(y, deck), px, px, BRIDGE);
        // Vertical hangers down to the deck.
        if (Math.round(x / px) % 5 === 0) {
          const top = Math.min(y, deck);
          for (let hy = top; hy < deck; hy += px) rect(sx, hy, px * 0.7, px, SPAN);
        }
      }

      // Roadway.
      rect(bx - px, deck, W * 1.2, px * 1.6, BRIDGE);
      rect(bx - px, deck + px * 1.6, W * 1.2, px, BRIDGE_DARK);

      // Tower.
      if (towerX > -px * 8 && towerX < W + px * 8) {
        rect(towerX, capY - px * 2, px * 3.2, sea - capY + px * 2, BRIDGE);
        rect(towerX - px * 1.2, capY - px * 3, px * 5.6, px * 2, BRIDGE);
        for (let cy = capY + px * 4; cy < deck; cy += px * 7) {
          rect(towerX, cy, px * 3.2, px, BRIDGE_DARK);
        }
      }
    }

    /* ----------------------------------------- region 2: the skyline --- */
    const cityX = W - offset;
    if (cityX > -W * 1.6 && cityX < W * 1.2) {
      for (let i = 0; i < 34; i++) {
        const gx = cityX + i * (W / 26) + rand(i * 3.1) * px * 3;
        if (gx < -px * 20 || gx > W + px * 20) continue;
        const bw = px * (5 + Math.floor(rand(i * 7.7) * 7));
        const bh = H * (0.08 + rand(i * 2.9) * 0.2);
        const tone = TOWERS[i % TOWERS.length];
        rect(gx, sea - bh, bw, bh, tone);
        // A single landmark spire, as in the original.
        if (i === 11) {
          rect(gx + bw * 0.3, sea - bh - H * 0.14, px * 2, H * 0.14, tone);
          rect(gx + bw * 0.3, sea - bh - H * 0.18, px, H * 0.04, tone);
        }
        for (let wy = sea - bh + px * 2; wy < sea - px * 2; wy += px * 3) {
          for (let wx2 = gx + px; wx2 < gx + bw - px; wx2 += px * 3) {
            if (rand(wx2 * wy) > 0.45) rect(wx2, wy, px, px, '#e3e9ee');
          }
        }
      }
      // Sailboats on the water.
      for (let i = 0; i < 3; i++) {
        const sx = cityX + W * (0.25 + i * 0.28);
        if (sx < -px * 8 || sx > W + px * 8) continue;
        const sy = sea + px * (3 + i * 2);
        rect(sx, sy - px * 5, px, px * 5, '#3f4a55');
        rect(sx + px, sy - px * 4, px * 3, px * 4, CLOUD);
        rect(sx - px, sy, px * 6, px, BRIDGE);
      }
    }

    /* ------------------------------ region 3: painted ladies + hills --- */
    const homeX = W * 2 - offset;
    if (homeX > -W * 1.6 && homeX < W * 1.2) {
      // Hills behind.
      for (let i = 0; i < 3; i++) {
        const hx = homeX + W * (0.35 + i * 0.3);
        const hw = W * 0.5;
        const hh = H * (0.12 + i * 0.05);
        for (let x = 0; x < hw; x += px) {
          const t = x / hw;
          const y = sea - hh * Math.sin(t * Math.PI);
          const sx = hx + x;
          if (sx < -px || sx > W) continue;
          rect(sx, y, px, sea - y, i % 2 ? HILL_DARK : HILL);
        }
      }

      // Ground for the row — scoped to this region so it cannot reach the city,
      // and laid down first so the houses stand on it rather than under it.
      rect(homeX, deck + px * 2, W * 1.6, sea - deck, GRASS);

      // The row of houses.
      for (let i = 0; i < 9; i++) {
        const hx = homeX + i * px * 15;
        if (hx < -px * 20 || hx > W + px * 20) continue;
        const bodyH = px * (14 + Math.floor(rand(i * 5.3) * 5));
        const bw = px * 13;
        const top = deck - bodyH + px * 4;
        const body = HOUSE_BODIES[i % HOUSE_BODIES.length];
        const roof = HOUSE_ROOFS[i % HOUSE_ROOFS.length];

        rect(hx, top, bw, bodyH, body);
        // Gabled roof.
        for (let r = 0; r < 5; r++) {
          rect(hx + r * px, top - (5 - r) * px, bw - r * px * 2, px, roof);
        }
        // Windows, two floors.
        for (let f = 0; f < 2; f++) {
          for (let wcol = 0; wcol < 3; wcol++) {
            rect(hx + px * (2 + wcol * 4), top + px * (3 + f * 6), px * 2, px * 3, '#f6f4ee');
            rect(hx + px * (2 + wcol * 4), top + px * (3 + f * 6), px * 2, px, roof);
          }
        }
        // Stoop.
        rect(hx + px * 5, deck - px * 2, px * 3, px * 2, '#f6f4ee');
      }
    }

    /* --------------------------------------------------------- wash --- */
    if (dim > 0) {
      ctx.fillStyle = `rgba(208, 220, 230, ${dim})`;
      ctx.fillRect(0, 0, W, H);
    }
  }, [dim]);

  useEffect(() => {
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [draw]);

  useEffect(() => {
    draw();
  }, [pan, draw]);

  useImperativeHandle(
    handle,
    () => ({
      setPan(next: number) {
        panRef.current = next;
        if (ref.current) ref.current.dataset.scenePan = String(next);
        draw();
      },
    }),
    [draw],
  );

  return (
    <canvas
      ref={ref}
      aria-hidden
      data-scene-pan={pan}
      className={className ?? 'pointer-events-none fixed inset-0 z-0'}
    />
  );
});
