/**
 * DOM-based feedback layer: floating damage numbers, the kill feed, and the
 * center-screen announcer. Kept separate from the 3D engine so it only touches
 * HTML/CSS and never imports Three.js.
 */

/**
 * Restrict a CSS colour value to a safe subset (hex, rgb(), rgba(), hsl(),
 * hsla(), or a small allow-list of named colours). Anything that could be used
 * to inject additional style declarations (semicolons, `url()`, expressions,
 * etc.) is rejected and falls back to the provided default. This keeps the
 * kill-feed robust against malicious names/colours even if custom player names
 * are introduced later.
 */
const NAMED_COLOR_ALLOWLIST = new Set([
  'white', 'black', 'red', 'lime', 'blue', 'yellow', 'cyan', 'magenta',
  'silver', 'gray', 'grey', 'maroon', 'olive', 'green', 'purple', 'teal',
  'navy', 'orange', 'gold', 'pink', 'brown', 'coral', 'salmon', 'khaki',
]);

function sanitizeColor(input: string, fallback = '#ffffff'): string {
  if (typeof input !== 'string') return fallback;
  const trimmed = input.trim().toLowerCase();
  if (trimmed === '') return fallback;
  if (NAMED_COLOR_ALLOWLIST.has(trimmed)) return trimmed;
  // Hex: #rgb, #rgba, #rrggbb, #rrggbbaa
  if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(trimmed)) return trimmed;
  // Functional notation with strictly numeric/percent/comma/space content only.
  const fnMatch = /^(rgb|rgba|hsl|hsla)\(([^)]*)\)$/.exec(trimmed);
  if (fnMatch) {
    const args = fnMatch[2];
    // Reject anything that isn't a number, percentage, comma, space, slash, or dot.
    if (/^[\d.,%/\s+-]+$/.test(args)) return trimmed;
  }
  return fallback;
}

export class Fx {
  private layer = document.getElementById('fx-layer');
  private killFeed = document.getElementById('kill-feed');
  private announcer = document.getElementById('announcer');
  private announceTimeout = 0;

  damageNumber(screenX: number, screenY: number, amount: number, color = '#ffffff') {
    if (!this.layer) return;
    const el = document.createElement('div');
    el.className = 'fx-dmg';
    el.textContent = `${amount}`;
    el.style.left = `${screenX}px`;
    el.style.top = `${screenY}px`;
    el.style.color = color;
    this.layer.appendChild(el);
    window.setTimeout(() => el.remove(), 750);
  }

  announce(text: string, color = '#ffd23d', big = false) {
    if (!this.announcer) return;
    this.announcer.textContent = text;
    this.announcer.style.color = color;
    this.announcer.style.fontSize = big ? '3.4rem' : '2.4rem';
    // Restart the CSS animation
    this.announcer.classList.remove('show');
    void this.announcer.offsetWidth;
    this.announcer.classList.add('show');
    window.clearTimeout(this.announceTimeout);
    this.announceTimeout = window.setTimeout(() => {
      this.announcer?.classList.remove('show');
    }, 1400);
  }

  killFeedItem(killer: string, killerColor: string, victim: string, victimColor: string) {
    if (!this.killFeed) return;
    const el = document.createElement('div');
    el.className = 'kill-feed-item';

    // Build the kill-feed entry with the DOM API rather than innerHTML so that
    // any future user-supplied names or colour values cannot inject markup.
    // Colour values are constrained to a strict CSS <color> subset to prevent
    // style injection (e.g. `red;background:url(...)`).
    const killerSpan = document.createElement('span');
    killerSpan.textContent = killer;
    killerSpan.style.color = sanitizeColor(killerColor);

    const arrow = document.createElement('span');
    arrow.className = 'kf-arrow';
    arrow.textContent = '\u25B8';

    const victimSpan = document.createElement('span');
    victimSpan.textContent = victim;
    victimSpan.style.color = sanitizeColor(victimColor);

    el.appendChild(killerSpan);
    el.appendChild(document.createTextNode(' '));
    el.appendChild(arrow);
    el.appendChild(document.createTextNode(' '));
    el.appendChild(victimSpan);

    this.killFeed.prepend(el);
    while (this.killFeed.children.length > 4) {
      this.killFeed.lastElementChild?.remove();
    }
    window.setTimeout(() => el.classList.add('fade'), 2600);
    window.setTimeout(() => el.remove(), 3200);
  }

  clear() {
    if (this.killFeed) this.killFeed.innerHTML = '';
    if (this.announcer) this.announcer.classList.remove('show');
    if (this.layer) this.layer.innerHTML = '';
  }
}
