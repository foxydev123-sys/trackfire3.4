/* =====================================================================
   Economy UI: wallet bar, home tank card + buttons, Garage (tanks and
   upgrades), Shop (chests, tank packs, coins, gems), Quests, and the
   Daily reward / Lucky wheel / chest-opening pop-ups. Every action is
   decided by the server; this file only shows things and asks.
   ===================================================================== */
import { setDot } from './dots.js';
import { WalletView, KINDS } from './wallet.js';
import { pop, shake, pulse, play, haptic, lowMotion, Skippable, wait, DUR } from './motion.js';
import { questOrder, questRank } from '../../shared/questorder.js';
import { t, getLang } from '../i18n.js';
import { TANKS, TANK_IDS, MAX_LEVEL, STATS, MAX_STAT, STAT_STEP, statCost, tankStats, statBars, RARITY_COLOR } from '../../shared/tanks.js';
import { ABILITIES, abilityOf, abCost, abNeed, MAX_AB } from '../../shared/abilities.js';
import { ACH, ACH_FAMILIES, ACH_MODES } from '../../shared/achievements.js';
import { CHESTS, CHEST_IDS, WHEEL, DAILY, QUESTS, QUEST_BONUS, TANK_QUESTS, PACK_GEMS, PACK_CARDS, COIN_PACKS, PARTS_PACKS, GEM_PRODUCTS } from '../../shared/economy.js';
import { esc } from './social.js';

const $ = (id) => document.getElementById(id);
const L = (s) => `<span class="ltr">${esc(s)}</span>`;
const fmt = (n) => Number(n).toLocaleString('en-US');
import { ICON_URL } from './icon-urls.js';
// Icons are 3D renders (see icons3d.js) handed over as CSS variables; the flat SVGs below are only the fallback.
export const COIN = '<i class="ic i3 i-coin" aria-hidden="true"></i>';
export const GEM = '<i class="ic i3 i-gem" aria-hidden="true"></i>';
export const PARTS = '<i class="ic i3 i-parts" aria-hidden="true"></i>';
// Parts (the second currency, for upgrades): a steel cog with a bolt
const PARTS_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M8.6 1.5h2.8l.5 2.3 1.6.7 2-1.3 2 2-1.3 2 .7 1.6 2.3.5v2.8l-2.3.5-.7 1.6 1.3 2-2 2-2-1.3-1.6.7-.5 2.3H8.6l-.5-2.3-1.6-.7-2 1.3-2-2 1.3-2-.7-1.6-2.3-.5V8.6l2.3-.5.7-1.6-1.3-2 2-2 2 1.3 1.6-.7z" fill="#9aa6ae" stroke="#46525a" stroke-width="1"/><circle cx="10" cy="10" r="3.2" fill="#e8b64a" stroke="#7a5a10" stroke-width="1"/></svg>';
const COIN_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8.5" fill="#f2c14e" stroke="#9a6a24" stroke-width="1.5"/><circle cx="10" cy="10" r="4.8" fill="none" stroke="#c9912a" stroke-width="1.6"/></svg>';
const GEM_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M4 7.2 7.2 3h5.6L16 7.2 10 17.5z" fill="#46c8ff" stroke="#1b6f9a" stroke-width="1.2" stroke-linejoin="round"/><path d="M4 7.2h12M7.2 3 10 17.5 12.8 3" stroke="#1b6f9a" stroke-width=".8" fill="none"/></svg>';
const CHEST_COL = { common: ['#8d969d', '#b7c0c7'], rare: ['#3d7fd0', '#6aa6ef'], epic: ['#8a45d0', '#b07cf0'], legendary: ['#d8951a', '#f5c24a'] };
function chestFlat(type) {
  const [a, b] = CHEST_COL[type] || CHEST_COL.common;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 56"><rect x="6" y="25" width="52" height="27" rx="3" fill="${a}"/><path d="M6 26 Q6 8 32 8 Q58 8 58 26Z" fill="${b}"/><rect x="5" y="23" width="54" height="5" rx="1" fill="#3a2a1a"/><rect x="27" y="20" width="10" height="13" rx="2" fill="#febd11" stroke="#7a5a10" stroke-width="1.5"/></svg>`;
}
const svgUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
if (typeof document !== 'undefined') {
  const r = document.documentElement.style;
  r.setProperty('--ic-coin', svgUrl(COIN_SVG)); r.setProperty('--ic-gem', svgUrl(GEM_SVG)); r.setProperty('--ic-parts', svgUrl(PARTS_SVG));
  for (const k of Object.keys(CHEST_COL)) { r.setProperty('--ch-' + k, svgUrl(chestFlat(k))); r.setProperty('--cho-' + k, svgUrl(chestFlat(k))); }
}
export function chestSVG(type, cls = '') {
  const k = CHEST_COL[type] ? type : 'common';
  return `<i class="chest c3 ${cls}" style="--c:var(--ch-${k});--co:var(--cho-${k})" aria-hidden="true"></i>`;
}
// For places that need a real image URL (the wheel is an SVG).
const iconUrl = (kind, n) => kind === 'parts' ? 'data:image/svg+xml,' + encodeURIComponent(PARTS_SVG) : kind === 'coins' ? (ICON_URL.coin || 'data:image/svg+xml,' + encodeURIComponent(COIN_SVG)) : kind === 'gems' ? (ICON_URL.gem || 'data:image/svg+xml,' + encodeURIComponent(GEM_SVG)) : (ICON_URL['ch-' + n] || 'data:image/svg+xml,' + encodeURIComponent(chestFlat(n)));
const itemHTML = (r) => r.kind === 'coins' ? `${COIN}<b>${L(fmt(r.n))}</b>` : r.kind === 'parts' ? `${PARTS}<b>${L(fmt(r.n))}</b>` : r.kind === 'gems' ? `${GEM}<b>${L(fmt(r.n))}</b>` : `${chestSVG(r.n, 'sm')}<b>${esc(t('ch_' + r.n))}</b>`;
const tname = (id) => t('tk_' + id);
const rname = (id) => t('r_' + TANKS[id].rarity);

export class EcoUI {
  /** app: { acc, audio, toast, screen(), tankImg(id) } · social: SocialUI (page system + dialogs) */
  constructor(app, social) {
    this.app = app; this.social = social; this.acc = app.acc; this.gSel = null; this.wheelRot = 0; this.dailyAuto = false;
    this.wv = new WalletView(app.audio);          // what the wallet pills SHOW (see wallet.js)
    this.locks = new Set();                        // actions waiting for the server: one at a time each
    this.notices = [];                             // "quest complete" notices waiting for the menu
    social.pages.garage = { title: 'garage', needsAcc: true, render: (b) => this.renderGarage(b) };
    social.pages.shop = { title: 'shop', needsAcc: true, render: (b) => this.renderShop(b) };
    social.pages.quests = { title: 'quests', needsAcc: true, render: (b) => this.renderQuests(b) };
    social.pages.goals = { title: 'goals', needsAcc: true, render: (b) => this.renderGoals(b) };
    this.acc.on('wallet', () => { this.watchDone(); this.renderBar(); this.renderHome(); this.refreshPage(); this.maybeDaily(); this.flushNotices(); });
    this.acc.on('status', () => { this.renderBar(); this.renderHome(); });
    this.acc.on('account', () => { this.renderBar(); this.renderHome(); });
    $('wbCoins').onclick = () => this.go('shop', 'coins');
    $('wbGems').onclick = () => this.go('shop', 'gems');
    $('wbParts').onclick = () => this.go('shop', 'parts');
    $('tankCard').onclick = () => this.go('garage');
    $('btnGarage').onclick = () => this.go('garage');
    $('btnShop').onclick = () => this.go('shop');
    $('btnQuests').onclick = () => this.go('quests');
    $('btnGoals').onclick = () => this.go('goals');
    $('btnDaily').onclick = () => this.openDaily();
    $('btnWheel').onclick = () => this.openWheel();
    $('ecoModal').addEventListener('click', (e) => { if (e.target.id === 'ecoModal' && !this.busy) this.closeModal(); });
    this.payments = new Payments(this);
    setInterval(() => { if (this.social.page === 'quests' && this.app.screen() === 'page') { const el = $('qTimer2'); if (el) el.textContent = this.untilMidnight(); } }, 30000);
  }
  get W() { return this.acc.wallet; }
  async go(page, section) {
    this.section = section || null;
    if (!(await this.app.requireAccount())) return;
    for (let i = 0; i < 40 && !this.W; i++) await new Promise(r => setTimeout(r, 100));   // new account: wallet arrives with the hub hello
    await this.social.go(page);
  }
  // (not while an action is being shown: the server's new wallet arrives before the animation of what
  //  it bought, and re-drawing the page then would pull the cards out from under it — it is redrawn
  //  as soon as the action has finished)
  refreshPage() { if (this.app.screen() === 'page' && ['garage', 'shop', 'quests', 'goals'].includes(this.social.page) && !this.busy && !this.runs) this.social.render(); }
  err(r) { this.app.audio.play('error'); const k = 'e_' + (r.code || 'bad'); this.app.toast(t(k) !== k ? t(k) : t('e_bad')); }

  /* ---------------- wallet bar + home ---------------- */
  renderBar() {
    const W = this.W, sc = this.app.screen();
    $('walletBar').hidden = !W || !this.acc.online || !(sc === 'menu' || sc === 'page');
    if (!W) return;
    // the pills count to the server's numbers — or, while a reward is being shown, wait for it
    this.wv.set({ coins: W.coins, gems: W.gems, parts: W.parts || 0 });
  }

  /* ---------------- acting on the server's answer ----------------
     Every economy action goes through `run`: the button shows it is waiting and cannot be pressed
     again, the wallet pills wait, the server answers, and only THEN does `onOk` animate what the
     server says happened. However it ends — success, refusal, a lost connection — the lock comes
     off and the pills settle on the real numbers. */
  async run(btn, key, request, onOk) {
    if (this.locks.has(key)) return null;                       // a second tap while the first is on its way
    this.locks.add(key); this.runs = (this.runs || 0) + 1;
    if (btn) btn.classList.add('pending');
    this.wv.hold();
    let r;
    try { r = await request(); } catch (e) { r = { t: 'err', code: 'server' }; }
    if (btn) btn.classList.remove('pending');
    try {
      if (r && r.t === 'err') this.fail(r, btn);
      else if (r && onOk) await onOk(r);
    } finally {
      this.locks.delete(key); this.runs--;
      this.wv.release();
      if (!this.runs && $('ecoModal').hidden) this.refreshPage();   // now show the page as it really is
    }
    return r;
  }
  /** The server said no. "Not enough" gets its own quick feedback; anything else the usual message. */
  fail(r, btn) {
    const k = { no_coins: 'coins', no_gems: 'gems', no_parts: 'parts' }[r.code];
    if (k) { this.poor([k], btn); return; }
    this.err(r);
  }
  /** Not enough of `kinds`: the pill shakes, the button shakes, a short sound, one line of text. */
  poor(kinds, btn) {
    this.wv.poor(kinds);
    if (btn) shake(btn);
    this.app.toast(t('e_no_' + kinds[0]));
  }
  /** Which currencies `cost` ({coins, gems, parts}) is short of right now. */
  short(cost) {
    const W = this.W; if (!W || !cost) return [];
    return KINDS.filter((k) => (cost[k] || 0) > (W[k] || 0));
  }
  /** Pay-out: every currency in `got` flies from `from` to its pill, and the pills count up. */
  payout(got, from) {
    if (!got) return Promise.resolve();
    return Promise.all(KINDS.filter((k) => got[k]).map((k) => this.wv.fly(k, from, got[k])));
  }

  /* ---------------- "quest complete" / "achievement completed" ----------------
     The wallet says what is finished; this remembers what the player has already been told, so the
     notice comes once — when it happens, or the first time the menu is shown after it (a quest that
     finished in a match is announced back on the menu, not over the battle). */
  watchDone() {
    const W = this.W; if (!W) return;
    const day = new Date().toISOString().slice(0, 10);
    let seen; try { seen = JSON.parse(localStorage.getItem('kt-done-seen') || 'null'); } catch (e) { seen = null; }
    const first = !seen;                                   // first ever look: remember, don't announce the backlog
    if (!seen || seen.day !== day) seen = { day, q: [], g: (seen && seen.g) || [] };
    this.just = this.just || new Set();
    for (const q of W.quests.list) {
      if (q.claimed || q.prog < q.need || seen.q.includes(q.id)) continue;
      seen.q.push(q.id); this.just.add('q:' + q.id);
      if (!first) this.notices.push({ kind: 'quest', text: t('qt_' + q.id, { n: q.need }) });
    }
    for (const g of (W.ach && W.ach.list) || []) {
      const A = ACH.find((a) => a.id === g.id); if (!A) continue;
      if (g.claimed || g.prog < A.need || seen.g.includes(g.id)) continue;
      seen.g.push(g.id); this.just.add('g:' + g.id);
      if (!first) this.notices.push({ kind: 'goal', text: this.goalLabel(A) });
    }
    try { localStorage.setItem('kt-done-seen', JSON.stringify(seen)); } catch (e) { /* private mode: announce again next time, harmless */ }
  }
  flushNotices() {
    const sc = this.app.screen();
    if (!this.notices.length || !(sc === 'menu' || sc === 'page') || this._noticeOn) return;
    const n = this.notices.shift();
    this._noticeOn = true;
    const el = document.createElement('div');
    el.className = 'm-notice ' + n.kind;
    el.innerHTML = `<span class="n-ic" aria-hidden="true">${n.kind === 'goal' ? '🏆' : '✓'}</span><span><small>${esc(t(n.kind === 'goal' ? 'goalComplete' : 'questComplete'))}</small><b>${esc(n.text)}</b></span>`;
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
    this.app.audio.play(n.kind === 'goal' ? 'goalDone' : 'questDone');
    if (n.kind === 'goal') haptic('reward');
    setTimeout(() => { el.remove(); this._noticeOn = false; this.flushNotices(); }, 2700);
  }
  goalLabel(a) {
    const nice = (n) => n >= 1000000 ? (n / 1000000) + 'M' : n >= 1000 ? (n / 1000) + 'K' : String(n);
    return a.stat === 'mode' ? t('ac_modeOne', { mode: t('m_' + a.mode), n: a.need })
      : a.stat === 'tier' ? t('ac_tierOne', { tier: t(['bronze', 'silver', 'gold', 'plat', 'dia', 'cmd', 'legend'][a.need]) })
      : t('ac_' + a.stat + 'One', { n: nice(a.need) });
  }
  canUpgrade(id) {
    const W = this.W, h = W && W.tanks[id]; if (!h || !h.mods) return false;
    const afford = (c) => c && W.coins >= c.coins && (W.parts || 0) >= c.parts;
    if (afford(abCost(TANKS[id].rarity, h.mods.ab | 0))) return true;
    return STATS.some(k => afford(statCost(id, h.mods[k])));
  }
  questBadge() {
    const W = this.W; if (!W) return 0;
    let n = W.quests.list.filter(q => !q.claimed && q.prog >= q.need).length + (W.quests.list.every(q => q.claimed) && !W.quests.bonus ? 1 : 0);
    for (const [id, q] of Object.entries(W.tankQuests)) if (!q.done && q.prog >= q.need) n++;
    return n;
  }
  renderHome() {
    const W = this.W, on = this.acc.reachable !== false && !window.TRACKFIRE_PRACTICE_ONLY;
    $('ecoSide').hidden = !on;
    if (!on) return;
    const sel = W ? W.sel : 'zagros', lvl = W ? W.tanks[sel].level : 1;
    $('tankCard').innerHTML = `<img class="tk-img" alt="" src="${this.app.tankImg(sel)}"><div class="who"><span class="lbl" style="margin:0">${esc(t('yourTank'))}</span><b>${esc(tname(sel))}</b><span class="rare r-${TANKS[sel].rarity}">${esc(rname(sel))} · ${esc(t('lv', { n: lvl }))}</span></div>`;
    if (!W) { for (const k of ['garage', 'quests', 'goals', 'daily', 'wheel', 'shop']) setDot(k, 0); return; }
    // every count comes straight from the wallet state, so a dot lasts exactly as long as the
    // thing it points at is still waiting — claimed, collected or opened, and it goes
    setDot('garage', TANK_IDS.some(id => this.canUpgrade(id)) ? true : 0);
    setDot('quests', this.questBadge());
    setDot('goals', (W.ach && W.ach.ready) || 0);
    setDot('daily', W.daily.canClaim ? true : 0);
    setDot('wheel', W.wheel.free ? true : 0);
    setDot('shop', Object.values(W.chests || {}).reduce((a, b) => a + b, 0));
    this.flushNotices();                     // anything finished during a match is announced now, on the menu
  }
  maybeDaily() {
    if (this.dailyAuto || !this.W || !this.W.daily.canClaim || this.app.screen() !== 'menu' || !$('ecoModal').hidden) return;
    this.dailyAuto = true; setTimeout(() => { if (this.app.screen() === 'menu' && $('ecoModal').hidden && $('dlg').hidden && $('settings').hidden && $('foundModal').hidden) this.openDaily(); else this.dailyAuto = false; }, 700);
  }

  /* ---------------- garage ---------------- */
  renderGarage(body) {
    const W = this.W; if (!this.gSel || !TANKS[this.gSel]) this.gSel = W.sel;
    const cards = TANK_IDS.map(id => {
      const T = TANKS[id], h = W.tanks[id], up = this.canUpgrade(id);
      const pts = h && h.mods ? STATS.reduce((a, k) => a + h.mods[k], 0) : 0, all = STATS.length * MAX_STAT;
      const bar = h ? (pts < all ? `<div class="cbar ${up ? 'up' : ''}"><i style="width:${pts / all * 100}%"></i><span>${L(pts + '/' + all)}</span></div>` : `<div class="cbar max"><i style="width:100%"></i><span>${esc(t('maxLv'))}</span></div>`) : `<div class="cbar"><span>${esc(t('locked'))}</span></div>`;
      return `<button type="button" class="tk-card r-${T.rarity} ${h ? '' : 'locked'} ${id === this.gSel ? 'cur' : ''}" data-t="${id}">
        ${id === W.sel ? `<span class="pill rk tk-sel">${esc(t('selected'))}</span>` : ''}${up ? '<span class="tk-up" aria-hidden="true">▲</span>' : ''}
        <img class="tk-img" alt="" src="${this.app.tankImg(id)}"><b>${esc(tname(id))}</b><span class="rare r-${T.rarity}">${esc(rname(id))}${h ? ' · ' + esc(t('lv', { n: h.level })) : ''}</span>${bar}</button>`;
    }).join('');
    body.innerHTML = `<div class="garage"><div class="tk-grid">${cards}</div><div class="card tk-detail" id="tkDetail"></div></div>`;
    body.querySelectorAll('.tk-card').forEach(b => b.onclick = () => { this.app.audio.play('click'); this.gSel = b.dataset.t; body.querySelectorAll('.tk-card').forEach(x => x.classList.toggle('cur', x === b)); this.renderDetail(); if (innerWidth < 820) $('tkDetail').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    this.renderDetail();
  }
  renderDetail() {
    const W = this.W, id = this.gSel, T = TANKS[id], h = W.tanks[id], mods = (h && h.mods) || {}, lvl = h ? h.level : 1, el = $('tkDetail');
    const S = tankStats(id, mods), cur = statBars(id, mods);
    const rows = [
      ['hp', cur.hp, `${S.hp}`], ['damage', cur.damage, `${S.dmg[0]}–${S.dmg[1]}${T.spread ? ' ×' + T.spread : ''}`],
      ['fireRate', cur.fireRate, `${S.reload} s`], ['speed', cur.speed, `${S.speed}`], ['range', cur.range, `${S.range} m`],
    ];
    if (T.armor) rows.push(['armor', T.armor / 0.3, `${Math.round(T.armor * 100)}%`]);
    const bars = rows.map(([k, a, v]) => `<div class="stbar"><span>${esc(t('st_' + k))}</span><div class="sb"><i style="width:${Math.min(100, a * 100)}%"></i></div><b>${L(v)}</b></div>`).join('');
    let acts = '', ups = '';
    if (h) {
      acts += id === W.sel ? `<button class="btn" disabled>${esc(t('selected'))}</button>` : `<button class="btn" id="tkSelect">${esc(t('selectTank'))}</button>`;
      // the tank's special power: what it does, how upgraded it is, and what the next level costs
      const ab = abilityOf(id), A = ab && ABILITIES[ab];
      if (A) {
        const n = mods.ab | 0, c = abCost(T.rarity, n), ok = c && W.coins >= c.coins && (W.parts || 0) >= c.parts;
        const pips = Array.from({ length: MAX_AB }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
        const cd = abNeed(ab, n);
        ups += `<p class="lbl" style="margin:8px 0 0">${esc(t('abPower'))}</p>
          <div class="ab-card ${c ? '' : 'max'}" data-row="ab">
            <span class="ab-ic" aria-hidden="true">${A.icon}</span>
            <div class="ab-txt"><b>${esc(t('ab_' + ab))}</b><small>${esc(t('abd_' + ab))}</small><small class="ab-how">${esc(t('abCharge'))}</small>
              <span class="ab-meta"><span class="pips">${pips}</span><em class="ltr">${esc(t('abCool', { s: cd }))}</em></span></div>
            ${c ? `<button class="btn ${ok ? 'primary' : 'cant'}" data-up="ab" data-c="${c.coins}" data-p="${c.parts}"><span>${esc(t('abUpgrade'))}</span><small class="cost">${COIN}${L(fmt(c.coins))} ${PARTS}${L(fmt(c.parts))}</small></button>`
                : `<button class="btn" disabled>${esc(t('abMax'))}</button>`}
          </div>`;
      }
      // one row per stat: its level, what the next step gives, and its price in coins + parts
      ups += `<p class="lbl" style="margin:8px 0 0">${esc(t('upPick'))}</p><div class="up-rows">` + STATS.map(k => {
        const n = mods[k] || 0, c = statCost(id, n), ok = c && W.coins >= c.coins && (W.parts || 0) >= c.parts;
        const pips = Array.from({ length: MAX_STAT }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
        const gain = k === 'rel' ? `−${Math.round(STAT_STEP[k] * 100)}%` : `+${Math.round(STAT_STEP[k] * 100)}%`;
        return `<div class="up-row ${c ? '' : 'max'}" data-row="${k}"><span class="nm"><b>${esc(t('up_' + k))}</b><small>${c ? esc(t('upNext', { v: gain })) : esc(t('maxLv'))}</small></span><span class="pips">${pips}</span>
          ${c ? `<button class="btn ${ok ? 'primary' : 'cant'}" data-up="${k}" data-c="${c.coins}" data-p="${c.parts}"><span class="cost">${COIN}${L(fmt(c.coins))} ${PARTS}${L(fmt(c.parts))}</span></button>` : `<button class="btn" disabled>✔</button>`}</div>`;
      }).join('') + '</div>';
    } else {
      const q = W.tankQuests[id];
      acts += `<p class="lbl" style="margin:0">${esc(t('howUnlock'))}</p><ul class="rules"><li>${esc(t('unlockChest'))}</li>${q ? `<li>${esc(t('unlockQuest'))} ${esc(t('tq_' + q.stat, { n: q.need }))} <b class="ltr">(${Math.min(q.prog, q.need)}/${q.need})</b></li>` : ''}<li>${esc(t('unlockPack'))}</li></ul>
        <button class="btn primary" id="tkPack"><span>${esc(t('packDesc', { n: PACK_CARDS }))}</span><small class="cost">${GEM}${L(fmt(PACK_GEMS[T.rarity]))}</small></button>`;
    }
    // SELECT sits directly under the tank's name. It used to be the very last thing on the panel,
    // below every stat and upgrade row, so equipping a tank meant scrolling past all of it first —
    // on a phone that is a long way to go for the one button everybody actually came for.
    el.innerHTML = `<div class="tk-hero"><img class="tk-img big" alt="" src="${this.app.tankImg(id)}"><div><h3>${esc(tname(id))}</h3><span class="rare r-${T.rarity}">${esc(rname(id))}${h ? ' · ' + esc(t('lv', { n: lvl })) + ' / ' + MAX_LEVEL : ''}</span></div></div>
      <div class="tk-acts top">${acts}</div><p class="sub">${esc(t('td_' + id))}</p><div class="stbars">${bars}</div>${ups}`;
    if ($('tkSelect')) $('tkSelect').onclick = () => { this.app.audio.play('click');
      this.run($('tkSelect'), 'select', () => this.acc.eco('select', { tank: id }), () => { this.app.audio.play('pop'); const im = el.querySelector('.tk-hero .tk-img'); if (im) play(im, 'hop'); }); };
    el.querySelectorAll('[data-up]').forEach(b => b.onclick = () => {
      this.app.audio.play('click');
      const cost = { coins: +b.dataset.c, parts: +b.dataset.p }, lack = this.short(cost);
      if (lack.length) return this.poor(lack, b);             // said no before asking the server
      const stat = b.dataset.up, before = { level: lvl, bars: [...el.querySelectorAll('.sb i')].map(i => i.style.width) };
      this.busy = true;                                        // keep the page still while it animates
      this.run(b, 'up:' + id, () => this.acc.eco('upgrade', { tank: id, stat }), async (r) => {
        // the price leaves the wallet, then the upgrade lands where you are looking
        this.wv.spend('coins', cost.coins); if (cost.parts) this.wv.spend('parts', cost.parts);
        this.app.audio.play('upgrade'); haptic('buy');
        this.renderDetail();
        this.landUpgrade(stat, r.res, before);
        await wait(DUR.reward);
      }).finally(() => { this.busy = false; });
    });
    if ($('tkPack')) $('tkPack').onclick = async () => {
      const lack = this.short({ gems: PACK_GEMS[T.rarity] }); if (lack.length) return this.poor(lack, $('tkPack'));
      if (!(await this.social.confirm(`${tname(id)} · ${t('packDesc', { n: PACK_CARDS })} · ${PACK_GEMS[T.rarity]} ${t('gemsLbl')}?`))) return;
      this.run($('tkPack'), 'pack', () => this.acc.eco('pack', { tank: id }), (r) => { this.wv.spend('gems', PACK_GEMS[T.rarity]); this.app.audio.play('purchase'); haptic('buy'); return this.showOpened(r.res.opened); });
    };
  }
  /**
   * An upgrade has landed (the server said so): the new pip pops into place, the stat bars grow
   * from where they were to where they are now, the tank gives a little hop, and if the tank went
   * up a level a "LV n" badge floats off it. All on the panel you are already looking at.
   */
  landUpgrade(stat, res, before) {
    const el = $('tkDetail'); if (!el) return;
    const row = el.querySelector(`[data-row="${stat}"]`);
    if (row) {
      const on = row.querySelectorAll('.pips i.on'), last = on[on.length - 1];
      if (last) last.classList.add('fresh');
      pulse(row);
    }
    const bars = [...el.querySelectorAll('.sb i')];
    bars.forEach((b, i) => { const to = b.style.width; if (before.bars[i] && before.bars[i] !== to) { b.style.transition = 'none'; b.style.width = before.bars[i]; void b.offsetWidth; b.style.transition = ''; b.style.width = to; } });
    const im = el.querySelector('.tk-hero .tk-img'); if (im) play(im, 'hop');
    if (res && res.level > before.level) {
      const tag = document.createElement('span'); tag.className = 'lv-pop'; tag.textContent = t('lv', { n: res.level });
      el.appendChild(tag); setTimeout(() => tag.remove(), 1300);
    }
  }

  /* ---------------- shop ---------------- */
  renderShop(body) {
    const W = this.W, mine = Object.entries(W.chests || {}).filter(([, n]) => n > 0);
    const chest = (id) => { const C = CHESTS[id];
      return `<div class="card shop-chest r-${id}">${chestSVG(id, 'lg')}<b>${esc(t('ch_' + id))}</b><span class="muted" style="font-size:12.5px">${esc(t('chestHas', { n: C.cards, a: C.coins[0], b: C.coins[1] }))}</span>
        <div class="row" style="justify-content:center">${C.price.coins ? `<button class="btn sm price" data-buy="${id}" data-cur="coins">${COIN}${L(fmt(C.price.coins))}</button>` : ''}${C.price.gems ? `<button class="btn sm price" data-buy="${id}" data-cur="gems">${GEM}${L(fmt(C.price.gems))}</button>` : ''}</div>
        <button type="button" class="linkbtn" data-odds="${id}">${esc(t('chances'))}</button></div>`; };
    const packs = TANK_IDS.filter(id => !W.tanks[id]).map(id => `<div class="card shop-pack r-${TANKS[id].rarity}"><img class="tk-img" alt="" src="${this.app.tankImg(id)}"><b>${esc(tname(id))}</b><span class="rare r-${TANKS[id].rarity}">${esc(rname(id))}</span><span class="muted" style="font-size:12px">${esc(t('packDesc', { n: PACK_CARDS }))}</span><button class="btn sm price" data-pack="${id}">${GEM}${L(fmt(PACK_GEMS[TANKS[id].rarity]))}</button></div>`).join('');
    const coinPacks = COIN_PACKS.map(p => `<div class="card shop-coins"><div class="big-ic">${COIN}</div><b>${L(fmt(p.coins))}</b><button class="btn sm price" data-coins="${p.id}">${GEM}${L(fmt(p.gems))}</button></div>`).join('');
    const partsPacks = PARTS_PACKS.map(p => `<div class="card shop-coins"><div class="big-ic">${PARTS}</div><b>${L(fmt(p.parts))}</b><button class="btn sm price" data-parts="${p.id}">${GEM}${L(fmt(p.gems))}</button></div>`).join('');
    const gems = GEM_PRODUCTS.filter(p => !(p.once && W.starterBought)).map(p => `<div class="card shop-gems ${p.tag || ''}">${p.tag ? `<span class="pill ${p.tag === 'starter' ? 'new' : 'wk'}">${esc(t(p.tag === 'starter' ? 'starter' : p.tag === 'best' ? 'bestValue' : 'popular'))}</span>` : ''}<div class="big-ic">${p.chest ? chestSVG(p.chest, 'sm') : ''}${GEM}</div><b>${L(fmt(p.gems))}</b>${p.chest ? `<span class="muted" style="font-size:12px">${esc(t('starterDesc', { g: p.gems }))}</span>` : ''}<button class="btn sm primary price" data-gem="${p.id}">${L(this.payments.price(p))}</button></div>`).join('');
    const payNote = W.payments.test ? t('payTest') : this.payments.available() ? '' : t('payLater');
    body.innerHTML = `
      ${mine.length ? `<div class="card"><p class="lbl">${esc(t('myChests'))}</p><div class="row">${mine.map(([id, n]) => `<div class="mychest">${chestSVG(id, 'md')}<span>${esc(t('ch_' + id))} ×${n}</span><button class="btn sm primary" data-open="${id}">${esc(t('open'))}</button></div>`).join('')}</div></div>` : ''}
      <section id="sec-chests"><p class="lbl">${esc(t('chests'))}</p><div class="shop-grid">${CHEST_IDS.map(chest).join('')}</div><p class="sub" style="font-size:12.5px;margin-top:8px">${esc(t('randomNote'))}</p></section>
      ${packs ? `<section><p class="lbl">${esc(t('tankPacks'))}</p><div class="shop-grid">${packs}</div></section>` : ''}
      <section id="sec-coins"><p class="lbl">${esc(t('buyCoins'))}</p><div class="shop-grid">${coinPacks}</div></section>
      <section id="sec-parts"><p class="lbl">${esc(t('buyParts'))}</p><p class="sub" style="font-size:12.5px;margin:0 0 8px">${esc(t('partsNote'))}</p><div class="shop-grid">${partsPacks}</div></section>
      ${W.payments.play || W.payments.test ? `<section id="sec-gems"><p class="lbl">${esc(t('buyGems'))}</p>${payNote ? `<p class="note" style="margin:0 0 10px">${esc(payNote)}</p>` : ''}<div class="shop-grid">${gems}</div></section>` : ''}`;
    // Every purchase: can you afford it (said at once if not) → the server buys it → the price leaves
    // the wallet → the card you bought from reacts → whatever you bought is shown.
    const bought = (b, cur, price) => { this.wv.spend(cur, price); this.app.audio.play('purchase'); haptic('buy'); const c = b.closest('.card'); if (c) play(c, 'bought'); };
    body.querySelectorAll('[data-buy]').forEach(b => b.onclick = async () => {
      const id = b.dataset.buy, cur = b.dataset.cur, price = CHESTS[id].price[cur];
      this.app.audio.play('click');
      if (this.short({ [cur]: price }).length) return this.poor([cur], b);
      if (cur === 'gems' && !(await this.social.confirm(`${t('ch_' + id)} · ${price} ${t('gemsLbl')}?`))) return;
      this.run(b, 'buy', () => this.acc.eco('buyChest', { type: id, cur }), (r) => { bought(b, cur, price); return this.showOpened(r.res.opened); });
    });
    body.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { this.app.audio.play('click');
      this.run(b, 'open', () => this.acc.eco('open', { type: b.dataset.open }), (r) => this.showOpened(r.res.opened)); });
    body.querySelectorAll('[data-odds]').forEach(b => b.onclick = () => this.showOdds(b.dataset.odds));
    body.querySelectorAll('[data-pack]').forEach(b => b.onclick = async () => {
      const id = b.dataset.pack, price = PACK_GEMS[TANKS[id].rarity];
      this.app.audio.play('click');
      if (this.short({ gems: price }).length) return this.poor(['gems'], b);
      if (!(await this.social.confirm(`${tname(id)} · ${price} ${t('gemsLbl')}?`))) return;
      this.run(b, 'buy', () => this.acc.eco('pack', { tank: id }), (r) => { bought(b, 'gems', price); return this.showOpened(r.res.opened); });
    });
    body.querySelectorAll('[data-coins]').forEach(b => b.onclick = () => {
      const P = COIN_PACKS.find(p => p.id === b.dataset.coins); this.app.audio.play('click');
      if (this.short({ gems: P.gems }).length) return this.poor(['gems'], b);
      this.run(b, 'buy', () => this.acc.eco('coins', { pack: P.id }), async (r) => { bought(b, 'gems', P.gems); await wait(DUR.normal); await this.payout(r.res.got, b.closest('.card').querySelector('.big-ic') || b); });
    });
    body.querySelectorAll('[data-parts]').forEach(b => b.onclick = () => {
      const P = PARTS_PACKS.find(p => p.id === b.dataset.parts); this.app.audio.play('click');
      if (this.short({ gems: P.gems }).length) return this.poor(['gems'], b);
      this.run(b, 'buy', () => this.acc.eco('parts', { pack: P.id }), async (r) => { bought(b, 'gems', P.gems); await wait(DUR.normal); await this.payout(r.res.got, b.closest('.card').querySelector('.big-ic') || b); });
    });
    body.querySelectorAll('[data-gem]').forEach(b => b.onclick = () => this.payments.buy(b.dataset.gem));
    if (this.section) { const s = $('sec-' + this.section); this.section = null; if (s) setTimeout(() => s.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }
  }
  showOdds(id) {
    const C = CHESTS[id], pct = (p) => (Math.round(p * 1000) / 10) + '%';
    const g = Object.entries(C.guarantee || {}).map(([r, n]) => `<li>${esc(t('guaranteed', { n, r: t('r_' + r) }))}</li>`).join('');
    const rows = Object.entries(C.odds).map(([r, p]) => `<tr><td><span class="rare r-${r}">${esc(t('r_' + r))}</span><div class="muted" style="font-size:11.5px">${TANK_IDS.filter(x => TANKS[x].rarity === r).map(tname).map(esc).join(' · ')}</div></td><td class="n">${L(pct(p))}</td></tr>`).join('');
    this.modal(`<div class="odds">${chestSVG(id, 'md')}<h4>${esc(t('ch_' + id))}</h4><p class="sub" style="font-size:13px">${esc(t('chancesT'))}</p>
      <table class="lbt odds-t"><tbody>${rows}</tbody></table><ul class="rules">${g}<li>${esc(t('chestHas', { n: C.cards, a: C.coins[0], b: C.coins[1] }))}${C.gems[1] ? ` · ${L(C.gems[0] + '–' + C.gems[1])} ${esc(t('gemsLbl'))}` : ''}</li></ul>
      <button class="btn primary" data-close style="justify-content:center">${esc(t('done'))}</button></div>`);
  }

  /* ---------------- chest opening ----------------
     ANTICIPATION → OPEN → REVEAL → REWARD → COLLECT. What is inside was decided by the server before
     any of this starts (`o` is its answer); the show only reveals it. Tapping hurries the show along
     but never skips a step, and nothing in it can pay out twice — the wallet already holds the
     prize, the flying coins only show it arriving.

     Bigger chests and better rewards get more build-up: a common chest shakes twice and opens; a
     rare one gathers light first; an epic/legendary chest — or a new tank inside — gets a third,
     harder shake and a grander reveal. Returns a promise that settles when the window closes. */
  showOpened(o) {
    const isBox = !(o.type === 'pack' || o.type === 'quest');
    const k = CHEST_COL[o.type] ? o.type : 'common';
    const tierOf = (c) => c.new || TANKS[c.tank].rarity === 'legendary' ? 't-top' : ['rare', 'epic'].includes(TANKS[c.tank].rarity) ? 't-better' : 't-common';
    const grand = o.cards.some(c => tierOf(c) === 't-top') || k === 'epic' || k === 'legendary';
    const rare = grand || k === 'rare';
    const cur = ['coins', 'parts', 'gems'].filter(x => o[x]);            // one at a time, in that order
    const ICONS = { coins: COIN, gems: GEM, parts: PARTS };
    const chips = cur.map(x => `<span class="got rv" data-k="${x}">${ICONS[x]}<b class="ltr">+0</b></span>`).join('');
    const cards = o.cards.map((c) => { const T = TANKS[c.tank];
      return `<div class="oc rv ${tierOf(c)} r-${T.rarity} ${c.new ? 'isnew' : ''}">${c.new ? `<span class="newtag">${esc(t('newTank'))}</span>` : ''}<img class="tk-img" alt="" src="${this.app.tankImg(c.tank)}"><b>${esc(tname(c.tank))}</b><span class="n">${L('×' + c.n)}</span>${c.coins ? `<small>${COIN}${L('+' + c.coins)}</small>` : ''}${c.parts ? `<small>${PARTS}${L('+' + c.parts)}</small>` : ''}</div>`; }).join('');
    const box = isBox ? `<div class="chest-open r-${k}" id="chestOpen"><div class="rays"></div><i class="chest c3 xl" style="--c:var(--ch-${k});--co:var(--cho-${k})"></i><div class="burst" id="chestBurst"></div></div>` : '';
    this.modal(`<div class="opened" id="openedBox">${box}<h4 class="rv">${esc(t('youGot'))}</h4><div class="row" style="justify-content:center">${chips}</div><div class="oc-grid">${cards}</div>
      <p class="skip-hint">${esc(t('tapFaster'))}</p>
      <button class="btn primary" id="chestCollect" style="justify-content:center">${esc(cur.length ? t('collect') : t('done'))}</button></div>`, 'wide');
    const A = this.app.audio, low = lowMotion(), seq = this.seq = new Skippable(), ob = $('openedBox');
    $('ecoCard').onclick = (e) => { if (!e.target.closest('button')) seq.hurry(); };
    document.body.classList.toggle('low-motion', low);
    this.busy = true;                                                     // the backdrop does not close it mid-show
    const count = (el, n) => {                                            // a chip counts up to its amount as it appears
      const b = el.querySelector('b'), t0 = performance.now(), d = seq.fast ? 120 : 420;
      const f = (now) => { const u = Math.min(1, (now - t0) / d); b.textContent = '+' + fmt(Math.round(n * (1 - Math.pow(1 - u, 3)))); if (u < 1 && b.isConnected) requestAnimationFrame(f); };
      requestAnimationFrame(f);
    };
    return new Promise((resolve) => {
      this._seqDone = () => { seq.stop(); this._seqDone = null; resolve(); };
      (async () => {
        const co = $('chestOpen');
        if (co) {
          // 1. the chest comes into focus (CSS chestIn), then 2. anticipation
          await seq.step(300);
          co.classList.add('shake1'); A.play('chestShake'); haptic('tap');
          await seq.step(380);                                            // … a pause …
          co.classList.remove('shake1'); co.classList.add('shake2'); A.play('chestShake2');
          await seq.step(330);
          if (rare) { co.classList.add('charge'); A.play('chestCharge'); await seq.step(grand ? 420 : 340); }
          if (grand) { co.classList.remove('shake2'); void co.offsetWidth; co.classList.add('shake3'); A.play('chestShake2'); await seq.step(380); }
          if (!ob.isConnected) return;
          // 3. open: flash, a small burst, the lid
          co.classList.remove('shake2', 'shake3', 'charge'); co.classList.add('open'); A.play('chestOpen'); haptic('big');
          const fl = document.createElement('div'); fl.className = 'chest-flash'; co.appendChild(fl);
          const burst = $('chestBurst'), n = low ? 8 : (grand ? 20 : 14);
          for (let i = 0; i < n; i++) { const sp = document.createElement('i'), a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 90;
            sp.style.setProperty('--dx', Math.cos(a) * d + 'px'); sp.style.setProperty('--dy', Math.sin(a) * d * 0.8 - 30 + 'px'); sp.style.animationDelay = (Math.random() * 0.1) + 's'; burst.appendChild(sp); }
          await seq.step(300);
        } else { A.play('reward'); }
        // 4. reveal, one at a time: the currencies (each counts up), then the tank cards
        const h = ob.querySelector('h4.rv'); if (h) h.classList.add('in');
        for (const el of ob.querySelectorAll('.got.rv')) {
          if (!el.isConnected) return;
          el.classList.add('in'); A.play('reveal'); count(el, o[el.dataset.k]);
          await seq.step(220);
        }
        let bigDone = false;
        for (const el of ob.querySelectorAll('.oc.rv')) {
          if (!el.isConnected) return;
          const top = el.classList.contains('t-top'), better = el.classList.contains('t-better');
          // the FIRST big one gets a beat of suspense and the full flourish; any more after it come
          // quicker, so a chest full of new tanks is still a short show
          const big = top && !bigDone;
          if (big) { bigDone = true; await seq.step(150); }
          el.classList.add('in'); A.play(big ? 'revealTop' : top || better ? 'revealBetter' : 'reveal');
          if (big) haptic('reward');
          await seq.step(big ? 480 : top || better ? 260 : 180);
        }
        // 5. ready to collect
        ob.classList.add('done'); this.busy = false;
      })();
      // COLLECT: the coins / parts / gems fly from where they were revealed into the wallet
      $('chestCollect').onclick = async () => {
        const b = $('chestCollect'); if (!b || b.disabled) return;
        b.disabled = true; A.play('click');
        await Promise.all(cur.map(x => this.wv.fly(x, ob.querySelector(`.got[data-k="${x}"]`), o[x])));
        await wait(DUR.normal);
        this.closeModal();
      };
    });
  }
  /**
   * A plain pay-out (daily reward, a spin, a bought pack of coins…): the items appear one by one,
   * then the currencies fly home by themselves. Chests in it can be opened from here.
   * Returns a promise that settles when the window closes.
   */
  showGot(got) {
    if (!got) return Promise.resolve();
    const items = [];
    if (got.coins) items.push({ kind: 'coins', n: got.coins }); if (got.parts) items.push({ kind: 'parts', n: got.parts }); if (got.gems) items.push({ kind: 'gems', n: got.gems });
    for (const c of got.chests || []) items.push({ kind: 'chest', n: c });
    const chests = got.chests || [];
    this.modal(`<div class="gotbox opened" id="gotBox"><h4>${esc(t('youGot'))}</h4><div class="got-list">${items.map(r => `<div class="got rv" ${r.kind !== 'chest' ? `data-k="${r.kind}"` : ''}>${itemHTML(r)}</div>`).join('')}</div>
      <div class="row">${chests.length ? `<button class="btn primary" id="gotOpen" style="flex:1;justify-content:center">${esc(t('open'))}</button>` : ''}<button class="btn ${chests.length ? 'ghost' : 'primary'}" data-close style="flex:1;justify-content:center">${esc(t('done'))}</button></div></div>`);
    const A = this.app.audio, gb = $('gotBox'), seq = this.seq = new Skippable();
    $('ecoCard').onclick = (e) => { if (!e.target.closest('button')) seq.hurry(); };
    return new Promise((resolve) => {
      this._seqDone = () => { seq.stop(); this._seqDone = null; resolve(); };
      (async () => {
        for (const el of gb.querySelectorAll('.got.rv')) { if (!el.isConnected) return; el.classList.add('in'); A.play('reveal'); await seq.step(260); }
        gb.classList.add('done');
        await seq.step(200);
        if (!gb.isConnected) return;
        await Promise.all(KINDS.filter(k => got[k]).map(k => this.wv.fly(k, gb.querySelector(`.got[data-k="${k}"]`), got[k])));
      })();
      if ($('gotOpen')) $('gotOpen').onclick = () => this.run($('gotOpen'), 'open', () => this.acc.eco('open', { type: chests[0] }), (r) => this.showOpened(r.res.opened));
    });
  }

  /* ---------------- daily reward ---------------- */
  async openDaily() {
    if (!(await this.app.requireAccount())) return;
    for (let i = 0; i < 40 && !this.W; i++) await new Promise(r => setTimeout(r, 100));
    const W = this.W; if (!W) return;
    const D = W.daily;
    const tiles = DAILY.map((rw, i) => { const past = D.canClaim ? i < D.day : i <= D.day, today = D.canClaim && i === D.day;
      return `<div class="dtile ${past ? 'past' : ''} ${today ? 'today' : ''} ${i === 6 ? 'big' : ''}"><span>${esc(t('dayN', { n: i + 1 }))}</span><div class="dt-items">${rw.map(r => `<div>${itemHTML(r)}</div>`).join('')}</div>${past ? '<i class="tick" aria-hidden="true">✓</i>' : ''}</div>`; }).join('');
    this.modal(`<div class="daily"><h4>${esc(t('daily'))}</h4><p class="sub" style="font-size:13px">${esc(t('dailySub'))}${W.daily.streak ? ' · ' + esc(t('streakN', { n: W.daily.streak })) : ''}</p><div class="dgrid">${tiles}</div>
      ${D.canClaim ? `<button class="btn primary" id="dClaim" style="justify-content:center">${esc(t('claim'))}</button>` : `<p class="sub" style="text-align:center">${esc(t('dailyDone', { n: (D.day + 1) % 7 + 1 }))}</p><button class="btn" data-close style="justify-content:center">${esc(t('done'))}</button>`}</div>`, 'wide');
    if ($('dClaim')) $('dClaim').onclick = () => { const b = $('dClaim'); this.app.audio.play('click');
      this.run(b, 'daily', () => this.acc.eco('daily'), async (r) => {
        const tile = document.querySelector('.dtile.today'); if (tile) { pop(tile); tile.classList.add('past'); }
        this.app.audio.play('reward'); haptic('reward');
        await wait(DUR.normal);
        return this.showGot(r.res.got);
      }); };
  }

  /* ---------------- lucky wheel ---------------- */
  async openWheel() {
    if (!(await this.app.requireAccount())) return;
    for (let i = 0; i < 40 && !this.W; i++) await new Promise(r => setTimeout(r, 100));
    const W = this.W; if (!W) return;
    const n = WHEEL.segments.length, a = 360 / n;
    const P = (deg, r) => { const rad = (deg - 90) * Math.PI / 180; return [100 + r * Math.cos(rad), 100 + r * Math.sin(rad)]; };
    const segs = WHEEL.segments.map((s, i) => {
      const [x1, y1] = P(i * a, 96), [x2, y2] = P((i + 1) * a, 96), [lx, ly] = P(i * a + a / 2, 64);
      const label = s.kind === 'chest' ? '' : fmt(s.n);
      return `<path d="M100 100 L${x1.toFixed(2)} ${y1.toFixed(2)} A96 96 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}Z" fill="${s.color}" stroke="#1b1206" stroke-width="1.5"/>
        <g transform="translate(${lx.toFixed(1)} ${ly.toFixed(1)}) rotate(${(i * a + a / 2).toFixed(1)})"><image href="${iconUrl(s.kind, s.n)}" x="-13" y="-24" width="26" height="26"/><text y="14" text-anchor="middle" font-size="11" font-weight="700" fill="#1b1206" font-family="Chakra Petch, sans-serif">${label}</text></g>`;
    }).join('');
    const odds = WHEEL.segments.map(s => `<tr><td>${itemHTML({ kind: s.kind, n: s.n })}</td><td class="n">${L(s.p + '%')}</td></tr>`).join('');
    this.modal(`<div class="wheelbox"><h4>${esc(t('wheel'))}</h4>
      <div class="wheel-wrap"><div class="wheel-ptr" aria-hidden="true"></div><svg class="wheel" id="wheelSvg" viewBox="0 0 200 200" style="transform:rotate(${this.wheelRot}deg)">${segs}<circle cx="100" cy="100" r="15" fill="#1b1206" stroke="#f5a53c" stroke-width="3"/></svg></div>
      <div class="row" style="justify-content:center">${W.wheel.free ? `<button class="btn primary" id="spinFree">${esc(t('spinFree'))}</button>` : ''}<button class="btn ${W.wheel.free ? '' : 'primary'}" id="spinPaid" ${W.wheel.paidLeft > 0 ? '' : 'disabled'}>${esc(t('spinGems', { n: '' }))}${GEM}${L(WHEEL.spinGems)}</button></div>
      <p class="sub" style="text-align:center;font-size:12.5px">${W.wheel.free ? '' : esc(t('freeTomorrow')) + ' · '}${esc(t('spinsLeft', { n: W.wheel.paidLeft }))}</p>
      <details><summary class="linkbtn">${esc(t('chances'))}</summary><table class="lbt odds-t"><tbody>${odds}</tbody></table></details>
      <button class="btn ghost" data-close style="justify-content:center">${esc(t('done'))}</button></div>`);
    const spin = async (paid) => {
      if (this.busy || this.locks.has('spin')) return; this.busy = true; this.locks.add('spin');
      this.wv.hold();                                    // the pills wait for the prize, not for the server
      let r; try { r = await this.acc.eco('spin', { paid }); } catch (e) { r = { t: 'err', code: 'server' }; }
      if (r.t === 'err') { this.busy = false; this.locks.delete('spin'); this.wv.release(); return this.fail(r, $(paid ? 'spinPaid' : 'spinFree')); }
      if (paid) this.wv.spend('gems', WHEEL.spinGems);
      const i = r.res.index, target = 360 - (i * a + a / 2) + (Math.random() - 0.5) * a * 0.6;
      this.wheelRot = this.wheelRot - (this.wheelRot % 360) + 360 * 6 + target;
      const svg = $('wheelSvg'), from = this.wheelRot0 ?? 0, to = this.wheelRot; this.wheelRot0 = to;
      // ticks exactly when a segment edge passes the pointer (same easing curve as the CSS transition)
      const bez = (x1, y1, x2, y2) => (x) => { let lo = 0, hi = 1; for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2, bx = 3 * m * (1 - m) * (1 - m) * x1 + 3 * m * m * (1 - m) * x2 + m * m * m; if (bx < x) lo = m; else hi = m; } const m = (lo + hi) / 2; return 3 * m * (1 - m) * (1 - m) * y1 + 3 * m * m * (1 - m) * y2 + m * m * m; };
      const ease = bez(0.12, 0.72, 0.1, 1), D = 4200; let lastSeg = Math.floor(from / a), lastT = -1e9; const timers = [];
      for (let ms = 0; ms <= D; ms += 8) { const ang = from + (to - from) * ease(ms / D), sg = Math.floor(ang / a); if (sg !== lastSeg) { lastSeg = sg; if (ms - lastT > 45) { lastT = ms; timers.push(setTimeout(() => { this.app.audio.play('wheelTick'); const p = document.querySelector('.wheel-ptr'); if (p) { p.classList.remove('tk'); void p.offsetWidth; p.classList.add('tk'); } }, ms)); } } }
      this.app.audio.play('click');
      requestAnimationFrame(() => { svg.style.transition = `transform ${D / 1000}s cubic-bezier(.12,.72,.1,1)`; svg.style.transform = `rotate(${this.wheelRot}deg)`; });
      // The wheel stops at D; the prize, the win sound and the wallet count-up all come together after a short pause.
      setTimeout(() => { this.busy = false; this.app.audio.play('win'); haptic('reward');
        this.showGot(r.res.got).then(() => { this.locks.delete('spin'); this.wv.release(); this.renderHome(); }); }, D + 700);
    };
    if ($('spinFree')) $('spinFree').onclick = () => spin(false);
    $('spinPaid').onclick = () => spin(true);
  }

  /**
   * A quest or goal was claimed (the server has paid it): the button answers, the reward swells,
   * flies into the wallet and the pill counts up, and the card turns to CLAIMED. When it has all
   * landed the page is redrawn, and the quest drops back into its normal place in the list.
   */
  async claimed(b, got, kind) {
    const card = b.closest('.quest, .goal'), rw = card && card.querySelector('.qrw');
    this.app.audio.play(kind === 'goal' ? 'goalClaim' : 'questClaim'); haptic('reward');
    if (card) { card.classList.remove('just'); card.classList.add('claiming'); }
    if (rw) pop(rw);
    b.textContent = t('claimed'); b.disabled = true;
    await wait(DUR.normal);
    await this.payout(got, rw || b);
    if (got && got.chests && got.chests.length) await this.showGot({ chests: got.chests });
    await wait(DUR.fast);
  }
  /** Quests / goals that finished since the player last looked: highlighted once, with a tag. */
  markJust(body, p) {
    if (!this.just || !this.just.size) return;
    for (const el of body.querySelectorAll(`[data-jid^="${p}:"]`)) {
      if (!this.just.has(el.dataset.jid)) continue;
      this.just.delete(el.dataset.jid);
      if (!el.classList.contains('done') && !el.classList.contains('ready')) continue;
      el.classList.add('just');
      const tag = document.createElement('span'); tag.className = 'done-tag';
      tag.textContent = t(p === 'g' ? 'goalComplete' : 'questComplete'); el.appendChild(tag);
    }
  }

  /* ---------------- quests ---------------- */
  untilMidnight() { const now = new Date(), m = Math.max(0, Math.round((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now) / 60000)); return t('hours', { h: Math.floor(m / 60), m: m % 60 }); }
  renderQuests(body) {
    const W = this.W, Q = W.quests;
    const rw = (r) => `<span class="qrw">${itemHTML(r)}</span>`;
    // anything that can be collected is lifted to the top; everything else keeps its place
    const daily = questOrder(Q.list).map(q => { const done = q.prog >= q.need;
      return `<div class="quest ${q.claimed ? 'claimed' : done ? 'done' : ''}" data-jid="q:${q.id}"><div class="qt"><b>${esc(t('qt_' + q.id, { n: q.need }))}</b><div class="cbar"><i style="width:${Math.min(100, q.prog / q.need * 100)}%"></i><span>${L(Math.min(q.prog, q.need) + ' / ' + q.need)}</span></div></div>${rw(QUESTS[q.id].reward)}
        ${q.claimed ? `<span class="pill new">${esc(t('claimed'))}</span>` : `<button class="btn sm ${done ? 'primary' : ''}" data-q="${q.id}" ${done ? '' : 'disabled'}>${esc(t('claim'))}</button>`}</div>`; }).join('');
    const allDone = Q.list.every(q => q.claimed);
    const tq = questOrder(Object.entries(W.tankQuests), ([, q]) => q).map(([id, q]) => { const done = q.prog >= q.need;
      return `<div class="quest ${q.done ? 'claimed' : done ? 'done' : ''}"><img class="tk-img sm" alt="" src="${this.app.tankImg(id)}"><div class="qt"><b>${esc(tname(id))} <span class="rare r-${TANKS[id].rarity}">${esc(rname(id))}</span></b><span class="muted" style="font-size:13px">${esc(t('tq_' + q.stat, { n: q.need }))}</span><div class="cbar"><i style="width:${Math.min(100, q.prog / q.need * 100)}%"></i><span>${L(Math.min(q.prog, q.need) + ' / ' + q.need)}</span></div></div>
        ${q.done ? `<span class="pill new">${esc(t('claimed'))}</span>` : `<button class="btn sm ${done ? 'primary' : ''}" data-tq="${id}" ${done ? '' : 'disabled'}>${esc(W.tanks[id] ? t('claim') : t('unlockBtn'))}</button>`}</div>`; }).join('');
    body.innerHTML = `<div class="cols">
      <div class="card"><div class="row" style="justify-content:space-between"><p class="lbl" style="margin:0">${esc(t('dailyQuests'))}</p><span class="muted" style="font-size:12.5px">${esc(t('newQuestsIn', { t: '' }))}<span id="qTimer2">${esc(this.untilMidnight())}</span></span></div>
        <div class="qlist">${daily}</div>
        <div class="quest bonus ${Q.bonus ? 'claimed' : allDone ? 'done' : ''}"><div class="qt"><b>${esc(t('questBonus'))}</b></div>${rw(QUEST_BONUS)}${Q.bonus ? `<span class="pill new">${esc(t('claimed'))}</span>` : `<button class="btn sm ${allDone ? 'primary' : ''}" id="qBonus" ${allDone ? '' : 'disabled'}>${esc(t('claim'))}</button>`}</div>
        <p class="sub" style="font-size:12.5px;margin-top:10px">${esc(t('questsNote'))}</p></div>
      <div class="card"><p class="lbl">${esc(t('tankQuests'))}</p><p class="sub" style="font-size:13px;margin-bottom:10px">${esc(t('tankQuestsSub'))}</p><div class="qlist">${tq}</div></div></div>`;
    body.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { this.app.audio.play('click');
      this.run(b, 'quest', () => this.acc.eco('quest', { id: b.dataset.q }), (r) => this.claimed(b, r.res.got, 'quest')); });
    if ($('qBonus')) $('qBonus').onclick = () => { const b = $('qBonus'); this.app.audio.play('click');
      this.run(b, 'quest', () => this.acc.eco('questBonus'), (r) => this.claimed(b, r.res.got, 'quest')); };
    body.querySelectorAll('[data-tq]').forEach(b => b.onclick = () => { this.app.audio.play('click');
      this.run(b, 'quest', () => this.acc.eco('tankQuest', { tank: b.dataset.tq }), (r) => this.showOpened(r.res.opened)); });
    this.markJust(body, 'q');
  }

  /* ---------------- long-term goals (achievements) ---------------- */
  renderGoals(body) {
    const W = this.W, A = W.ach || { list: [], ready: 0, done: 0, total: ACH.length };
    const by = new Map(A.list.map(x => [x.id, x]));
    const fam = [...ACH_FAMILIES.map(f => f.stat), 'mode'];
    const nice = (n) => n >= 1000000 ? (n / 1000000) + 'M' : n >= 1000 ? (n / 1000) + 'K' : String(n);
    let html = '';
    // a goal's state as the quest order understands it
    const stOf = (a) => { const st = by.get(a.id) || { prog: 0, claimed: false }; return { prog: st.prog, need: a.need, claimed: st.claimed }; };
    // families with something to collect come first, and inside each family so do those goals —
    // both stable, so nothing else moves
    const hasReady = (stat) => ACH.some(a => a.stat === stat && questRank(stOf(a)) === 0);
    const famOrder = fam.map((f, i) => ({ f, i, r: hasReady(f) ? 0 : 1 })).sort((a, b) => a.r - b.r || a.i - b.i).map(x => x.f);
    for (const stat of famOrder) {
      const items = questOrder(ACH.filter(a => a.stat === stat), stOf);
      if (!items.length) continue;
      const doneN = items.filter(a => (by.get(a.id) || {}).claimed).length;
      html += `<div class="card gl-fam"><div class="row" style="justify-content:space-between;align-items:baseline">
        <p class="lbl" style="margin:0">${esc(items[0].icon)} ${esc(t('ac_' + stat))}</p>
        <span class="muted" style="font-size:12px">${L(doneN + ' / ' + items.length)}</span></div><div class="gl-list">`;
      for (const a of items) {
        const st = by.get(a.id) || { prog: 0, claimed: false };
        const ready = !st.claimed && st.prog >= a.need;
        const label = a.stat === 'mode' ? t('ac_modeOne', { mode: t('m_' + a.mode), n: a.need })
          : a.stat === 'tier' ? t('ac_tierOne', { tier: t(['bronze', 'silver', 'gold', 'plat', 'dia', 'cmd', 'legend'][a.need]) })
          : t('ac_' + a.stat + 'One', { n: nice(a.need) });
        html += `<div class="goal ${st.claimed ? 'claimed' : ready ? 'ready' : ''}" data-jid="g:${a.id}">
          <div class="gt"><b>${esc(label)}</b>
            <div class="cbar"><i style="width:${Math.min(100, st.prog / a.need * 100)}%"></i><span>${L(nice(Math.min(st.prog, a.need)) + ' / ' + nice(a.need))}</span></div></div>
          <span class="qrw">${itemHTML({ kind: 'coins', n: a.reward.coins })}${a.reward.gems ? itemHTML({ kind: 'gems', n: a.reward.gems }) : ''}</span>
          ${st.claimed ? `<span class="pill new">${esc(t('claimed'))}</span>`
            : `<button class="btn sm ${ready ? 'primary' : ''}" data-ach="${a.id}" ${ready ? '' : 'disabled'}>${esc(t('claim'))}</button>`}</div>`;
      }
      html += '</div></div>';
    }
    body.innerHTML = `<div class="card gl-head"><div><p class="lbl" style="margin:0">${esc(t('goalsTitle'))}</p>
        <p class="sub" style="margin:4px 0 0;font-size:13px">${esc(t('goalsNote'))}</p></div>
        <div class="gl-count"><b>${L(A.done + ' / ' + A.total)}</b><span>${esc(t('goalsDone'))}</span></div></div>
      <div class="gl-cols">${html}</div>`;
    body.querySelectorAll('[data-ach]').forEach(b => b.onclick = () => { this.app.audio.play('click');
      this.run(b, 'ach', () => this.acc.eco('ach', { id: b.dataset.ach }), (r) => this.claimed(b, r.res.got, 'goal')); });
    this.markJust(body, 'g');
  }

  /* ---------------- modal ---------------- */
  modal(html, cls = '') {
    const m = $('ecoModal'), c = $('ecoCard');
    if (this._seqDone) this._seqDone();                  // whatever was showing before is finished now
    c.onclick = null;
    if (m.hidden) this.app.audio.play('whoosh');
    c.className = 'card modal-card eco-card ' + cls; c.innerHTML = `<button type="button" class="mclose" data-close aria-label="Close">×</button>` + html; m.hidden = false;
    c.style.animation = 'none'; void c.offsetWidth; c.style.animation = '';
    c.querySelectorAll('[data-close]').forEach(b => b.onclick = () => { this.app.audio.play('click'); this.closeModal(); });
  }
  closeModal() {
    $('ecoModal').hidden = true; $('ecoCard').onclick = null; this.busy = false;
    if (this._seqDone) this._seqDone();                  // a reward show still running: it ends here
    this.refreshPage(); this.renderHome();
  }
}

/* =====================================================================
   Real-money gems. Inside the Android app (Google Play) this uses Google
   Play Billing through the Digital Goods API; the server then checks the
   purchase with Google before adding gems. In a normal browser, buying
   is only possible when the server runs in TEST mode (PAYMENTS_TEST=1).
   ===================================================================== */
class Payments {
  constructor(ui) {
    this.ui = ui; this.service = null; this.prices = {};
    if ('getDigitalGoodsService' in window) {
      window.getDigitalGoodsService('https://play.google.com/billing').then(async (s) => {
        this.service = s;
        try {
          const d = await s.getDetails(GEM_PRODUCTS.map(p => p.id));
          for (const x of d) this.prices[x.itemId] = new Intl.NumberFormat(getLang() === 'en' ? 'en-US' : getLang() === 'ar' ? 'ar-IQ-u-nu-latn' : 'en-US', { style: 'currency', currency: x.price.currency }).format(Number(x.price.value));
          ui.refreshPage();
        } catch (e) { console.warn('price lookup failed', e); }
      }).catch(() => {});
    }
  }
  available() { return !!this.service; }
  price(p) { return this.prices[p.id] || '$' + p.usd.toFixed(2); }
  async buy(product) {
    const ui = this.ui, W = ui.W;
    if (this.service) {
      try {
        const req = new PaymentRequest([{ supportedMethods: 'https://play.google.com/billing', data: { sku: product } }], { total: { label: 'Total', amount: { currency: 'USD', value: '0' } } });
        const resp = await req.show();
        const r = await ui.acc.eco('purchase', { provider: 'play', product, token: resp.details.purchaseToken });
        await resp.complete(r.t === 'ok' ? 'success' : 'fail');
        if (r.t === 'err') return ui.err(r);
        ui.app.audio.play('purchase'); haptic('buy'); ui.showGot(r.res.got);
      } catch (e) { if (e && e.name !== 'AbortError') ui.app.toast(t('payFail')); }
      return;
    }
    if (W && W.payments.test) {
      ui.run(null, 'gems', () => ui.acc.eco('purchase', { provider: 'test', product }), (r) => { ui.app.audio.play('purchase'); haptic('buy'); return ui.showGot(r.res.got); });
      return;
    }
    ui.app.toast(t('payLater'), 3500);
  }
}
