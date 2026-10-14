import { resolveExpressionState, lerpExpressionState } from '../face/resolver.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors = { brows:'#e4572e', eyes:'#2e86de', nose:'#8e44ad', mouth:'#11998e', jaw:'#d35400', neutral:'#7f8c8d' };
const comparisons = { happiness:'happiness_social', sadness:'fear', anger:'disgust', fear:'surprise', surprise:'fear', disgust:'anger', contempt:'happiness' };

export class LookForLesson {
  constructor({ mount, rig, onDone, onSeen, content, continueLabel = 'Continue to baseline' }) {
    Object.assign(this, { mount, rig, onDone, onSeen, content, continueLabel });
    this.index = 0;
    this.value = 0;
    this.previousPreset = rig?.currentPreset || 'front';
    this.previousBlinks = rig?.idleBlinksEnabled;
    if (rig) {
      rig.idleBlinksEnabled = false;
      rig.setCameraPreset('front');
      this.lastRigId = rig.currentRigId;
    }
    this.keydown = event => {
      if (['INPUT','SELECT','TEXTAREA','BUTTON'].includes(event.target.tagName) || event.altKey || event.metaKey || event.ctrlKey) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); this.move(1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); this.move(-1); }
    };
    document.addEventListener('keydown', this.keydown);
    this.rigchange = () => {
      if (this.dead || !this.rig) return;
      if (this.lastRigId !== this.rig.currentRigId) {
        this.lastRigId = this.rig.currentRigId;
        this.rig.setCameraPreset('front');
        this.apply(this.value);
      }
      this.drawAnnotations();
    };
    window.addEventListener('rig:change', this.rigchange);
  }
  async render() {
    this.data = this.content?.lesson || await fetch('./content/lesson.json').then(r => r.json());
    if (this.dead) return;
    document.body.classList.add('lesson-active');
    this.showCard();
    const mount = document.getElementById('rigCanvasMount');
    if (this.rig && mount) {
      this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.svg.classList.add('lesson-annot');
      this.svg.setAttribute('aria-hidden', 'true');
      mount.append(this.svg);
      this.observer = new ResizeObserver(() => this.drawAnnotations());
      this.observer.observe(mount);
      // Re-project after controls, morphs, or a flash have changed the surface.
      const track = () => {
        if (this.dead) return;
        this.drawAnnotations();
        this.trackFrame = requestAnimationFrame(track);
      };
      this.trackFrame = requestAnimationFrame(track);
    }
  }
  showCard() {
    this.stop();
    this.comparing = false;
    this.card = this.data.cards[this.index];
    const c = this.card;
    this.mount.innerHTML = `<article class="level-view lesson-card" data-card="${esc(c.id)}">
      <a href="#/home">← Your path</a>
      <p class="lesson-kicker">WHAT TO LOOK FOR · <span id="lessonProgress" role="status">Card ${this.index + 1} of 7</span></p>
      <h2>${esc(c.title)}</h2><p>${esc(c.subtitle)} · <strong>${esc(c.formula)}</strong></p>
      <p class="muted-text">Study the movement. A face alone cannot establish feelings, honesty, or sincerity. Left and right mean the person’s own sides.</p>
      <div class="lesson-slider">
        <label for="lookForSlider">Neutral ↔ <span id="lessonTarget">${esc(c.title)}</span></label>
        <input id="lookForSlider" type="range" min="0" max="100" value="0" aria-valuetext="0% toward ${esc(c.title.toLowerCase())}" ${this.rig ? '' : 'disabled'}>
        <div class="lesson-slider-ends"><span>Neutral</span><output for="lookForSlider" id="lessonPercent">0%</output><span>${esc(c.title)}</span></div>
      </div>
      <div class="btn-row"><button class="btn btn-secondary" id="lessonPlay" ${this.rig ? '' : 'disabled'}>Play</button><button class="btn btn-secondary" id="lessonFlash" ${this.rig ? '' : 'disabled'}>Flash at 200 ms</button><button class="btn btn-secondary" id="lessonReference">Show reference card</button></div>
      <p class="muted-text" id="lessonMotionStatus" role="status">${this.rig?.reducedMotion ? 'Reduced motion is on. Use the slider to study each position.' : 'Drag the slider to reveal the feature labels.'}</p>
      <figure class="lesson-reference" ${this.rig ? 'hidden' : ''}><img src="./${esc(c.image)}" loading="lazy" alt="Annotated ${esc(c.title)} reference card"><figcaption>Reference rig · compare with your selected live identity.</figcaption></figure>
      <div class="chip-row" aria-label="Action units">${c.aus.map(a => `<button class="chip-btn" data-lesson-au="${a.au}" aria-pressed="false">AU${a.au} · ${esc(a.name)}</button>`).join('')}</div>
      <ul class="lesson-feature-list">${c.annotations.map(a => `<li style="--region:${colors[a.region] || colors.neutral}"><strong>${esc(a.label)}</strong> — ${esc(a.detail)}</li>`).join('')}</ul>
      <aside class="lesson-confused"><h3>Commonly confused with</h3>${c.confusedWith.map(x => `<p><strong>${esc(x.with)}</strong> · ${esc(x.tip)}</p>`).join('')}<button class="btn btn-secondary" id="lessonCompare">Compare with ${esc(comparisons[c.id].replaceAll('_',' '))}</button></aside>
      <p class="lesson-cue"><strong>Tell-tale cue</strong><br>${esc(c.cue)}</p>
      <div class="btn-row"><button class="btn btn-secondary" id="lessonPrev" ${this.index ? '' : 'disabled'}>Prev</button><button class="btn btn-primary" id="lessonNext">${this.index === 6 ? this.continueLabel : 'Next'}</button><button class="btn btn-secondary" id="lessonDone">I'm done</button><button class="lesson-skip" id="lessonSkip">Skip lesson</button></div>
    </article>`;
    this.mount.querySelector('#lookForSlider').oninput = e => { this.stop(); this.apply(Number(e.target.value)); };
    this.mount.querySelector('#lessonPrev').onclick = () => this.move(-1);
    this.mount.querySelector('#lessonNext').onclick = () => this.index === 6 ? this.complete() : this.move(1);
    this.mount.querySelector('#lessonDone').onclick = () => this.complete();
    this.mount.querySelector('#lessonSkip').onclick = () => this.complete();
    this.mount.querySelector('#lessonReference').onclick = e => {
      const figure = this.mount.querySelector('.lesson-reference');
      figure.hidden = !figure.hidden;
      e.target.textContent = figure.hidden ? 'Show reference card' : 'Hide reference card';
    };
    this.mount.querySelector('#lessonCompare').onclick = e => {
      this.stop(); this.comparing = !this.comparing;
      const name = this.comparing ? comparisons[c.id].replaceAll('_',' ') : c.title;
      this.mount.querySelector('#lessonTarget').textContent = name;
      e.target.textContent = this.comparing ? `Return to ${c.title}` : `Compare with ${comparisons[c.id].replaceAll('_',' ')}`;
      this.apply(this.value);
    };
    this.mount.querySelector('#lessonPlay').onclick = () => this.play();
    this.mount.querySelector('#lessonFlash').onclick = async e => {
      this.stop(); this.apply(0); e.target.disabled = true;
      try { await this.rig.flashExpression(this.recipe(), 200); }
      finally { if (!this.dead) { e.target.disabled = false; this.apply(0); } }
    };
    this.mount.querySelectorAll('[data-lesson-au]').forEach(button => button.onclick = () => {
      if (!this.rig) return;
      const on = button.getAttribute('aria-pressed') !== 'true';
      this.mount.querySelectorAll('[data-lesson-au]').forEach(b => b.setAttribute('aria-pressed', String(on && b === button)));
      this.rig.setOverlaysEnabled(on, [Number(button.dataset.lessonAu)]);
    });
    this.apply(0);
    if (this.index === 6) this.onSeen?.();
  }
  recipe() {
    const id = this.comparing ? comparisons[this.card.id] : this.card.recipeId;
    return this.content?.expressions.recipes.find(x => x.id === id) || [];
  }
  apply(value) {
    if (this.dead || !this.card) return;
    this.value = value;
    const name = this.comparing ? comparisons[this.card.id].replaceAll('_',' ') : this.card.title.toLowerCase();
    const slider = this.mount.querySelector('#lookForSlider');
    slider.value = String(value);
    slider.setAttribute('aria-valuetext', `${Math.round(value)}% toward ${name}`);
    this.mount.querySelector('#lessonPercent').textContent = `${Math.round(value)}%`;
    if (this.rig) {
      const peak = this.rig.resolveExpressionState(this.recipe());
      this.rig.applyResolvedState(lerpExpressionState(resolveExpressionState([], this.rig.auCatalog), peak, value / 100));
      this.drawAnnotations();
    }
  }
  drawAnnotations() {
    if (!this.svg || !this.card || !this.rig?.isReady) return;
    const rect = this.rig.canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.svg.style.opacity = this.comparing ? '0' : String(Math.min(1, Math.max(0, (this.value - 50) / 20)));
    this.svg.innerHTML = this.card.annotations.map((a, i) => {
      const p = this.rig.projectLandmark(a.anchor);
      if (!p) return '';
      const x = (p.x + 1) * w / 2, y = (1 - p.y) * h / 2;
      const left = i % 2 === 0;
      const textX = left ? 8 : w - 8;
      const labelY = 30 + Math.floor(i / 2) * Math.min(100, (h - 60) / 3);
      const endX = left ? Math.min(104, w * .28) : w - Math.min(104, w * .28);
      const color = a.au === null ? colors.neutral : colors[a.region];
      const words = a.label.split(' '); const lines = [''];
      for (const word of words) {
        if ((lines.at(-1) + word).length > 17) lines.push('');
        lines[lines.length - 1] += (lines.at(-1) ? ' ' : '') + word;
      }
      return `<g data-anchor="${a.anchor}" style="color:${color}"><path d="M ${endX} ${labelY + 10} L ${x} ${y}" stroke="currentColor" fill="none" stroke-width="1.5"/><circle cx="${x}" cy="${y}" r="3" fill="currentColor"/><text x="${textX}" y="${labelY}" text-anchor="${left ? 'start' : 'end'}" fill="white" font-size="11" font-weight="600" paint-order="stroke" stroke="#17202c" stroke-width="3">${lines.map((line,j) => `<tspan x="${textX}" dy="${j ? 14 : 0}">${esc(line)}</tspan>`).join('')}</text></g>`;
    }).join('');
  }
  play() {
    this.stop();
    if (this.rig.reducedMotion) {
      this.mount.querySelector('#lessonMotionStatus').textContent = 'Reduced motion is on. Drag the slider instead of playing an animation.';
      return;
    }
    const start = performance.now();
    const tick = now => {
      if (this.dead) return;
      const t = Math.min(1, (now - start) / 1500);
      this.apply(100 * Math.sin(t * Math.PI));
      if (t < 1) this.playFrame = requestAnimationFrame(tick);
      else this.apply(0);
    };
    this.playFrame = requestAnimationFrame(tick);
  }
  stop() { if (this.playFrame) cancelAnimationFrame(this.playFrame); this.rig?.scheduler.cancelFlash(); }
  move(delta) {
    const next = Math.max(0, Math.min(6, this.index + delta));
    if (next !== this.index) { this.index = next; this.showCard(); }
  }
  complete() { this.onSeen?.(); this.onDone?.(); }
  dispose() {
    this.dead = true;
    document.body.classList.remove('lesson-active');
    this.stop();
    cancelAnimationFrame(this.trackFrame);
    this.observer?.disconnect();
    this.svg?.remove();
    document.removeEventListener('keydown', this.keydown);
    window.removeEventListener('rig:change', this.rigchange);
    if (this.rig) {
      this.rig.idleBlinksEnabled = this.previousBlinks;
      this.rig.resetToNeutral();
      this.rig.setOverlaysEnabled(false);
      this.rig.setCameraPreset(this.previousPreset);
    }
  }
}
