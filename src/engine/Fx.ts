/**
 * DOM-based feedback layer: floating damage numbers, the kill feed, and the
 * center-screen announcer. Kept separate from the 3D engine so it only touches
 * HTML/CSS and never imports Three.js.
 */
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
    el.innerHTML =
      `<span style="color:${killerColor}">${killer}</span>` +
      ` <span class="kf-arrow">\u25B8</span> ` +
      `<span style="color:${victimColor}">${victim}</span>`;
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
