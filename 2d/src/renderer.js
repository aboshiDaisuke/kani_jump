import { CRAB } from './config.js';
import { clamp, rgb, sampleSkyPalette } from './logic.js';

// Deterministic pseudo-random stars & skyline buildings
const STARS = Array.from({ length: 48 }, (_, i) => ({
  x: ((i * 197.3) % 1000) / 1000,
  y: ((i * 83.7) % 1000) / 1000 * 0.56,
  r: 1.1 + (i % 3) * 0.7,
  twinkle: i * 1.37,
}));

const CLOUDS = Array.from({ length: 7 }, (_, i) => ({
  x: i * 210 + (i % 2) * 55,
  y: 48 + (i % 3) * 44,
  scale: 0.75 + (i % 4) * 0.2,
}));

const FAR_BUILDINGS = Array.from({ length: 18 }, (_, i) => ({
  w: 48 + ((i * 29) % 52),
  h: 65 + ((i * 47) % 115),
  hasTower: i === 6,
  hasFerris: i === 13,
  windows: 2 + (i % 3),
}));

const MID_BUILDINGS = Array.from({ length: 12 }, (_, i) => ({
  w: 72 + ((i * 37) % 64),
  h: 48 + ((i * 31) % 68),
  isShop: i % 3 === 1,
  awningColor: ['#ef4444', '#0ea5e9', '#10b981', '#f59e0b'][i % 4],
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
      // Portrait mobile: guarantee >= 520px logical width for comfortable lookahead
      this.scale = cssW / 520;
      this.viewW = 520;
      this.viewH = cssH / this.scale;
      this.groundY = Math.round(this.viewH * 0.67);
    } else {
      // Landscape tablet / desktop
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

    ctx.save();
    ctx.scale(this.dpr * this.scale, this.dpr * this.scale);

    // Camera shake
    if (state.shakeMag > 0.2) {
      const sx = (Math.random() * 2 - 1) * state.shakeMag;
      const sy = (Math.random() * 2 - 1) * state.shakeMag;
      ctx.translate(sx, sy);
    }

    const palette = sampleSkyPalette(state.skyPhase);

    this._drawSky(ctx, viewW, groundY, palette, state.time);
    this._drawFarCity(ctx, viewW, groundY, palette, state.scrollDist, state.time);
    this._drawMidCity(ctx, viewW, groundY, palette, state.scrollDist, state.time);
    this._drawRoadAndCrosswalk(ctx, viewW, viewH, groundY, palette, state);

    // Draw collectibles
    for (const c of state.collectibles) {
      if (!c.collected) this._drawCollectible(ctx, c, groundY, state.time);
    }

    // Draw obstacles
    for (const ob of state.obstacles) {
      this._drawObstacle(ctx, ob, groundY, palette, state.time);
    }

    // Draw crab hero
    this._drawCrab(ctx, state, groundY);

    // Draw particles
    this._drawParticles(ctx, state.particles, groundY);

    // Fever or Rush speed lines overlay
    if (state.feverTimer > 0 || state.rushState === 'active') {
      this._drawSpeedLines(ctx, viewW, viewH, state.time, state.feverTimer > 0);
    }

    // Damage red flash
    if (state.damageFlash > 0) {
      ctx.fillStyle = `rgba(239, 68, 68, ${state.damageFlash * 0.38})`;
      ctx.fillRect(0, 0, viewW, viewH);
    }

    // Floating score popups
    this._drawPopups(ctx, state.popups, groundY);

    ctx.restore();
  }

  _drawSky(ctx, viewW, groundY, pal, time) {
    const grad = ctx.createLinearGradient(0, 0, 0, groundY);
    grad.addColorStop(0, rgb(pal.skyTop));
    grad.addColorStop(1, rgb(pal.skyBot));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, viewW, groundY + 12);

    // Stars at dusk/night
    if (pal.starAlpha > 0.02) {
      for (const s of STARS) {
        const tw = 0.55 + 0.45 * Math.sin(time * 2.8 + s.twinkle);
        ctx.fillStyle = `rgba(255, 255, 240, ${pal.starAlpha * tw})`;
        ctx.beginPath();
        ctx.arc(s.x * viewW, s.y * groundY, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Sun / Moon arc
    const sunX = viewW * 0.78;
    const sunY = Math.max(62, groundY * 0.24 + Math.sin(pal.phase * Math.PI * 0.5) * 32);
    const sunR = pal.starAlpha > 0.55 ? 24 : 30;
    const glow = ctx.createRadialGradient(sunX, sunY, sunR * 0.3, sunX, sunY, sunR * 3.1);
    glow.addColorStop(0, rgb(pal.sunColor, 0.72));
    glow.addColorStop(0.45, rgb(pal.sunColor, 0.2));
    glow.addColorStop(1, rgb(pal.sunColor, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 3.1, 0, Math.PI * 2);
    ctx.fill();

    if (pal.starAlpha > 0.65) {
      // Crisp vector crescent moon (no dark dot artifact over glow!)
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

    // Drifting clouds
    const span = viewW + 320;
    ctx.fillStyle = rgb(pal.cloudColor, 0.78 - pal.starAlpha * 0.35);
    for (const c of CLOUDS) {
      const cx = (((c.x - time * 18 * c.scale) % span) + span) % span - 140;
      const cy = Math.min(c.y, groundY * 0.45);
      const sc = c.scale;
      ctx.beginPath();
      ctx.arc(cx, cy, 20 * sc, 0, Math.PI * 2);
      ctx.arc(cx + 22 * sc, cy - 8 * sc, 24 * sc, 0, Math.PI * 2);
      ctx.arc(cx + 46 * sc, cy - 2 * sc, 18 * sc, 0, Math.PI * 2);
      ctx.arc(cx + 24 * sc, cy + 5 * sc, 18 * sc, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawFarCity(ctx, viewW, groundY, pal, scrollDist, time) {
    const horizonY = groundY - 34;
    const totalW = FAR_BUILDINGS.reduce((sum, b) => sum + b.w + 8, 0);
    const offset = (scrollDist * 0.14) % totalW;

    for (let rep = -1; rep <= Math.ceil(viewW / totalW) + 1; rep++) {
      let x = rep * totalW - offset;
      for (const b of FAR_BUILDINGS) {
        if (x + b.w > -40 && x < viewW + 40) {
          // Optional distant Ferris wheel behind buildings
          if (b.hasFerris) {
            const fx = x + b.w * 0.5;
            const fy = horizonY - b.h - 26;
            const fr = 44;
            ctx.save();
            ctx.strokeStyle = rgb(pal.farCity, 0.9);
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(fx, fy, fr, 0, Math.PI * 2);
            ctx.stroke();
            for (let s = 0; s < 8; s++) {
              const a = time * 0.25 + (s * Math.PI) / 4;
              ctx.beginPath();
              ctx.moveTo(fx, fy);
              ctx.lineTo(fx + Math.cos(a) * fr, fy + Math.sin(a) * fr);
              ctx.stroke();
              ctx.fillStyle = pal.windowAlpha > 0.3 ? '#fde047' : rgb(pal.farCity);
              ctx.beginPath();
              ctx.arc(fx + Math.cos(a) * fr, fy + Math.sin(a) * fr, 3.2, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          }

          ctx.fillStyle = rgb(pal.farCity);
          ctx.fillRect(x, horizonY - b.h, b.w, b.h + 4);

          if (b.hasTower) {
            ctx.fillRect(x + b.w * 0.44, horizonY - b.h - 26, 4, 26);
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.arc(x + b.w * 0.44 + 2, horizonY - b.h - 28, 3, 0, Math.PI * 2);
            ctx.fill();
          }

          if (pal.windowAlpha > 0.05) {
            ctx.fillStyle = `rgba(255, 236, 153, ${pal.windowAlpha * 0.72})`;
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
    const totalW = MID_BUILDINGS.reduce((sum, b) => sum + b.w + 34, 0);
    const offset = (scrollDist * 0.36) % totalW;

    for (let rep = -1; rep <= Math.ceil(viewW / totalW) + 1; rep++) {
      let x = rep * totalW - offset;
      for (const b of MID_BUILDINGS) {
        if (x + b.w + 40 > -40 && x < viewW + 40) {
          // Building body
          ctx.fillStyle = rgb(pal.midCity);
          roundRect(ctx, x, baseY - b.h, b.w, b.h + 4, 4);
          ctx.fill();

          // Cute shop awning
          if (b.isShop) {
            ctx.fillStyle = b.awningColor;
            ctx.fillRect(x + 4, baseY - 24, b.w - 8, 8);
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            for (let sx = x + 8; sx < x + b.w - 10; sx += 14) {
              ctx.fillRect(sx, baseY - 24, 6, 8);
            }
          }

          // Windows
          if (pal.windowAlpha > 0.05) {
            ctx.fillStyle = `rgba(255, 240, 175, ${pal.windowAlpha * 0.85})`;
            for (let wx = x + 10; wx < x + b.w - 14; wx += 18) {
              for (let wy = baseY - b.h + 10; wy < baseY - 28; wy += 16) {
                ctx.fillRect(wx, wy, 9, 9);
              }
            }
          }

          // Street tree in gap
          const tx = x + b.w + 17;
          const sway = Math.sin(time * 2.2 + tx * 0.02) * 2;
          ctx.fillStyle = '#78350f';
          ctx.fillRect(tx - 3, baseY - 24, 6, 24);
          ctx.fillStyle = pal.starAlpha > 0.5 ? '#15803d' : '#22c55e';
          ctx.beginPath();
          ctx.arc(tx + sway, baseY - 32, 15, 0, Math.PI * 2);
          ctx.arc(tx - 9 + sway, baseY - 24, 11, 0, Math.PI * 2);
          ctx.arc(tx + 9 + sway, baseY - 24, 11, 0, Math.PI * 2);
          ctx.fill();
        }
        x += b.w + 34;
      }
    }

    // Streetlamps + Pedestrian Traffic Signal along the sidewalk
    const lampSpacing = 290;
    const lampOff = (scrollDist * 0.65) % lampSpacing;
    for (let lx = -lampOff; lx < viewW + lampSpacing; lx += lampSpacing) {
      // Pole
      ctx.fillStyle = '#475569';
      ctx.fillRect(lx, baseY - 86, 5, 86);
      ctx.fillRect(lx - 14, baseY - 86, 19, 4);
      // Lamp head
      ctx.fillStyle = pal.lampGlow > 0.1 ? '#fef08a' : '#cbd5e1';
      ctx.beginPath();
      ctx.ellipse(lx - 10, baseY - 81, 7, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Warm night glow cone
      if (pal.lampGlow > 0.05) {
        const g = ctx.createRadialGradient(lx - 10, baseY - 76, 4, lx - 10, baseY - 40, 68);
        g.addColorStop(0, `rgba(254, 240, 138, ${0.42 * pal.lampGlow})`);
        g.addColorStop(1, 'rgba(254, 240, 138, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(lx - 10, baseY - 42, 68, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  _drawRoadAndCrosswalk(ctx, viewW, viewH, groundY, pal, state) {
    // Sidewalk strip behind road
    const sidewalkTop = groundY - 24;
    ctx.fillStyle = pal.starAlpha > 0.55 ? '#64748b' : '#cbd5e1';
    ctx.fillRect(0, sidewalkTop, viewW, 20);

    // Guardrail posts
    const railStep = 64;
    const railOff = (state.scrollDist * 0.82) % railStep;
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, sidewalkTop - 10, viewW, 4);
    ctx.fillStyle = '#94a3b8';
    for (let rx = -railOff; rx < viewW + railStep; rx += railStep) {
      ctx.fillRect(rx, sidewalkTop - 12, 4, 15);
    }

    // Pedestrian Traffic Light anchored on right-side midground (always visible cue!)
    this._drawTrafficSignal(ctx, viewW - 56, sidewalkTop + 2, state);

    // Curb
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(0, groundY - 6, viewW, 7);

    // Asphalt Road surface
    const roadHeight = Math.max(108, viewH - groundY + 20);
    const roadGrad = ctx.createLinearGradient(0, groundY, 0, groundY + roadHeight);
    roadGrad.addColorStop(0, pal.starAlpha > 0.55 ? '#1e293b' : '#334155');
    roadGrad.addColorStop(1, pal.starAlpha > 0.55 ? '#0f172a' : '#1e293b');
    ctx.fillStyle = roadGrad;
    ctx.fillRect(0, groundY, viewW, roadHeight);

    // Iconic Scrolling Crosswalk Zebra Stripes!
    const stripePeriod = 92;
    const stripeOff = state.scrollDist % stripePeriod;
    ctx.fillStyle = pal.starAlpha > 0.55 ? 'rgba(226, 232, 240, 0.85)' : 'rgba(255, 255, 255, 0.92)';
    for (let sx = -stripeOff - stripePeriod; sx < viewW + stripePeriod; sx += stripePeriod) {
      // Slight perspective slant for dynamic crosswalk feel
      ctx.beginPath();
      ctx.moveTo(sx + 10, groundY + 12);
      ctx.lineTo(sx + 60, groundY + 12);
      ctx.lineTo(sx + 50, groundY + 52);
      ctx.lineTo(sx, groundY + 52);
      ctx.closePath();
      ctx.fill();
    }

    // Yellow safety tactile edge line at bottom of crosswalk
    ctx.fillStyle = '#facc15';
    ctx.fillRect(0, groundY + 64, viewW, 4);

    // Subtle sidewalk pattern below road (especially nice on tall mobile screens)
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
    // Pole
    ctx.fillStyle = '#334155';
    ctx.fillRect(x - 3, baseY - 102, 6, 102);

    // Housing
    ctx.fillStyle = '#1e293b';
    roundRect(ctx, x - 16, baseY - 114, 32, 54, 7);
    ctx.fill();
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.stroke();

    const isWarn = state.rushState === 'warn';
    const isRush = state.rushState === 'active';
    const blink = Math.floor(state.time * 7) % 2 === 0;

    // Top lamp (Red during Rush)
    const redOn = isRush;
    ctx.fillStyle = redOn ? '#ef4444' : '#3f1d24';
    ctx.beginPath();
    ctx.arc(x, baseY - 99, 9, 0, Math.PI * 2);
    ctx.fill();
    if (redOn) {
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 16;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Bottom lamp (Green normal, blinking during warning)
    const greenOn = !isRush && (!isWarn || blink);
    ctx.fillStyle = greenOn ? '#22c55e' : '#143322';
    ctx.beginPath();
    ctx.arc(x, baseY - 75, 9, 0, Math.PI * 2);
    ctx.fill();
    if (greenOn) {
      ctx.shadowColor = '#22c55e';
      ctx.shadowBlur = 14;
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
      const shadowScale = clamp(1 - ob.airY / 200, 0.35, 1);
      ctx.fillStyle = `rgba(15, 23, 42, ${0.32 * shadowScale})`;
      ctx.beginPath();
      ctx.ellipse(ob.x + ob.w * 0.5, groundY + 8, ob.w * 0.44 * shadowScale, 6 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    switch (ob.kind) {
      case 'cone':
        this._drawCone(ctx, ob, baseY);
        break;
      case 'car':
        this._drawSedan(ctx, ob, baseY, pal, time);
        break;
      case 'sport':
        this._drawSportCar(ctx, ob, baseY, pal, time);
        break;
      case 'truck':
        this._drawTruck(ctx, ob, baseY, pal, time);
        break;
      case 'bird':
        this._drawSeagull(ctx, ob, baseY, time);
        break;
    }

    ctx.restore();
  }

  _drawCone(ctx, ob, baseY) {
    const { x, w, h } = ob;
    // Rubber base
    ctx.fillStyle = '#1e293b';
    roundRect(ctx, x, baseY - 7, w, 7, 3);
    ctx.fill();

    // Orange cone triangle
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.5, baseY - h);
    ctx.lineTo(x + w - 4, baseY - 6);
    ctx.lineTo(x + 4, baseY - 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#9a3412';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Reflective white band
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
    const grad = ctx.createLinearGradient(hx, hy, hx - 125, hy + 18);
    grad.addColorStop(0, `rgba(254, 249, 195, ${alpha * 0.62})`);
    grad.addColorStop(1, 'rgba(254, 249, 195, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(hx, hy - 5);
    ctx.lineTo(hx - 125, hy - 22);
    ctx.lineTo(hx - 125, hy + 28);
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
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.52, 0, Math.PI * 2);
    ctx.fill();
    // Spinning spoke
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(phase) * r * 0.45, cy + Math.sin(phase) * r * 0.45);
    ctx.lineTo(cx - Math.cos(phase) * r * 0.45, cy - Math.sin(phase) * r * 0.45);
    ctx.stroke();
  }

  _drawSedan(ctx, ob, baseY, pal, time) {
    const bob = Math.sin(time * 18 + ob.id) * 1.4;
    const { x, w, h } = ob;
    const y = baseY - h + bob;

    // Night headlight beam (car moves left)
    this._drawHeadlightBeam(ctx, x + 2, y + h - 22, pal.headlightAlpha);

    // Lower body
    ctx.fillStyle = ob.color;
    roundRect(ctx, x, y + 20, w, h - 28, 11);
    ctx.fill();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Cabin roof
    ctx.fillStyle = ob.color;
    ctx.beginPath();
    ctx.moveTo(x + 22, y + 22);
    ctx.quadraticCurveTo(x + 32, y + 2, x + 48, y + 2);
    ctx.lineTo(x + 78, y + 2);
    ctx.quadraticCurveTo(x + 92, y + 2, x + 98, y + 22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Windows
    ctx.fillStyle = '#bae6fd';
    ctx.beginPath();
    ctx.moveTo(x + 28, y + 20);
    ctx.quadraticCurveTo(x + 36, y + 7, x + 48, y + 7);
    ctx.lineTo(x + 58, y + 7);
    ctx.lineTo(x + 58, y + 20);
    ctx.closePath();
    ctx.fill();

    roundRect(ctx, x + 63, y + 7, 26, 13, 4);
    ctx.fill();

    // Headlight (front-left) & Taillight (back-right)
    ctx.fillStyle = '#fef08a';
    roundRect(ctx, x + 2, y + 26, 8, 9, 3);
    ctx.fill();

    ctx.fillStyle = '#dc2626';
    roundRect(ctx, x + w - 9, y + 26, 7, 8, 2);
    ctx.fill();

    // Gloss highlight
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    roundRect(ctx, x + 14, y + 24, w - 28, 4, 2);
    ctx.fill();

    // Wheels
    this._drawWheel(ctx, x + 25, baseY - 11, 11, ob.wheelPhase);
    this._drawWheel(ctx, x + w - 25, baseY - 11, 11, ob.wheelPhase);
  }

  _drawSportCar(ctx, ob, baseY, pal, time) {
    const bob = Math.sin(time * 24 + ob.id) * 1.1;
    const { x, w, h } = ob;
    const y = baseY - h + bob;

    this._drawHeadlightBeam(ctx, x + 2, y + h - 18, pal.headlightAlpha);

    // Rear spoiler
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x + w - 12, y + 6, 4, 12);
    ctx.fillRect(x + w - 16, y + 4, 14, 4);

    // Sleek wedge chassis
    ctx.fillStyle = ob.color;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + h - 11);
    ctx.quadraticCurveTo(x + 2, y + 18, x + 24, y + 14);
    ctx.lineTo(x + 48, y + 3);
    ctx.lineTo(x + 86, y + 3);
    ctx.lineTo(x + w - 4, y + 14);
    ctx.lineTo(x + w - 2, y + h - 11);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Racing stripe
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(x + 12, y + 22, w - 22, 4);

    // Tinted canopy
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(x + 33, y + 16);
    ctx.lineTo(x + 50, y + 6);
    ctx.lineTo(x + 81, y + 6);
    ctx.lineTo(x + 89, y + 16);
    ctx.closePath();
    ctx.fill();

    // Sharp LED headlight
    ctx.fillStyle = '#fef9c3';
    ctx.fillRect(x + 6, y + 19, 10, 5);

    this._drawWheel(ctx, x + 26, baseY - 10, 10, ob.wheelPhase * 1.3);
    this._drawWheel(ctx, x + w - 24, baseY - 10, 10, ob.wheelPhase * 1.3);
  }

  _drawTruck(ctx, ob, baseY, pal, time) {
    const bob = Math.sin(time * 14 + ob.id) * 1.6;
    const { x, w, h } = ob;
    const y = baseY - h + bob;

    this._drawHeadlightBeam(ctx, x + 2, y + h - 24, pal.headlightAlpha);

    // Cargo box (tall right section)
    const cabW = 48;
    ctx.fillStyle = '#f8fafc';
    roundRect(ctx, x + cabW - 2, y, w - cabW + 2, h - 16, 6);
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Colorful brand stripe on cargo box
    ctx.fillStyle = ob.color;
    ctx.fillRect(x + cabW, y + 28, w - cabW - 2, 16);
    // Cute crab/box emblem on truck side
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    roundRect(ctx, x + cabW + 14, y + 32, 34, 8, 3);
    ctx.fill();

    // Cab (front-left)
    ctx.fillStyle = ob.color;
    roundRect(ctx, x, y + 26, cabW + 4, h - 42, 8);
    ctx.fill();
    ctx.stroke();

    // Cab windshield
    ctx.fillStyle = '#bae6fd';
    roundRect(ctx, x + 5, y + 33, 24, 22, 4);
    ctx.fill();

    // Bumper & headlight
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(x - 2, y + h - 22, 12, 7);
    ctx.fillStyle = '#fef08a';
    roundRect(ctx, x + 2, y + h - 34, 8, 9, 2);
    ctx.fill();

    // Roof warning marker
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(x + cabW + 6, y + 6, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Dual wheels
    this._drawWheel(ctx, x + 26, baseY - 13, 13, ob.wheelPhase);
    this._drawWheel(ctx, x + w - 34, baseY - 13, 13, ob.wheelPhase);
    this._drawWheel(ctx, x + w - 62, baseY - 13, 13, ob.wheelPhase);
  }

  _drawSeagull(ctx, ob, baseY, time) {
    const cx = ob.x + ob.w * 0.5;
    const cy = baseY - ob.h * 0.5 + Math.sin(time * 9 + ob.id) * 4;
    const flap = Math.sin(time * 16 + ob.wingPhase);

    ctx.save();
    ctx.translate(cx, cy);

    // Back wing
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(-4, -2);
    ctx.quadraticCurveTo(6, -20 * flap - 8, 18, -14 * flap - 4);
    ctx.lineTo(8, 2);
    ctx.closePath();
    ctx.fill();

    // Plump seagull body (flying left)
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(0, 0, 20, 11, -0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Tail feathers
    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.moveTo(16, -2);
    ctx.lineTo(26, -7);
    ctx.lineTo(24, 3);
    ctx.closePath();
    ctx.fill();

    // Front flapping wing
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.quadraticCurveTo(4, -24 * flap - 2, 16, -16 * flap);
    ctx.lineTo(6, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Beak & eye
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.moveTo(-18, -2);
    ctx.lineTo(-28, 2);
    ctx.lineTo(-18, 5);
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
      // Soft halo
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 22);
      g.addColorStop(0, 'rgba(254, 240, 138, 0.72)');
      g.addColorStop(1, 'rgba(254, 240, 138, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.fill();

      ctx.rotate(Math.sin(time * 3 + c.bobPhase) * 0.25);
      drawStarShape(ctx, 0, 0, 5, 15, 7);
      ctx.fillStyle = '#facc15';
      ctx.fill();
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Inner shine
      ctx.fillStyle = '#fef9c3';
      ctx.beginPath();
      ctx.arc(-3, -3, 3.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (c.type === 'shield') {
      const r = 19;
      const g = ctx.createRadialGradient(-5, -5, 3, 0, 0, r);
      g.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
      g.addColorStop(0.5, 'rgba(56, 189, 248, 0.45)');
      g.addColorStop(1, 'rgba(168, 85, 247, 0.75)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 2.2;
      ctx.stroke();

      // Specular glint
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
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(-5, -4, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  _drawCrab(ctx, state, groundY) {
    const p = state.player;
    const altitude = p.altitude;
    const x = state.playerX;
    const y = groundY + 6 - altitude;

    // Ground shadow linked to altitude
    const shadowScale = clamp(1 - altitude / 240, 0.3, 1);
    ctx.fillStyle = `rgba(15, 23, 42, ${0.38 * shadowScale})`;
    ctx.beginPath();
    ctx.ellipse(x, groundY + 8, 30 * shadowScale, 7 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Fever rainbow afterimage trail
    if (state.feverTimer > 0 && state.trail.length > 0) {
      state.trail.forEach((tr, idx) => {
        const alpha = ((idx + 1) / state.trail.length) * 0.32;
        const hue = (state.time * 360 + idx * 42) % 360;
        ctx.save();
        ctx.translate(tr.x, groundY + 6 - tr.altitude - CRAB.visualH * 0.5);
        ctx.fillStyle = `hsla(${hue}, 95%, 62%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(0, 0, 26 * (0.65 + (idx / state.trail.length) * 0.4), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }

    // Invulnerability blink
    if (p.invulnTimer > 0 && Math.floor(state.time * 18) % 2 === 0 && state.phase === 'playing') {
      return;
    }

    ctx.save();
    // Anchor at bottom-center for clean squash & stretch
    const waddleBob = p.grounded && state.phase === 'playing' ? Math.abs(Math.sin(state.time * 17)) * 4.5 : 0;
    const waddleTilt = p.grounded && state.phase === 'playing' ? Math.sin(state.time * 17) * 0.08 : 0;
    ctx.translate(x, y - waddleBob);

    // Fever aura glow
    if (state.feverTimer > 0) {
      const hue = (state.time * 280) % 360;
      const aura = ctx.createRadialGradient(0, -CRAB.visualH * 0.5, 8, 0, -CRAB.visualH * 0.5, 48);
      aura.addColorStop(0, `hsla(${hue}, 100%, 70%, 0.7)`);
      aura.addColorStop(1, `hsla(${hue}, 100%, 60%, 0)`);
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(0, -CRAB.visualH * 0.5, 48, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.scale(p.scaleX, p.scaleY);
    ctx.translate(0, -CRAB.visualH * 0.5);
    ctx.rotate(p.rotation + waddleTilt);

    if (this.crabImg && this.crabImg.complete && this.crabImg.naturalWidth > 0) {
      ctx.drawImage(this.crabImg, -CRAB.visualW * 0.5, -CRAB.visualH * 0.5, CRAB.visualW, CRAB.visualH);
    } else {
      // Fallback cute pompom crab if image hasn't loaded yet
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(0, 0, 24, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bubble Shield around the crab
    if (p.hasShield) {
      const sr = 40 + Math.sin(state.time * 6) * 1.5;
      const g = ctx.createRadialGradient(-10, -10, 6, 0, 0, sr);
      g.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
      g.addColorStop(0.7, 'rgba(56, 189, 248, 0.16)');
      g.addColorStop(1, 'rgba(168, 85, 247, 0.52)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, sr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(224, 242, 254, 0.85)';
      ctx.lineWidth = 2.4;
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.ellipse(-14, -14, 9, 4.5, -0.65, 0, Math.PI * 2);
      ctx.fill();
    }

    // Dizzy spinning stars on Game Over
    if (state.phase === 'gameover') {
      for (let i = 0; i < 3; i++) {
        const a = state.time * 5 + (i * Math.PI * 2) / 3;
        const sx = Math.cos(a) * 24;
        const sy = -36 + Math.sin(a) * 7;
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

  _drawParticles(ctx, particles, groundY) {
    for (const pt of particles) {
      const alpha = clamp(pt.life / pt.maxLife, 0, 1);
      const px = pt.x;
      const py = groundY + 6 - pt.altitude;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (pt.shape === 'ring') {
        ctx.strokeStyle = pt.color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(px, py, pt.size * (1.8 - alpha * 0.9), 0, Math.PI * 2);
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
    for (let i = 0; i < 10; i++) {
      const y = ((i * 67 + time * 40) % (viewH - 40)) + 20;
      const len = 45 + (i % 3) * 35;
      const x = viewW - (((time * 1150 + i * 213) % (viewW + 160)) - 80);
      const hue = isFever ? (time * 300 + i * 36) % 360 : 45;
      ctx.strokeStyle = isFever
        ? `hsla(${hue}, 100%, 70%, 0.42)`
        : 'rgba(255, 255, 255, 0.28)';
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
      const scale = t < 0.16 ? 0.65 + (t / 0.16) * 0.5 : 1.05;
      const py = groundY + 6 - pop.altitude;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(pop.x, py);
      ctx.scale(scale, scale);
      ctx.font = `900 ${pop.size}px "Hiragino Maru Gothic ProN", "Yu Gothic", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.lineJoin = 'round';
      ctx.strokeText(pop.text, 0, 0);
      ctx.fillStyle = pop.color;
      ctx.fillText(pop.text, 0, 0);
      ctx.restore();
    }
  }
}
