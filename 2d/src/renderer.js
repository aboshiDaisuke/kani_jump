import { CRAB, OBSTACLE_SPECS } from './config.js';
import { clamp, rgb, sampleStagePalette } from './logic.js';

const STARS = Array.from({ length: 64 }, (_, i) => ({
  x: ((i * 197.3) % 1000) / 1000,
  y: ((i * 83.7) % 1000) / 1000 * 0.58,
  r: 1.0 + (i % 3) * 0.75,
  twinkle: i * 1.43,
}));

const CLOUDS = Array.from({ length: 7 }, (_, i) => ({
  x: i * 225 + (i % 2) * 58,
  y: 44 + (i % 3) * 44,
  scale: 0.78 + (i % 4) * 0.2,
}));

const FAR_BUILDINGS = Array.from({ length: 18 }, (_, i) => ({
  w: 50 + ((i * 29) % 54),
  h: 68 + ((i * 47) % 112),
  roof: i % 4 === 0 ? 'sloped' : i % 5 === 2 ? 'tank' : 'flat',
  hasTower: i === 5,
  hasFerris: i === 13,
  windows: 2 + (i % 3),
}));

const MID_BUILDINGS = Array.from({ length: 12 }, (_, i) => ({
  w: 78 + ((i * 37) % 62),
  h: 52 + ((i * 31) % 68),
  isShop: i % 2 === 0,
  awningColor: ['#ef4444', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899'][i % 5],
  neonText: i % 3 === 0 ? ['カニ', 'CAFÉ', 'うみ', 'BAR'][i % 4] : null,
  neonColor: ['#f472b6', '#38bdf8', '#fde047', '#4ade80'][i % 4],
  hasVending: i % 4 === 1,
}));

const AMBIENT_MOTES = Array.from({ length: 24 }, (_, i) => ({
  seedX: (i * 137.5) % 1000,
  seedY: (i * 73.1) % 420,
  speedX: 22 + (i % 5) * 11,
  speedY: 16 + (i % 4) * 9,
  size: 3 + (i % 3) * 1.8,
  phase: i * 0.9,
}));

function roundRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function drawStarShape(ctx, cx, cy, spikes, outerR, innerR) {
  let rot = -Math.PI / 2;
  const step = Math.PI / spikes;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const x = cx + Math.cos(rot) * r;
    const y = cy + Math.sin(rot) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    rot += step;
  }
  ctx.closePath();
}

function drawHeartShape(ctx, cx, cy, size) {
  ctx.beginPath();
  const topY = cy - size * 0.35;
  ctx.moveTo(cx, cy + size * 0.72);
  ctx.bezierCurveTo(cx - size * 1.15, cy + size * 0.05, cx - size * 0.95, topY - size * 0.55, cx, topY + size * 0.15);
  ctx.bezierCurveTo(cx + size * 0.95, topY - size * 0.55, cx + size * 1.15, cy + size * 0.05, cx, cy + size * 0.72);
  ctx.closePath();
}

export class GameRenderer {
  constructor(canvas, crabImg) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.crabImg = crabImg;
    this.dpr = 1;
    this.viewW = 800;
    this.viewH = 520;
    this.groundY = 415;
    this.scale = 1;
  }

  resize(cssW, cssH) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(cssW * this.dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * this.dpr));

    const aspect = cssW / Math.max(1, cssH);
    if (aspect < 0.85) {
      this.scale = cssW / 520;
      this.viewW = 520;
      this.viewH = cssH / this.scale;
      this.groundY = Math.round(this.viewH * 0.67);
    } else {
      const targetH = 520;
      this.scale = Math.min(cssW / 640, cssH / targetH);
      this.viewW = cssW / this.scale;
      this.viewH = cssH / this.scale;
      this.groundY = Math.round(this.viewH - 104);
    }

    return {
      viewW: this.viewW,
      viewH: this.viewH,
      groundY: this.groundY,
      playerX: clamp(Math.round(this.viewW * 0.2), 92, 188),
    };
  }

  render(state) {
    const ctx = this.ctx;
    const { viewW, viewH, groundY } = this;
    const pal = sampleStagePalette(state.stageBlend);

    ctx.save();
    ctx.scale(this.dpr * this.scale, this.dpr * this.scale);

    // Subtle dynamic camera pan upward when soaring high on springboard sky routes!
    const camY = state.camY || 0;
    const shakeX = state.shakeMag > 0.2 ? (Math.random() * 2 - 1) * state.shakeMag : 0;
    const shakeY = state.shakeMag > 0.2 ? (Math.random() * 2 - 1) * state.shakeMag : 0;

    // Sky fills full screen regardless of camY
    this._drawSky(ctx, viewW, groundY + camY, pal, state.time);

    ctx.save();
    ctx.translate(shakeX, camY + shakeY);

    this._drawOceanAndMountains(ctx, viewW, groundY, pal, state.scrollDist, state.time);
    this._drawFarCity(ctx, viewW, groundY, pal, state.scrollDist, state.time);
    this._drawMidCity(ctx, viewW, groundY, pal, state.scrollDist, state.time);
    this._drawRoadAndCrosswalk(ctx, viewW, viewH + 140, groundY, pal, state);

    for (const c of state.collectibles) {
      if (!c.collected) this._drawCollectible(ctx, c, groundY, state.time);
    }

    for (const ob of state.obstacles) {
      this._drawObstacle(ctx, ob, groundY, pal, state.time);
    }

    this._drawCrab(ctx, state, groundY);
    this._drawParticles(ctx, state.particles, groundY);
    this._drawPopups(ctx, state.popups, groundY);

    ctx.restore();

    // Ambient biome particles (petals / embers / fireflies / stardust)
    this._drawAmbientMotes(ctx, viewW, viewH, pal, state.time);

    // Danger Telegraph indicators on right edge for fast incoming hazards
    if (state.phase === 'playing') {
      this._drawTelegraphs(ctx, state, viewW, groundY + camY);
    }

    // Fever or Rush speed lines + rainbow vignette
    if (state.feverTimer > 0 || state.rushState === 'active') {
      this._drawSpeedLines(ctx, viewW, viewH, state.time, state.feverTimer > 0);
    }

    // Screen flashes (damage red or stage-clear gold)
    if (state.damageFlash > 0) {
      ctx.fillStyle = `rgba(239, 68, 68, ${state.damageFlash * 0.36})`;
      ctx.fillRect(0, 0, viewW, viewH);
    }
    if (state.celebrationFlash > 0) {
      ctx.fillStyle = `rgba(254, 240, 138, ${state.celebrationFlash * 0.32})`;
      ctx.fillRect(0, 0, viewW, viewH);
    }

    ctx.restore();
  }

  _drawSky(ctx, viewW, horizonY, pal, time) {
    const grad = ctx.createLinearGradient(0, 0, 0, horizonY);
    grad.addColorStop(0, rgb(pal.skyTop));
    grad.addColorStop(0.55, rgb(pal.skyMid));
    grad.addColorStop(1, rgb(pal.skyBot));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, viewW, horizonY + 80);

    // Volumetric warm sunbeams radiating seamlessly from the sun center
    const sunX = viewW * 0.78;
    const sunY = Math.max(60, horizonY * 0.22 + Math.sin(pal.phase * 1.1) * 24);
    if (pal.starAlpha < 0.45) {
      const beamAlpha = (1 - pal.starAlpha / 0.45) * 0.12;
      ctx.save();
      for (let i = 0; i < 5; i++) {
        const angle = 1.18 + i * 0.22 + Math.sin(time * 0.35 + i) * 0.04;
        const spread = 0.085;
        const len = horizonY * 1.35;
        const bGrad = ctx.createRadialGradient(sunX, sunY, 18, sunX, sunY, len);
        bGrad.addColorStop(0, `rgba(255, 250, 220, ${beamAlpha * 1.5})`);
        bGrad.addColorStop(0.55, `rgba(255, 250, 220, ${beamAlpha * 0.55})`);
        bGrad.addColorStop(1, 'rgba(255, 250, 220, 0)');
        ctx.fillStyle = bGrad;
        ctx.beginPath();
        ctx.moveTo(sunX, sunY);
        ctx.lineTo(sunX + Math.cos(angle - spread) * len, sunY + Math.sin(angle - spread) * len);
        ctx.lineTo(sunX + Math.cos(angle + spread) * len, sunY + Math.sin(angle + spread) * len);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // Flowing Aurora ribbons in Stage 4!
    if (pal.auroraAlpha > 0.04) {
      ctx.save();
      ctx.globalAlpha = pal.auroraAlpha * 0.45;
      for (let band = 0; band < 3; band++) {
        const baseY = 54 + band * 34;
        const gradA = ctx.createLinearGradient(0, baseY - 26, 0, baseY + 52);
        const hue = (145 + band * 58 + Math.sin(time * 0.4) * 20) % 360;
        gradA.addColorStop(0, `hsla(${hue}, 95%, 65%, 0)`);
        gradA.addColorStop(0.45, `hsla(${hue}, 95%, 65%, 0.65)`);
        gradA.addColorStop(1, `hsla(${(hue + 50) % 360}, 95%, 60%, 0)`);
        ctx.fillStyle = gradA;
        ctx.beginPath();
        ctx.moveTo(0, baseY + 45);
        for (let x = 0; x <= viewW + 40; x += 40) {
          const wy = baseY + Math.sin(x * 0.009 + time * (0.9 + band * 0.25) + band) * 20;
          ctx.lineTo(x, wy);
        }
        ctx.lineTo(viewW, baseY + 65);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // Twinkling stars + occasional shooting star at dusk/night
    if (pal.starAlpha > 0.02) {
      for (const s of STARS) {
        const tw = 0.48 + 0.52 * Math.sin(time * 3.1 + s.twinkle);
        ctx.fillStyle = `rgba(255, 255, 240, ${pal.starAlpha * tw})`;
        ctx.beginPath();
        ctx.arc(s.x * viewW, s.y * horizonY, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Periodic shooting star every 5.5s
      const shootCycle = time % 5.5;
      if (shootCycle < 0.65 && pal.starAlpha > 0.5) {
        const p = shootCycle / 0.65;
        const sx = viewW * (0.88 - p * 0.45);
        const sy = horizonY * (0.1 + p * 0.26);
        const alpha = Math.sin(p * Math.PI) * pal.starAlpha;
        const sg = ctx.createLinearGradient(sx, sy, sx + 72, sy - 34);
        sg.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
        sg.addColorStop(1, 'rgba(186, 230, 253, 0)');
        ctx.strokeStyle = sg;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + 72, sy - 34);
        ctx.stroke();
      }
    }

    // Sun / Crescent Moon (uses sunX, sunY computed above)
    const sunR = pal.starAlpha > 0.55 ? 25 : 32;
    const glow = ctx.createRadialGradient(sunX, sunY, sunR * 0.3, sunX, sunY, sunR * 3.4);
    glow.addColorStop(0, rgb(pal.sunColor, 0.75));
    glow.addColorStop(0.45, rgb(pal.sunColor, 0.22));
    glow.addColorStop(1, rgb(pal.sunColor, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 3.4, 0, Math.PI * 2);
    ctx.fill();

    if (pal.starAlpha > 0.65) {
      ctx.save();
      ctx.translate(sunX, sunY);
      ctx.rotate(-0.35);
      ctx.fillStyle = rgb(pal.sunColor);
      ctx.beginPath();
      ctx.arc(0, 0, sunR, 0.32 * Math.PI, 1.68 * Math.PI, false);
      ctx.quadraticCurveTo(-sunR * 0.12, 0, Math.cos(0.32 * Math.PI) * sunR, Math.sin(0.32 * Math.PI) * sunR);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = rgb(pal.sunColor);
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Shaded multi-puff clouds
    const span = viewW + 340;
    const cloudAlpha = 0.88 - pal.starAlpha * 0.38;
    for (const c of CLOUDS) {
      const cx = (((c.x - time * 16 * c.scale) % span) + span) % span - 150;
      const cy = Math.min(c.y, horizonY * 0.44);
      const sc = c.scale;

      // Underside shade
      ctx.fillStyle = rgb(pal.cloudShade, cloudAlpha);
      ctx.beginPath();
      ctx.arc(cx + 2, cy + 5 * sc, 19 * sc, 0, Math.PI * 2);
      ctx.arc(cx + 24 * sc, cy + 2 * sc, 23 * sc, 0, Math.PI * 2);
      ctx.arc(cx + 46 * sc, cy + 4 * sc, 18 * sc, 0, Math.PI * 2);
      ctx.fill();

      // Sunlit cloud puffs
      ctx.fillStyle = rgb(pal.cloudTop, cloudAlpha);
      ctx.beginPath();
      ctx.arc(cx, cy, 19 * sc, 0, Math.PI * 2);
      ctx.arc(cx + 22 * sc, cy - 8 * sc, 24 * sc, 0, Math.PI * 2);
      ctx.arc(cx + 46 * sc, cy - 2 * sc, 17 * sc, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawOceanAndMountains(ctx, viewW, groundY, pal, scrollDist, time) {
    const seaTop = groundY - 72;

    // Distant coastal mountain silhouette
    const mSpan = 420;
    const mOff = (scrollDist * 0.06) % mSpan;
    ctx.fillStyle = rgb(pal.mountain, 0.72);
    ctx.beginPath();
    ctx.moveTo(-mSpan, seaTop + 10);
    for (let x = -mOff - mSpan; x < viewW + mSpan; x += mSpan) {
      ctx.quadraticCurveTo(x + 95, seaTop - 58, x + 210, seaTop - 16);
      ctx.quadraticCurveTo(x + 315, seaTop - 78, x + 420, seaTop + 6);
    }
    ctx.lineTo(viewW + mSpan, seaTop + 30);
    ctx.lineTo(-mSpan, seaTop + 30);
    ctx.closePath();
    ctx.fill();

    // Shimmering coastal ocean bay behind the town
    const seaGrad = ctx.createLinearGradient(0, seaTop, 0, groundY - 20);
    seaGrad.addColorStop(0, rgb(pal.oceanTop));
    seaGrad.addColorStop(1, rgb(pal.oceanBot));
    ctx.fillStyle = seaGrad;
    ctx.fillRect(0, seaTop, viewW, 54);

    // Animated sun/moon glints on water!
    const glintX = viewW * 0.78;
    ctx.fillStyle = rgb(pal.sunColor, 0.55);
    for (let row = 0; row < 4; row++) {
      const wy = seaTop + 7 + row * 10;
      const spread = 26 + row * 22;
      const w = Math.max(8, 28 - row * 4);
      const shift = Math.sin(time * 3.5 + row * 1.7) * 10;
      ctx.fillRect(glintX - spread * 0.5 + shift, wy, w, 2.4);
      ctx.fillRect(glintX + spread * 0.25 - shift, wy + 2, w * 0.7, 2);
    }
  }

  _drawFarCity(ctx, viewW, groundY, pal, scrollDist, time) {
    const horizonY = groundY - 34;
    const totalW = FAR_BUILDINGS.reduce((sum, b) => sum + b.w + 8, 0);
    const offset = (scrollDist * 0.14) % totalW;

    for (let rep = -1; rep <= Math.ceil(viewW / totalW) + 1; rep++) {
      let x = rep * totalW - offset;
      for (const b of FAR_BUILDINGS) {
        if (x + b.w > -50 && x < viewW + 50) {
          if (b.hasFerris) {
            const fx = x + b.w * 0.5;
            const fy = horizonY - b.h - 28;
            const fr = 48;
            ctx.save();
            // Support A-frame
            ctx.strokeStyle = rgb(pal.farCity, 0.95);
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(fx - 26, horizonY);
            ctx.lineTo(fx, fy);
            ctx.lineTo(fx + 26, horizonY);
            ctx.stroke();

            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(fx, fy, fr, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(fx, fy, fr * 0.72, 0, Math.PI * 2);
            ctx.stroke();

            for (let s = 0; s < 10; s++) {
              const a = time * 0.28 + (s * Math.PI * 2) / 10;
              const gx = fx + Math.cos(a) * fr;
              const gy = fy + Math.sin(a) * fr;
              ctx.strokeStyle = rgb(pal.farCity, 0.75);
              ctx.beginPath();
              ctx.moveTo(fx, fy);
              ctx.lineTo(gx, gy);
              ctx.stroke();

              const hue = (s * 36 + time * 40) % 360;
              ctx.fillStyle = pal.windowAlpha > 0.25 ? `hsl(${hue}, 95%, 68%)` : rgb(pal.farCity);
              ctx.beginPath();
              ctx.arc(gx, gy, 3.8, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          }

          ctx.fillStyle = rgb(pal.farCity);
          ctx.fillRect(x, horizonY - b.h, b.w, b.h + 4);

          if (b.roof === 'sloped') {
            ctx.beginPath();
            ctx.moveTo(x - 3, horizonY - b.h);
            ctx.lineTo(x + b.w * 0.5, horizonY - b.h - 16);
            ctx.lineTo(x + b.w + 3, horizonY - b.h);
            ctx.closePath();
            ctx.fill();
          } else if (b.roof === 'tank') {
            ctx.fillRect(x + 8, horizonY - b.h - 10, 14, 10);
          }

          if (b.hasTower) {
            ctx.fillRect(x + b.w * 0.44, horizonY - b.h - 32, 4, 32);
            const blink = Math.sin(time * 5) > 0;
            ctx.fillStyle = blink ? '#ff3b30' : '#7f1d1d';
            ctx.beginPath();
            ctx.arc(x + b.w * 0.44 + 2, horizonY - b.h - 34, 3.2, 0, Math.PI * 2);
            ctx.fill();
          }

          if (pal.windowAlpha > 0.05) {
            ctx.fillStyle = `rgba(255, 236, 153, ${pal.windowAlpha * 0.74})`;
            const cols = b.windows;
            const padX = b.w / (cols + 1);
            for (let wy = horizonY - b.h + 12; wy < horizonY - 12; wy += 16) {
              for (let c = 1; c <= cols; c++) {
                if ((c + Math.floor(wy)) % 3 !== 0) {
                  ctx.fillRect(x + c * padX - 3, wy, 6, 8);
                }
              }
            }
          }
        }
        x += b.w + 8;
      }
    }
  }

  _drawMidCity(ctx, viewW, groundY, pal, scrollDist, time) {
    const baseY = groundY - 22;
    const totalW = MID_BUILDINGS.reduce((sum, b) => sum + b.w + 38, 0);
    const offset = (scrollDist * 0.36) % totalW;

    for (let rep = -1; rep <= Math.ceil(viewW / totalW) + 1; rep++) {
      let x = rep * totalW - offset;
      for (const b of MID_BUILDINGS) {
        if (x + b.w + 46 > -40 && x < viewW + 46) {
          // Building body + roof ledge
          ctx.fillStyle = rgb(pal.midCity);
          roundRect(ctx, x, baseY - b.h, b.w, b.h + 4, 4);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(x, baseY - b.h, b.w, 4);

          // Cozy Japanese shopfront + glowing interior window
          if (b.isShop) {
            ctx.fillStyle = pal.windowAlpha > 0.25 ? 'rgba(254, 240, 138, 0.82)' : 'rgba(186, 230, 253, 0.55)';
            roundRect(ctx, x + 8, baseY - 22, b.w - 16, 18, 3);
            ctx.fill();

            // Striped awning
            ctx.fillStyle = b.awningColor;
            ctx.fillRect(x + 4, baseY - 28, b.w - 8, 9);
            ctx.fillStyle = 'rgba(255,255,255,0.88)';
            for (let sx = x + 8; sx < x + b.w - 10; sx += 14) {
              ctx.fillRect(sx, baseY - 28, 6, 9);
            }
          }

          // Cute neon shop sign at dusk/night!
          if (b.neonText && pal.windowAlpha > 0.2) {
            ctx.save();
            ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
            roundRect(ctx, x + b.w - 30, baseY - b.h + 8, 26, 16, 4);
            ctx.fill();
            ctx.strokeStyle = b.neonColor;
            ctx.lineWidth = 1.6;
            ctx.shadowColor = b.neonColor;
            ctx.shadowBlur = 10 * pal.windowAlpha;
            ctx.stroke();
            ctx.fillStyle = b.neonColor;
            ctx.font = '900 8px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(b.neonText, x + b.w - 17, baseY - b.h + 16);
            ctx.restore();
          }

          // Upper apartment windows
          if (pal.windowAlpha > 0.05) {
            ctx.fillStyle = `rgba(255, 240, 175, ${pal.windowAlpha * 0.85})`;
            for (let wx = x + 10; wx < x + b.w - 16; wx += 18) {
              for (let wy = baseY - b.h + 12; wy < baseY - 34; wy += 16) {
                ctx.fillRect(wx, wy, 9, 9);
              }
            }
          }

          // Street tree + optional vending machine in gap
          const tx = x + b.w + 19;
          const sway = Math.sin(time * 2.2 + tx * 0.02) * 2.2;
          if (b.hasVending) {
            ctx.fillStyle = '#e2e8f0';
            roundRect(ctx, tx - 10, baseY - 24, 16, 24, 2);
            ctx.fill();
            ctx.fillStyle = pal.windowAlpha > 0.2 ? '#fef08a' : '#38bdf8';
            ctx.fillRect(tx - 8, baseY - 21, 12, 11);
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(tx - 8, baseY - 8, 12, 3);
          } else {
            ctx.fillStyle = '#78350f';
            ctx.fillRect(tx - 3, baseY - 26, 6, 26);
            const leafMain = pal.starAlpha > 0.5 ? '#15803d' : '#22c55e';
            const leafHi = pal.starAlpha > 0.5 ? '#16a34a' : '#4ade80';
            ctx.fillStyle = leafMain;
            ctx.beginPath();
            ctx.arc(tx + sway, baseY - 35, 16, 0, Math.PI * 2);
            ctx.arc(tx - 10 + sway, baseY - 26, 12, 0, Math.PI * 2);
            ctx.arc(tx + 10 + sway, baseY - 26, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = leafHi;
            ctx.beginPath();
            ctx.arc(tx - 3 + sway, baseY - 39, 8, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        x += b.w + 38;
      }
    }

    // Streetlamps + Catenary utility wires
    const lampSpacing = 290;
    const lampOff = (scrollDist * 0.65) % lampSpacing;
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.28)';
    ctx.lineWidth = 1.4;
    for (let lx = -lampOff - lampSpacing; lx < viewW + lampSpacing; lx += lampSpacing) {
      // Catenary power wire to next pole
      ctx.beginPath();
      ctx.moveTo(lx + 2, baseY - 84);
      ctx.quadraticCurveTo(lx + lampSpacing * 0.5, baseY - 62, lx + lampSpacing + 2, baseY - 84);
      ctx.stroke();

      // Pole
      ctx.fillStyle = '#475569';
      ctx.fillRect(lx, baseY - 90, 5, 90);
      ctx.fillRect(lx - 14, baseY - 90, 19, 4);

      // Lamp head
      ctx.fillStyle = pal.lampGlow > 0.1 ? '#fef08a' : '#cbd5e1';
      ctx.beginPath();
      ctx.ellipse(lx - 10, baseY - 85, 7, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();

      if (pal.lampGlow > 0.05) {
        const g = ctx.createRadialGradient(lx - 10, baseY - 80, 4, lx - 10, baseY - 40, 74);
        g.addColorStop(0, `rgba(254, 240, 138, ${0.46 * pal.lampGlow})`);
        g.addColorStop(1, 'rgba(254, 240, 138, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(lx - 10, baseY - 42, 74, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  _drawRoadAndCrosswalk(ctx, viewW, viewH, groundY, pal, state) {
    const sidewalkTop = groundY - 24;
    ctx.fillStyle = pal.starAlpha > 0.55 ? '#64748b' : '#e2e8f0';
    ctx.fillRect(0, sidewalkTop, viewW, 20);

    // Sidewalk brick joints
    ctx.fillStyle = 'rgba(15, 23, 42, 0.08)';
    const brickOff = (state.scrollDist * 0.85) % 44;
    for (let bx = -brickOff; bx < viewW + 44; bx += 44) {
      ctx.fillRect(bx, sidewalkTop, 2, 18);
    }

    // Guardrail
    const railStep = 64;
    const railOff = (state.scrollDist * 0.85) % railStep;
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, sidewalkTop - 11, viewW, 4);
    ctx.fillStyle = '#94a3b8';
    for (let rx = -railOff; rx < viewW + railStep; rx += railStep) {
      ctx.fillRect(rx, sidewalkTop - 13, 4, 16);
    }

    // Pedestrian Traffic Light
    this._drawTrafficSignal(ctx, viewW - 58, sidewalkTop + 2, state);

    // Curbstone with bevel highlight
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, groundY - 7, viewW, 3);
    ctx.fillStyle = '#64748b';
    ctx.fillRect(0, groundY - 4, viewW, 5);

    // Asphalt Road
    const roadHeight = Math.max(120, viewH - groundY + 40);
    const roadGrad = ctx.createLinearGradient(0, groundY, 0, groundY + roadHeight);
    roadGrad.addColorStop(0, rgb(pal.roadTop));
    roadGrad.addColorStop(1, rgb(pal.roadBot));
    ctx.fillStyle = roadGrad;
    ctx.fillRect(0, groundY, viewW, roadHeight);

    // Iconic Crosswalk Zebra Stripes with subtle 3D paint shadow
    const stripePeriod = 94;
    const stripeOff = state.scrollDist % stripePeriod;
    for (let sx = -stripeOff - stripePeriod; sx < viewW + stripePeriod; sx += stripePeriod) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.25)';
      ctx.beginPath();
      ctx.moveTo(sx + 10, groundY + 15);
      ctx.lineTo(sx + 62, groundY + 15);
      ctx.lineTo(sx + 52, groundY + 55);
      ctx.lineTo(sx, groundY + 55);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = pal.starAlpha > 0.55 ? 'rgba(226, 232, 240, 0.86)' : 'rgba(255, 255, 255, 0.94)';
      ctx.beginPath();
      ctx.moveTo(sx + 10, groundY + 12);
      ctx.lineTo(sx + 62, groundY + 12);
      ctx.lineTo(sx + 52, groundY + 52);
      ctx.lineTo(sx, groundY + 52);
      ctx.closePath();
      ctx.fill();
    }

    // Yellow safety tactile line + cat's-eye reflectors
    ctx.fillStyle = '#facc15';
    ctx.fillRect(0, groundY + 64, viewW, 4);

    if (viewH > groundY + 72) {
      ctx.fillStyle = pal.starAlpha > 0.55 ? '#1e293b' : '#475569';
      ctx.fillRect(0, groundY + 68, viewW, viewH - (groundY + 68));
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 2;
      const tileOff = state.scrollDist % 56;
      for (let tx = -tileOff; tx < viewW + 56; tx += 56) {
        ctx.beginPath();
        ctx.moveTo(tx, groundY + 68);
        ctx.lineTo(tx - 16, viewH);
        ctx.stroke();
      }
    }
  }

  _drawTrafficSignal(ctx, x, baseY, state) {
    ctx.fillStyle = '#334155';
    ctx.fillRect(x - 3, baseY - 104, 6, 104);

    ctx.fillStyle = '#0f172a';
    roundRect(ctx, x - 17, baseY - 116, 34, 56, 8);
    ctx.fill();
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.stroke();

    const isWarn = state.rushState === 'warn';
    const isRush = state.rushState === 'active';
    const blink = Math.floor(state.time * 7) % 2 === 0;

    const redOn = isRush;
    ctx.fillStyle = redOn ? '#ef4444' : '#3f1d24';
    ctx.beginPath();
    ctx.arc(x, baseY - 100, 9.5, 0, Math.PI * 2);
    ctx.fill();
    if (redOn) {
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 18;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    const greenOn = !isRush && (!isWarn || blink);
    ctx.fillStyle = greenOn ? '#22c55e' : '#143322';
    ctx.beginPath();
    ctx.arc(x, baseY - 76, 9.5, 0, Math.PI * 2);
    ctx.fill();
    if (greenOn) {
      ctx.shadowColor = '#22c55e';
      ctx.shadowBlur = 16;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  _drawObstacle(ctx, ob, groundY, pal, time) {
    const baseY = groundY + 6 - ob.airY;

    ctx.save();
    if (ob.smashed) {
      ctx.translate(ob.x + ob.w * 0.5, baseY - ob.h * 0.5);
      ctx.rotate(ob.rot);
      ctx.translate(-(ob.x + ob.w * 0.5), -(baseY - ob.h * 0.5));
    }

    // Ground shadow
    if (!ob.smashed) {
      const shadowScale = clamp(1 - ob.airY / 210, 0.32, 1);
      ctx.fillStyle = `rgba(15, 23, 42, ${0.36 * shadowScale})`;
      ctx.beginPath();
      ctx.ellipse(ob.x + ob.w * 0.5, groundY + 9, ob.w * 0.46 * shadowScale, 6.5 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Apply roof stomp squash!
    if (ob.squash > 0.01 && !ob.smashed) {
      const cx = ob.x + ob.w * 0.5;
      ctx.translate(cx, baseY);
      ctx.scale(1 + ob.squash * 0.16, 1 - ob.squash * 0.24);
      ctx.translate(-cx, -baseY);
    }

    switch (ob.kind) {
      case 'cone':
        this._drawCone(ctx, ob, baseY);
        break;
      case 'spring':
        this._drawSpring(ctx, ob, baseY, time);
        break;
      case 'car':
        this._drawSedan(ctx, ob, baseY, pal, time, false);
        break;
      case 'taxi':
        this._drawSedan(ctx, ob, baseY, pal, time, true);
        break;
      case 'sport':
        this._drawSportCar(ctx, ob, baseY, pal, time);
        break;
      case 'truck':
        this._drawTruck(ctx, ob, baseY, pal, time);
        break;
      case 'bus':
        this._drawBus(ctx, ob, baseY, pal, time);
        break;
      case 'bird':
        this._drawSeagull(ctx, ob, baseY, time);
        break;
    }

    ctx.restore();
  }

  _drawSpring(ctx, ob, baseY, time) {
    const { x, w, h } = ob;
    const pulse = Math.sin(time * 9) * 2.5;
    // Metallic base
    ctx.fillStyle = '#334155';
    roundRect(ctx, x + 4, baseY - 8, w - 8, 8, 3);
    ctx.fill();

    // Spring coil zig-zag
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(x + 14, baseY - 8);
    ctx.lineTo(x + w - 14, baseY - 14);
    ctx.lineTo(x + 14, baseY - 20);
    ctx.lineTo(x + w - 14, baseY - 26 + pulse);
    ctx.stroke();

    // Vibrant bouncy pad
    const padY = baseY - h + pulse;
    const g = ctx.createLinearGradient(x, padY, x + w, padY);
    g.addColorStop(0, '#f43f5e');
    g.addColorStop(0.5, '#facc15');
    g.addColorStop(1, '#38bdf8');
    ctx.fillStyle = g;
    roundRect(ctx, x, padY, w, 13, 6);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Floating upward arrows cue above springboard
    const arrowY = padY - 10 - Math.abs(Math.sin(time * 7)) * 7;
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.5, arrowY - 8);
    ctx.lineTo(x + w * 0.5 - 8, arrowY);
    ctx.lineTo(x + w * 0.5 + 8, arrowY);
    ctx.closePath();
    ctx.fill();
  }

  _drawCone(ctx, ob, baseY) {
    const { x, w, h } = ob;
    ctx.fillStyle = '#1e293b';
    roundRect(ctx, x, baseY - 7, w, 7, 3);
    ctx.fill();

    const g = ctx.createLinearGradient(x, baseY - h, x + w, baseY);
    g.addColorStop(0, '#fb923c');
    g.addColorStop(1, '#ea580c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.5, baseY - h);
    ctx.lineTo(x + w - 4, baseY - 6);
    ctx.lineTo(x + 4, baseY - 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#9a3412';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.34, baseY - h * 0.62);
    ctx.lineTo(x + w * 0.66, baseY - h * 0.62);
    ctx.lineTo(x + w * 0.74, baseY - h * 0.38);
    ctx.lineTo(x + w * 0.26, baseY - h * 0.38);
    ctx.closePath();
    ctx.fill();
  }

  _drawHeadlightBeam(ctx, hx, hy, alpha) {
    if (alpha < 0.05) return;
    ctx.save();
    const grad = ctx.createLinearGradient(hx, hy, hx - 138, hy + 18);
    grad.addColorStop(0, `rgba(254, 249, 195, ${alpha * 0.68})`);
    grad.addColorStop(1, 'rgba(254, 249, 195, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(hx, hy - 5);
    ctx.lineTo(hx - 138, hy - 24);
    ctx.lineTo(hx - 138, hy + 30);
    ctx.lineTo(hx, hy + 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _drawWheel(ctx, cx, cy, r, phase) {
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.54, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    for (let i = 0; i < 2; i++) {
      const a = phase + (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.48, cy + Math.sin(a) * r * 0.48);
      ctx.lineTo(cx - Math.cos(a) * r * 0.48, cy - Math.sin(a) * r * 0.48);
      ctx.stroke();
    }
  }

  _drawSedan(ctx, ob, baseY, pal, time, isTaxi) {
    const bob = Math.sin(time * 18 + ob.id) * 1.4;
    const { x, w, h } = ob;
    const y = baseY - h + bob;

    this._drawHeadlightBeam(ctx, x + 2, y + h - 22, pal.headlightAlpha);

    // Taxi glowing roof lantern!
    if (isTaxi) {
      ctx.fillStyle = '#fef08a';
      roundRect(ctx, x + 46, y - 5, 22, 9, 4);
      ctx.fill();
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Body with metallic sheen
    ctx.fillStyle = ob.color;
    roundRect(ctx, x, y + 20, w, h - 28, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Cabin roof
    ctx.fillStyle = ob.color;
    ctx.beginPath();
    ctx.moveTo(x + 22, y + 22);
    ctx.quadraticCurveTo(x + 32, y + 2, x + 48, y + 2);
    ctx.lineTo(x + 80, y + 2);
    ctx.quadraticCurveTo(x + 95, y + 2, x + 102, y + 22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Taxi checkered band
    if (isTaxi) {
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#0f172a' : '#ffffff';
        ctx.fillRect(x + 14 + i * 9, y + 32, 9, 5);
      }
    }

    // Windows with diagonal shine
    ctx.fillStyle = '#bae6fd';
    ctx.beginPath();
    ctx.moveTo(x + 28, y + 20);
    ctx.quadraticCurveTo(x + 36, y + 7, x + 49, y + 7);
    ctx.lineTo(x + 60, y + 7);
    ctx.lineTo(x + 60, y + 20);
    ctx.closePath();
    ctx.fill();
    roundRect(ctx, x + 65, y + 7, 28, 13, 4);
    ctx.fill();

    // Specular roof highlight (subtly invites Stomp Bounce!)
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    roundRect(ctx, x + 46, y + 4, 34, 3, 2);
    ctx.fill();

    // Headlight & taillight
    ctx.fillStyle = '#fef08a';
    roundRect(ctx, x + 2, y + 26, 8, 9, 3);
    ctx.fill();
    ctx.fillStyle = '#dc2626';
    roundRect(ctx, x + w - 9, y + 26, 7, 8, 2);
    ctx.fill();

    this._drawWheel(ctx, x + 26, baseY - 11, 11.5, ob.wheelPhase);
    this._drawWheel(ctx, x + w - 26, baseY - 11, 11.5, ob.wheelPhase);
  }

  _drawSportCar(ctx, ob, baseY, pal, time) {
    const bob = Math.sin(time * 26 + ob.id) * 1.1;
    const { x, w, h } = ob;
    const y = baseY - h + bob;

    this._drawHeadlightBeam(ctx, x + 2, y + h - 18, pal.headlightAlpha);

    // Animated nitro exhaust flame!
    const flameLen = 14 + Math.sin(time * 48) * 6;
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(x + w - 2, y + h - 16);
    ctx.lineTo(x + w + flameLen, y + h - 13);
    ctx.lineTo(x + w - 2, y + h - 10);
    ctx.closePath();
    ctx.fill();

    // Spoiler
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x + w - 12, y + 6, 4, 12);
    ctx.fillRect(x + w - 17, y + 4, 15, 4);

    // Sleek chassis
    ctx.fillStyle = ob.color;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + h - 11);
    ctx.quadraticCurveTo(x + 2, y + 18, x + 24, y + 14);
    ctx.lineTo(x + 48, y + 3);
    ctx.lineTo(x + 88, y + 3);
    ctx.lineTo(x + w - 4, y + 14);
    ctx.lineTo(x + w - 2, y + h - 11);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillRect(x + 12, y + 22, w - 22, 4);

    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(x + 33, y + 16);
    ctx.lineTo(x + 50, y + 6);
    ctx.lineTo(x + 83, y + 6);
    ctx.lineTo(x + 92, y + 16);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#fef9c3';
    ctx.fillRect(x + 6, y + 19, 10, 5);

    this._drawWheel(ctx, x + 27, baseY - 10, 10.5, ob.wheelPhase * 1.4);
    this._drawWheel(ctx, x + w - 25, baseY - 10, 10.5, ob.wheelPhase * 1.4);
  }

  _drawTruck(ctx, ob, baseY, pal, time) {
    const bob = Math.sin(time * 14 + ob.id) * 1.6;
    const { x, w, h } = ob;
    const y = baseY - h + bob;

    this._drawHeadlightBeam(ctx, x + 2, y + h - 24, pal.headlightAlpha);

    const cabW = 50;
    ctx.fillStyle = '#f8fafc';
    roundRect(ctx, x + cabW - 2, y, w - cabW + 2, h - 16, 7);
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Brand stripe + cute crab delivery badge
    ctx.fillStyle = ob.color;
    ctx.fillRect(x + cabW, y + 28, w - cabW - 2, 18);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🦀 EXPRESS', x + cabW + (w - cabW) * 0.5, y + 37);

    // Cab
    ctx.fillStyle = ob.color;
    roundRect(ctx, x, y + 26, cabW + 4, h - 42, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#bae6fd';
    roundRect(ctx, x + 5, y + 33, 25, 22, 4);
    ctx.fill();

    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(x - 2, y + h - 22, 12, 7);
    ctx.fillStyle = '#fef08a';
    roundRect(ctx, x + 2, y + h - 34, 8, 9, 2);
    ctx.fill();

    this._drawWheel(ctx, x + 26, baseY - 13, 13, ob.wheelPhase);
    this._drawWheel(ctx, x + w - 34, baseY - 13, 13, ob.wheelPhase);
    this._drawWheel(ctx, x + w - 64, baseY - 13, 13, ob.wheelPhase);
  }

  _drawBus(ctx, ob, baseY, pal, time) {
    const bob = Math.sin(time * 13 + ob.id) * 1.4;
    const { x, w, h } = ob;
    const y = baseY - h + bob;

    this._drawHeadlightBeam(ctx, x + 2, y + h - 22, pal.headlightAlpha);

    // Panoramic coastal bus body
    ctx.fillStyle = '#f8fafc';
    roundRect(ctx, x, y, w, h - 14, 12);
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Lower color skirt
    ctx.fillStyle = ob.color;
    roundRect(ctx, x + 1, y + h - 46, w - 2, 32, 8);
    ctx.fill();

    // Destination LED sign
    ctx.fillStyle = '#0f172a';
    roundRect(ctx, x + 6, y + 10, 32, 12, 3);
    ctx.fill();
    ctx.fillStyle = '#fb923c';
    ctx.font = '900 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('うみ', x + 22, y + 16);

    // Panoramic passenger windows (warm glow at night!)
    const winColor = pal.windowAlpha > 0.3 ? '#fef08a' : '#bae6fd';
    ctx.fillStyle = winColor;
    roundRect(ctx, x + 6, y + 26, 26, 26, 4);
    ctx.fill();
    for (let i = 0; i < 4; i++) {
      roundRect(ctx, x + 42 + i * 38, y + 18, 32, 30, 5);
      ctx.fill();
    }

    ctx.fillStyle = '#fef08a';
    roundRect(ctx, x + 2, y + h - 30, 8, 9, 2);
    ctx.fill();

    this._drawWheel(ctx, x + 36, baseY - 13, 13.5, ob.wheelPhase);
    this._drawWheel(ctx, x + w - 42, baseY - 13, 13.5, ob.wheelPhase);
  }

  _drawSeagull(ctx, ob, baseY, time) {
    const cx = ob.x + ob.w * 0.5;
    const cy = baseY - ob.h * 0.5 + Math.sin(time * 9 + ob.id) * 4;
    const flap = Math.sin(time * 16 + ob.wingPhase);

    ctx.save();
    ctx.translate(cx, cy);

    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(-4, -2);
    ctx.quadraticCurveTo(6, -21 * flap - 8, 18, -14 * flap - 4);
    ctx.lineTo(8, 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(0, 0, 21, 11, -0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.moveTo(16, -2);
    ctx.lineTo(27, -7);
    ctx.lineTo(25, 3);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.quadraticCurveTo(4, -25 * flap - 2, 16, -16 * flap);
    ctx.lineTo(6, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.moveTo(-19, -2);
    ctx.lineTo(-29, 2);
    ctx.lineTo(-19, 5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-11, -3, 2.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _drawCollectible(ctx, c, groundY, time) {
    const bob = Math.sin(time * 5.2 + c.bobPhase) * 5;
    const cx = c.x;
    const cy = groundY - c.airY + bob;

    ctx.save();
    ctx.translate(cx, cy);

    if (c.type === 'star') {
      const pulse = 1 + Math.sin(time * 7 + c.bobPhase) * 0.08;
      ctx.scale(pulse, pulse);
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 24);
      g.addColorStop(0, 'rgba(254, 240, 138, 0.78)');
      g.addColorStop(1, 'rgba(254, 240, 138, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.fill();

      ctx.rotate(Math.sin(time * 3 + c.bobPhase) * 0.25);
      drawStarShape(ctx, 0, 0, 5, 15.5, 7.2);
      ctx.fillStyle = '#facc15';
      ctx.fill();
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#fef9c3';
      ctx.beginPath();
      ctx.arc(-3, -3, 3.3, 0, Math.PI * 2);
      ctx.fill();
    } else if (c.type === 'shield') {
      const r = 19;
      const g = ctx.createRadialGradient(-5, -5, 3, 0, 0, r);
      g.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
      g.addColorStop(0.5, 'rgba(56, 189, 248, 0.45)');
      g.addColorStop(1, 'rgba(168, 85, 247, 0.78)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 2.2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.ellipse(-6, -6, 5, 3, -0.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (c.type === 'heart') {
      const pulse = 1 + Math.sin(time * 8) * 0.1;
      ctx.scale(pulse, pulse);
      drawHeartShape(ctx, 0, 0, 16);
      ctx.fillStyle = '#f43f5e';
      ctx.fill();
      ctx.strokeStyle = '#9f1239';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.beginPath();
      ctx.arc(-5, -4, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  _drawCosmetic(ctx, cosmeticId, time) {
    if (!cosmeticId || cosmeticId === 'none') return;
    ctx.save();

    if (cosmeticId === 'ribbon') {
      ctx.translate(15, -24);
      ctx.rotate(0.28 + Math.sin(time * 8) * 0.06);
      ctx.fillStyle = '#f43f5e';
      ctx.strokeStyle = '#9f1239';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-12, -8);
      ctx.lineTo(-12, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(12, -8);
      ctx.lineTo(12, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fda4af';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (cosmeticId === 'shades') {
      ctx.translate(0, -18);
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 1.6;
      roundRect(ctx, -17, -6, 15, 11, 3);
      ctx.fill();
      ctx.stroke();
      roundRect(ctx, 2, -6, 15, 11, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(-3, -3, 6, 3);
      // Cool diagonal glint
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-13, 1);
      ctx.lineTo(-7, -4);
      ctx.moveTo(6, 1);
      ctx.lineTo(12, -4);
      ctx.stroke();
    } else if (cosmeticId === 'cap') {
      ctx.translate(-1, -27);
      ctx.rotate(-0.08);
      ctx.fillStyle = '#2563eb';
      ctx.strokeStyle = '#1e3a8a';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, 4, 15, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Visor pointing right (running direction)
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.ellipse(11, 4, 12, 4, 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(0, -11, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (cosmeticId === 'crown') {
      ctx.translate(0, -32);
      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-13, 6);
      ctx.lineTo(-15, -9);
      ctx.lineTo(-5, -2);
      ctx.lineTo(0, -13);
      ctx.lineTo(5, -2);
      ctx.lineTo(15, -9);
      ctx.lineTo(13, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(0, 1, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(-8, 2, 2.1, 0, Math.PI * 2);
      ctx.arc(8, 2, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  _drawCrab(ctx, state, groundY) {
    const p = state.player;
    const altitude = p.altitude;
    const x = state.playerX;
    const y = groundY + 6 - altitude;

    // Ground shadow
    const shadowScale = clamp(1 - altitude / 280, 0.25, 1);
    ctx.fillStyle = `rgba(15, 23, 42, ${0.4 * shadowScale})`;
    ctx.beginPath();
    ctx.ellipse(x, groundY + 9, 31 * shadowScale, 7 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Fever rainbow afterimage trail
    if (state.feverTimer > 0 && state.trail.length > 0) {
      state.trail.forEach((tr, idx) => {
        const alpha = ((idx + 1) / state.trail.length) * 0.34;
        const hue = (state.time * 360 + idx * 42) % 360;
        ctx.save();
        ctx.translate(tr.x, groundY + 6 - tr.altitude - CRAB.visualH * 0.5);
        ctx.fillStyle = `hsla(${hue}, 95%, 62%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(0, 0, 27 * (0.65 + (idx / state.trail.length) * 0.4), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }

    // Invulnerability blink
    if (p.invulnTimer > 0 && Math.floor(state.time * 18) % 2 === 0 && state.phase === 'playing') {
      return;
    }

    ctx.save();
    const waddleBob = p.grounded && state.phase === 'playing' ? Math.abs(Math.sin(state.time * 17)) * 4.5 : 0;
    const waddleTilt = p.grounded && state.phase === 'playing' ? Math.sin(state.time * 17) * 0.08 : 0;
    ctx.translate(x, y - waddleBob);

    // Fever glow aura
    if (state.feverTimer > 0) {
      const hue = (state.time * 280) % 360;
      const aura = ctx.createRadialGradient(0, -CRAB.visualH * 0.5, 8, 0, -CRAB.visualH * 0.5, 52);
      aura.addColorStop(0, `hsla(${hue}, 100%, 72%, 0.75)`);
      aura.addColorStop(1, `hsla(${hue}, 100%, 60%, 0)`);
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(0, -CRAB.visualH * 0.5, 52, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.scale(p.scaleX, p.scaleY);
    ctx.translate(0, -CRAB.visualH * 0.5);
    ctx.rotate(p.rotation + waddleTilt);

    // Flowing Hero Cape behind the crab!
    if (state.equippedCosmetic === 'cape') {
      const wave1 = Math.sin(state.time * 16) * 7;
      const wave2 = Math.cos(state.time * 14) * 9;
      ctx.fillStyle = '#dc2626';
      ctx.strokeStyle = '#7f1d1d';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-10, -8);
      ctx.quadraticCurveTo(-36, -12 + wave1, -56, -2 + wave2);
      ctx.lineTo(-48, 20 + wave1 * 0.8);
      ctx.quadraticCurveTo(-28, 14 + wave2 * 0.4, -8, 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Gold clasp
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(-10, -6, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.crabImg && this.crabImg.complete && this.crabImg.naturalWidth > 0) {
      ctx.drawImage(this.crabImg, -CRAB.visualW * 0.5, -CRAB.visualH * 0.5, CRAB.visualW, CRAB.visualH);
    } else {
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.fill();
    }

    // Front cosmetics (ribbon, shades, cap, crown)
    this._drawCosmetic(ctx, state.equippedCosmetic, state.time);

    // Bubble Shield
    if (p.hasShield) {
      const sr = 42 + Math.sin(state.time * 6) * 1.6;
      const g = ctx.createRadialGradient(-10, -10, 6, 0, 0, sr);
      g.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
      g.addColorStop(0.7, 'rgba(56, 189, 248, 0.16)');
      g.addColorStop(1, 'rgba(168, 85, 247, 0.54)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, sr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(224, 242, 254, 0.88)';
      ctx.lineWidth = 2.4;
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.78)';
      ctx.beginPath();
      ctx.ellipse(-14, -14, 9, 4.5, -0.65, 0, Math.PI * 2);
      ctx.fill();
    }

    // Dizzy stars on Game Over
    if (state.phase === 'gameover') {
      for (let i = 0; i < 3; i++) {
        const a = state.time * 5 + (i * Math.PI * 2) / 3;
        const sx = Math.cos(a) * 24;
        const sy = -38 + Math.sin(a) * 7;
        drawStarShape(ctx, sx, sy, 5, 7, 3.2);
        ctx.fillStyle = '#facc15';
        ctx.fill();
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  _drawAmbientMotes(ctx, viewW, viewH, pal, time) {
    ctx.save();
    for (const m of AMBIENT_MOTES) {
      const x = (((m.seedX - time * m.speedX) % (viewW + 40)) + (viewW + 40)) % (viewW + 40) - 20;
      const y = (((m.seedY + time * m.speedY) % viewH) + viewH) % viewH;
      if (pal.ambient === 'petals') {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(time * 2.4 + m.phase);
        ctx.fillStyle = 'rgba(255, 210, 228, 0.72)';
        ctx.beginPath();
        ctx.ellipse(0, 0, m.size * 1.2, m.size * 0.65, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (pal.ambient === 'embers') {
        ctx.fillStyle = 'rgba(254, 215, 170, 0.55)';
        ctx.beginPath();
        ctx.arc(x, y, m.size * 0.65, 0, Math.PI * 2);
        ctx.fill();
      } else if (pal.ambient === 'fireflies') {
        const glow = 0.4 + 0.6 * Math.sin(time * 4 + m.phase);
        ctx.fillStyle = `rgba(190, 242, 100, ${glow * 0.75})`;
        ctx.beginPath();
        ctx.arc(x, y, m.size * 0.75, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const hue = (time * 120 + m.phase * 60) % 360;
        ctx.fillStyle = `hsla(${hue}, 95%, 75%, 0.68)`;
        ctx.beginPath();
        ctx.arc(x, y, m.size * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  _drawTelegraphs(ctx, state, viewW, groundY) {
    for (const ob of state.obstacles) {
      const spec = OBSTACLE_SPECS[ob.kind];
      if (!spec || !spec.telegraph || ob.smashed) continue;
      // Show pulsing warning badge when hazard is just off the right edge!
      if (ob.x > viewW - 10 && ob.x < viewW + 260) {
        const y = clamp(groundY - ob.airY - ob.h * 0.5, 90, groundY - 24);
        const pulse = 0.85 + Math.sin(state.time * 22) * 0.15;
        ctx.save();
        ctx.translate(viewW - 30, y);
        ctx.scale(pulse, pulse);
        ctx.fillStyle = '#ef4444';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 17, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fef08a';
        ctx.font = '900 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', 0, 1);
        ctx.restore();
      }
    }
  }

  _drawParticles(ctx, particles, groundY) {
    for (const pt of particles) {
      const alpha = clamp(pt.life / pt.maxLife, 0, 1);
      const px = pt.x;
      const py = groundY + 6 - pt.altitude;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (pt.shape === 'ring') {
        ctx.strokeStyle = pt.color;
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.arc(px, py, pt.size * (2.0 - alpha * 1.0), 0, Math.PI * 2);
        ctx.stroke();
      } else if (pt.shape === 'star') {
        ctx.translate(px, py);
        ctx.rotate(pt.rot);
        drawStarShape(ctx, 0, 0, 5, pt.size, pt.size * 0.45);
        ctx.fillStyle = pt.color;
        ctx.fill();
      } else {
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(px, py, pt.size * (0.5 + 0.5 * alpha), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  _drawSpeedLines(ctx, viewW, viewH, time, isFever) {
    ctx.save();
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 12; i++) {
      const y = ((i * 61 + time * 40) % (viewH - 40)) + 20;
      const len = 50 + (i % 3) * 38;
      const x = viewW - (((time * 1200 + i * 213) % (viewW + 160)) - 80);
      const hue = isFever ? (time * 300 + i * 32) % 360 : 45;
      ctx.strokeStyle = isFever
        ? `hsla(${hue}, 100%, 72%, 0.45)`
        : 'rgba(255, 255, 255, 0.3)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawPopups(ctx, popups, groundY) {
    for (const pop of popups) {
      const t = 1 - pop.life / pop.maxLife;
      const alpha = t < 0.7 ? 1 : clamp((1 - t) / 0.3, 0, 1);
      const scale = t < 0.16 ? 0.65 + (t / 0.16) * 0.52 : 1.05;
      const py = groundY + 6 - pop.altitude;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(pop.x, py);
      ctx.scale(scale, scale);
      ctx.font = `900 ${pop.size}px "Mochiy Pop One", "Hiragino Maru Gothic ProN", "Yu Gothic", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.lineJoin = 'round';
      ctx.strokeText(pop.text, 0, 0);
      ctx.fillStyle = pop.color;
      ctx.fillText(pop.text, 0, 0);
      ctx.restore();
    }
  }
}
