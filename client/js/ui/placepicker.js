/* The region → town picker, used on first run and when changing your city from the profile.
   Pick a region, then a town in it — never one long flat list. A region with a single town
   (Halabja) picks it straight away. */
import { REGIONS, regionOf, townName, regionName } from '../../shared/regions.js';
import { t, getLang } from '../i18n.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Draw the picker into `el`. `value` is the current town id ('' for none); `onPick(id)` is called
 * whenever a town is chosen. Returns { value(), redraw() }.
 */
export function placePicker(el, value, onPick) {
  let region = regionOf(value), town = region ? value : '';
  const draw = () => {
    const L = getLang(), R = REGIONS.find((r) => r.id === region);
    el.classList.add('pp');
    el.innerHTML =
      `<div class="pp-regions" role="group">${REGIONS.map((r) =>
        `<button type="button" class="pp-r" data-r="${r.id}" aria-pressed="${r.id === region}">${esc(regionName(r.id, L))}</button>`).join('')}</div>` +
      (R ? `<div class="pp-towns" role="group">${R.towns.map(([id]) =>
        `<button type="button" class="pp-t" data-t="${id}" aria-pressed="${id === town}">${esc(townName(id, L))}</button>`).join('')}</div>`
         : `<p class="pp-hint">${esc(t('pickRegion'))}</p>`);
    for (const b of el.querySelectorAll('[data-r]')) b.onclick = () => {
      region = b.dataset.r;
      const r = REGIONS.find((x) => x.id === region);
      if (r.towns.length === 1) { town = r.towns[0][0]; onPick && onPick(town); }
      else if (regionOf(town) !== region) town = '';
      draw();
    };
    for (const b of el.querySelectorAll('[data-t]')) b.onclick = () => { town = b.dataset.t; onPick && onPick(town); draw(); };
  };
  draw();
  return { value: () => town, redraw: draw };
}
