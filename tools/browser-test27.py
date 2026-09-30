# Rewards that FEEL like rewards — and can never pay twice.
#
#   A. counters: the wallet pills count, and always end on the server's number — also when the
#      screen changes halfway through, and after a reconnect during an animation
#   B. quests: finishing one shows a notice and a highlight, it moves to the top; claiming it
#      swells the reward, flies the exact amount into the wallet, and happens exactly once
#   C. goals: a stronger notice; claiming pays exactly once
#   D. chests: anticipation (shake, pause, harder shake), open, reveal ONE BY ONE in order, the
#      shown amounts are the server's, rapid taps hurry but never change or repeat the reward,
#      closing early cannot collect twice
#   E. purchases: the price leaves the wallet once, the item comes once, rapid taps buy once;
#      "not enough" shakes the pill, says so, and never even asks the server
#   F. garage upgrade: coins and parts leave the wallet, the new pip pops in, one upgrade per tap
#   G. visual QA: the chest window fits small phones; coins fly to the RIGHT pill in English,
#      Arabic and Kurdish; no overflow; buttons still work after the transitions
#   H. sounds exist for every reward moment (checked by name — hearing them is up to a person)
#
#   python3 tools/browser-test27.py
import asyncio, os, subprocess, time, sys, tempfile, json, sqlite3
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8827; MOCK = os.path.join(ROOT, 'tools', 'mock-three.js')
DATA = tempfile.mkdtemp(prefix='kt-b27-')
errs = []; fails = []
def ok(c, m):
    print(('  ok   ' if c else '  FAIL ') + m)
    if not c: fails.append(m)

def edit_eco(acc_id, fn):
    """Change a player's saved economy the way a finished match would (the server re-reads it)."""
    con = sqlite3.connect(os.path.join(DATA, 'kurdish-tank.db'), timeout=10)
    row = con.execute('SELECT eco FROM accounts WHERE id=?', (acc_id,)).fetchone()
    eco = json.loads(row[0] or '{}'); fn(eco)
    con.execute('UPDATE accounts SET eco=? WHERE id=?', (json.dumps(eco), acc_id)); con.commit(); con.close()

# counts every economy request by op, and records every token flight (kind, amount, target pill)
SPY = """() => { const A = __tf.acc, E = __tf.eco; window.__ops = {}; window.__flights = []; window.__marks = [];
  const req = A.req.bind(A);
  A.req = (m) => { if (m && m.t === 'eco') __ops[m.op] = (__ops[m.op] || 0) + 1; return req(m); };
  const fly = E.wv.fly.bind(E.wv);
  E.wv.fly = (kind, from, n) => { const pill = document.getElementById({ coins: 'wbCoins', gems: 'wbGems', parts: 'wbParts' }[kind]);
    __flights.push({ kind, n, pill: pill && pill.id }); return fly(kind, from, n); };
  // when each reveal happens, in order
  new MutationObserver((ms) => { for (const m of ms) { const el = m.target;
    if (m.attributeName === 'class' && el.classList && el.classList.contains('rv') && el.classList.contains('in') && !el.__seen) {
      el.__seen = 1; __marks.push({ t: performance.now(), k: el.dataset.k || (el.classList.contains('oc') ? 'card' : el.tagName) }); }
    if (m.attributeName === 'class' && el.id === 'chestOpen') __marks.push({ t: performance.now(), k: 'chest:' + [...el.classList].filter(c => c !== 'chest-open' && !c.startsWith('r-')).join('+') });
    if (m.attributeName === 'class' && el.classList && el.classList.contains('wb') && (el.classList.contains('spend') || el.classList.contains('poor') || el.classList.contains('bump'))) __marks.push({ t: performance.now(), k: el.id + ':' + [...el.classList].filter(c => c !== 'wb').join('+') });
  } }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] }); }"""
SHOWN = "() => ({ coins: +document.getElementById('wbCoinsN').dataset.v, gems: +document.getElementById('wbGemsN').dataset.v, parts: +document.getElementById('wbPartsN').dataset.v })"
REAL = "() => { const W = __tf.acc.wallet; return { coins: W.coins, gems: W.gems, parts: W.parts || 0 }; }"

async def page(br, W, H, name, lang='en'):
    ctx = await br.new_context(viewport={'width': W, 'height': H}, has_touch=True, is_mobile=True, service_workers='block')
    p = await ctx.new_page()
    p.on('pageerror', lambda e: errs.append(f'[{name}] PAGEERROR {e}'))
    await p.route('https://cdn.jsdelivr.net/**', lambda r: r.fulfill(path=MOCK, content_type='text/javascript'))
    await p.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(body='', content_type='text/css'))
    await p.goto(f'http://localhost:{PORT}/')
    await p.wait_for_function('window.__tf && window.__tf.stage', timeout=20000)
    await p.evaluate("() => { __tf.eco.dailyAuto = true; }")
    await p.evaluate(f"__tf.setLang('{lang}')")
    await p.evaluate(f"__tf.acc.ensure('{name}')")
    await p.wait_for_function('__tf.acc.online && __tf.acc.wallet', timeout=10000)
    await p.evaluate("() => { for (const id of ['ecoModal', 'dlg']) { const m = document.getElementById(id); if (m) m.hidden = true; } }")
    await p.wait_for_timeout(700)
    await p.evaluate(SPY)
    return ctx, p

async def settled(p, ms=4000):
    """Wait until the pills stop counting and match the server."""
    try:
        await p.wait_for_function(f"(() => {{ const s = ({SHOWN})(), r = ({REAL})(); return s.coins === r.coins && s.gems === r.gems && s.parts === r.parts; }})()", timeout=ms)
        return True
    except Exception:
        return False

async def go(p, sel):
    await p.click(sel); await p.wait_for_selector('#scr-page:not([hidden])'); await p.wait_for_timeout(450)

async def main():
    srv = subprocess.Popen(['node', 'server/index.js'], cwd=ROOT,
        env={**os.environ, 'PORT': str(PORT), 'DATA_DIR': DATA, 'REG_LIMIT': '200'}, stdout=subprocess.PIPE)
    time.sleep(0.9)
    try:
        async with async_playwright() as pw:
            br = await pw.chromium.launch()
            ctx, p = await page(br, 915, 423, 'Rewards')
            aid = await p.evaluate("__tf.acc.id")

            print('\n--- A. counters')
            before = await p.evaluate(REAL)
            await p.evaluate("__tf.acc.eco('cheat')")             # the development gem button: +100k coins, +10k gems, +5k parts
            await p.wait_for_timeout(120)
            mid = await p.evaluate(SHOWN)
            ok(mid['coins'] < before['coins'] + 100000, f'the coin pill counts up rather than jumping ({mid["coins"]} on its way to {before["coins"] + 100000})')
            await go(p, '#btnShop')                                # switch screens in the middle of it
            await p.click('#btnBack'); await p.wait_for_selector('#scr-menu:not([hidden])')
            ok(await settled(p), 'switching screens mid-count: every pill still ends exactly on the server\'s number')

            print('\n--- B. quests')
            edit_eco(aid, lambda e: e['quests']['list'][1].update(prog=e['quests']['list'][1]['need']))
            q1 = await p.evaluate("__tf.acc.wallet.quests.list[1].id")
            await p.evaluate("__tf.acc.eco('select', { tank: __tf.acc.wallet.sel })")       # any action brings the new wallet
            await p.wait_for_selector('.m-notice.quest', timeout=3000)
            ok(True, 'a finished quest announces itself: QUEST COMPLETE notice')
            ok(await p.evaluate("__tf.dotOf('quests') >= 1"), 'and the Quests button gets its red dot')
            await p.wait_for_timeout(2900)                          # let the notice go
            await go(p, '#btnQuests')
            first = await p.evaluate("document.querySelector('.qlist .quest').dataset.jid")
            ok(first == 'q:' + q1, f'the finished quest is now at the top of the list ({first})')
            ok(await p.evaluate("!!document.querySelector('.quest.just .done-tag')"), 'and is highlighted once, with a QUEST COMPLETE tag')
            reward = await p.evaluate(f"(async () => (await import('/shared/economy.js')).QUESTS['{q1}'].reward)()")
            real0 = await p.evaluate(REAL)
            await p.evaluate(f"(() => {{ const b = document.querySelector('[data-q=\"{q1}\"]'); b.click(); b.click(); b.click(); }})()")   # a triple tap
            await p.wait_for_timeout(2600)
            ops = await p.evaluate("__ops")
            ok(ops.get('quest') == 1, f'three quick taps on CLAIM send ONE claim ({ops.get("quest")})')
            real1 = await p.evaluate(REAL)
            ok(real1[reward['kind']] - real0[reward['kind']] == reward['n'], f'the reward was paid once: +{real1[reward["kind"]] - real0[reward["kind"]]} {reward["kind"]} (quest pays {reward["n"]})')
            fl = await p.evaluate("__flights")
            ok(any(f['kind'] == reward['kind'] and f['n'] == reward['n'] and f['pill'] == {'coins': 'wbCoins', 'gems': 'wbGems', 'parts': 'wbParts'}[reward['kind']] for f in fl),
               f'the coins fly into the {reward["kind"]} pill with exactly the reward amount ({fl})')
            ok(await settled(p), 'and the pill ends exactly on the server\'s number')
            ok(await p.evaluate(f"document.querySelector('[data-jid=\"q:{q1}\"]').classList.contains('claimed')"), 'the card shows CLAIMED')
            order = await p.evaluate("[...document.querySelectorAll('.qlist .quest')].map(q => q.dataset.jid)")
            ok(order[-1] == 'q:' + q1 or order.index('q:' + q1) > 0, f'and it goes back among the others ({order})')
            # the server refuses a second claim by itself too
            again = await p.evaluate(f"__tf.acc.eco('quest', {{ id: '{q1}' }})")
            ok(again.get('t') == 'err', 'claiming the same quest again is refused by the server')
            await p.click('#btnBack'); await p.wait_for_selector('#scr-menu:not([hidden])')

            print('\n--- C. goals')
            edit_eco(aid, lambda e: e.setdefault('prog', {}).update(matches=10))
            await p.evaluate("__tf.acc.eco('select', { tank: __tf.acc.wallet.sel })")
            await p.wait_for_selector('.m-notice.goal', timeout=3000)
            ok(True, 'a finished goal gets the stronger ACHIEVEMENT COMPLETED notice')
            await p.wait_for_timeout(2900)
            await go(p, '#btnGoals')
            ok(await p.evaluate("!!document.querySelector('.goal.just .done-tag')"), 'on the Goals page it is highlighted and tagged')
            real0 = await p.evaluate(REAL); await p.evaluate("__flights.length = 0")
            await p.evaluate("(() => { const b = document.querySelector('[data-ach=\"matches_10\"]'); b.click(); b.click(); })()")
            await p.wait_for_timeout(2400)
            real1 = await p.evaluate(REAL); ops = await p.evaluate("__ops")
            ok(ops.get('ach') == 1 and real1['coins'] - real0['coins'] == 250, f'the goal pays 250 coins exactly once ({ops.get("ach")} request, +{real1["coins"] - real0["coins"]})')
            ok(any(f['kind'] == 'coins' and f['n'] == 250 for f in await p.evaluate("__flights")), 'and the 250 coins fly into the coin pill')
            ok(await settled(p), 'the pill ends on the server\'s number')
            await p.click('#btnBack'); await p.wait_for_selector('#scr-menu:not([hidden])')

            print('\n--- D. chests')
            await go(p, '#btnShop')
            await p.evaluate("__marks.length = 0; __flights.length = 0; window.__opened = null; const e = __tf.acc.eco.bind(__tf.acc); __tf.acc.eco = async (op, a) => { const r = await e(op, a); if (r && r.res && r.res.opened) __opened = r.res.opened; return r; }")
            real0 = await p.evaluate(REAL); price = await p.evaluate("(async () => (await import('/shared/economy.js')).CHESTS.common.price.coins)()")
            # three quick taps on BUY → one chest
            await p.evaluate("(() => { const b = document.querySelector('[data-buy=common][data-cur=coins]'); b.click(); b.click(); b.click(); })()")
            await p.wait_for_selector('#chestOpen', timeout=4000)
            await p.wait_for_timeout(5200)
            ops = await p.evaluate("__ops"); o = await p.evaluate("__opened")
            ok(ops.get('buyChest') == 1, f'three quick taps on BUY buy ONE chest ({ops.get("buyChest")})')
            marks = [m['k'] for m in await p.evaluate("__marks")]
            seq = [m for m in marks if m.startswith('chest:')]
            ok(any('shake1' in m for m in seq) and any('shake2' in m for m in seq) and any('open' in m for m in seq)
               and min(i for i, m in enumerate(seq) if 'shake1' in m) < min(i for i, m in enumerate(seq) if 'shake2' in m) < min(i for i, m in enumerate(seq) if 'open' in m),
               f'anticipation, in order: a shake, a pause, a harder shake, then it opens ({seq})')
            reveals = [m for m in marks if not m.startswith('chest:') and not m.startswith('wb') and m != 'H4']
            want = [k for k in ('coins', 'parts', 'gems') if o.get(k)]
            ok(reveals[:len(want)] == want and reveals.count('card') == len(o['cards']), f'rewards appear one at a time: {want} then {len(o["cards"])} card(s) ({reveals})')
            ts = [m['t'] for m in await p.evaluate("__marks") if not m['k'].startswith('chest:') and not m['k'].startswith('wb') and m['k'] != 'H4']
            ok(all(b - a > 100 for a, b in zip(ts, ts[1:])), 'each one after the other, not all at once')
            shown = await p.evaluate("Object.fromEntries([...document.querySelectorAll('.opened .got[data-k]')].map(g => [g.dataset.k, +g.querySelector('b').textContent.replace(/[^0-9]/g, '')]))")
            ok(all(shown.get(k) == o[k] for k in want), f'the amounts shown are exactly what the server gave ({shown} vs {dict((k, o[k]) for k in want)})')
            real1 = await p.evaluate(REAL)
            ok(real1['coins'] == real0['coins'] - price + (o.get('coins') or 0), f'coins changed once: −{price} for the chest, +{o.get("coins")} from it')
            ok(await p.evaluate("!!document.querySelector('.opened.done #chestCollect')"), 'then COLLECT appears')
            await p.click('#chestCollect'); await p.wait_for_timeout(1800)
            ok(await p.evaluate("document.getElementById('ecoModal').hidden"), 'COLLECT flies the coins home and closes the window')
            ok(await settled(p), 'the pills end exactly on the server\'s numbers')
            # a second chest, hurried with taps, then closed before collecting
            await p.evaluate("__marks.length = 0")
            await p.click('[data-buy=common][data-cur=coins]'); await p.wait_for_selector('#chestOpen')
            t0 = time.time()
            for _ in range(8):
                await p.mouse.click(await p.evaluate("innerWidth / 2"), await p.evaluate("innerHeight / 2")); await p.wait_for_timeout(60)
            await p.wait_for_selector('.opened.done', timeout=4000)
            took = time.time() - t0
            o2 = await p.evaluate("__opened")
            shown = await p.evaluate("Object.fromEntries([...document.querySelectorAll('.opened .got[data-k]')].map(g => [g.dataset.k, +g.querySelector('b').textContent.replace(/[^0-9]/g, '')]))")
            ok(took < 3.5, f'tapping hurries the show along ({took:.1f} s)')
            ok(all(shown.get(k) == o2[k] for k in ('coins', 'parts', 'gems') if o2.get(k)), 'and does not change the reward')
            ok((await p.evaluate("__ops")).get('buyChest') == 2 and (await p.evaluate("__ops")).get('open') is None, 'and asks the server for nothing more')
            real_before_close = await p.evaluate(REAL)
            await p.click('#ecoCard .mclose'); await p.wait_for_timeout(600)
            ok(await settled(p), 'closing before COLLECT: the pills still end on the server\'s numbers')
            ok(await p.evaluate(REAL) == real_before_close, 'and nothing was collected twice (the wallet did not change)')

            print('\n--- E. purchases')
            real0 = await p.evaluate(REAL); await p.evaluate("__marks.length = 0; __flights.length = 0")
            pack = await p.evaluate("(async () => (await import('/shared/economy.js')).COIN_PACKS[0])()")
            await p.evaluate(f"(() => {{ const b = document.querySelector('[data-coins=\"{pack['id']}\"]'); b.click(); b.click(); b.click(); }})()")
            await p.wait_for_timeout(2400)
            real1 = await p.evaluate(REAL); ops = await p.evaluate("__ops"); marks = [m['k'] for m in await p.evaluate("__marks")]
            ok(ops.get('coins') == 1, f'three quick taps buy the coin pack ONCE ({ops.get("coins")})')
            ok(real0['gems'] - real1['gems'] == pack['gems'] and real1['coins'] - real0['coins'] == pack['coins'], f'gems taken once (−{real0["gems"] - real1["gems"]}), coins given once (+{real1["coins"] - real0["coins"]})')
            ok(any(m.startswith('wbGems:') and 'spend' in m for m in marks), 'the gem pill dips as the price leaves it')
            ok(any(f['kind'] == 'coins' and f['n'] == pack['coins'] for f in await p.evaluate("__flights")), 'and the coins fly into the coin pill')
            ok(await settled(p), 'the pills end on the server\'s numbers')
            await p.click('#btnBack'); await p.wait_for_selector('#scr-menu:not([hidden])')
            # a poor player: not enough gems for a rare chest
            ctx2, q = await page(br, 915, 423, 'Poor')
            await go(q, '#btnShop')
            gems = await q.evaluate("__tf.acc.wallet.gems"); rare = await q.evaluate("(async () => (await import('/shared/economy.js')).CHESTS.rare.price.gems)()")
            ok(gems < rare, f'(a new player has {gems} gems, a rare chest costs {rare})')
            await q.evaluate("__marks.length = 0")
            await q.click('[data-buy=rare][data-cur=gems]'); await q.wait_for_timeout(500)
            marks = [m['k'] for m in await q.evaluate("__marks")]
            ok(any(m.startswith('wbGems:') and 'poor' in m for m in marks), 'not enough gems: the gem pill shakes')
            ok((await q.evaluate("__ops")).get('buyChest') is None, 'and the server is not even asked')
            ok(await q.evaluate("document.getElementById('ecoModal').hidden && !document.getElementById('cfY')?.offsetParent"), 'no purchase window, no confirmation, no success animation')
            toast = await q.evaluate("(document.getElementById('toast') || {}).textContent || ''")
            ok('gem' in toast.lower(), f'it says so: "{toast}"')
            await ctx2.close()

            print('\n--- F. garage upgrade')
            await go(p, '#btnGarage')
            await p.click(f".tk-card[data-t='{await p.evaluate('__tf.acc.wallet.sel')}']"); await p.wait_for_timeout(300)
            real0 = await p.evaluate(REAL); await p.evaluate("__marks.length = 0")
            b = await p.query_selector('#tkDetail [data-up].primary')
            cost = await b.evaluate("b => ({ coins: +b.dataset.c, parts: +b.dataset.p })")
            await b.evaluate("b => { b.click(); b.click(); }")
            await p.wait_for_selector('#tkDetail .pips i.fresh', timeout=4000)
            ok(True, 'the new pip pops into place on the panel')
            await p.wait_for_timeout(1400)
            real1 = await p.evaluate(REAL); ops = await p.evaluate("__ops"); marks = [m['k'] for m in await p.evaluate("__marks")]
            ok(ops.get('upgrade') == 1, f'one upgrade per double tap ({ops.get("upgrade")})')
            ok(real0['coins'] - real1['coins'] == cost['coins'] and real0['parts'] - real1['parts'] == cost['parts'], f'coins and parts paid once (−{real0["coins"] - real1["coins"]} / −{real0["parts"] - real1["parts"]})')
            ok(any(m.startswith('wbCoins:') and 'spend' in m for m in marks) and any(m.startswith('wbParts:') and 'spend' in m for m in marks), 'both pills dip as the price leaves them')
            ok(await settled(p), 'and end on the server\'s numbers')
            await p.click('#btnBack'); await p.wait_for_selector('#scr-menu:not([hidden])')

            print('\n--- A2. a reconnect in the middle of a chest')
            await go(p, '#btnShop')
            await p.click('[data-buy=common][data-cur=coins]'); await p.wait_for_selector('#chestOpen')
            await p.evaluate("__tf.acc.ws && __tf.acc.ws.close()")
            await p.wait_for_function("__tf.acc.online", timeout=8000)
            await p.wait_for_selector('.opened.done', timeout=8000)
            await p.click('#chestCollect'); await p.wait_for_timeout(1500)
            ok(await settled(p), 'a reconnect during the show: the pills still end on the server\'s numbers')
            await ctx.close()

            print('\n--- G. visual QA: sizes and languages')
            for (w, h) in ((667, 375), (844, 390), (1366, 768)):
                for lang in ('en', 'ar', 'ku'):
                    c3, r = await page(br, w, h, f'Qa{w}{lang}', lang)
                    await r.evaluate("__tf.acc.eco('cheat')"); await r.wait_for_timeout(300)
                    await go(r, '#btnShop')
                    await r.click('[data-buy=common][data-cur=coins]'); await r.wait_for_selector('#chestOpen')
                    for _ in range(6): await r.mouse.click(w / 2, h / 2); await r.wait_for_timeout(60)
                    await r.wait_for_selector('.opened.done', timeout=5000)
                    fit = await r.evaluate("""() => { const c = document.getElementById('ecoCard').getBoundingClientRect(), b = document.getElementById('chestCollect').getBoundingClientRect();
                      const m = document.getElementById('ecoModal'); return { inside: c.left >= -1 && c.right <= innerWidth + 1, collect: b.bottom <= innerHeight + 1 || m.scrollHeight > m.clientHeight }; }""")
                    tag = f'{w}x{h} {lang}'
                    ok(fit['inside'] and fit['collect'], f'the chest window fits and COLLECT can be reached — {tag}')
                    await r.evaluate("__flights.length = 0")
                    await r.click('#chestCollect'); await r.wait_for_timeout(1500)
                    fl = await r.evaluate("__flights")
                    ok(fl and all(f['pill'] == {'coins': 'wbCoins', 'gems': 'wbGems', 'parts': 'wbParts'}[f['kind']] for f in fl), f'every currency flies to its own pill — {tag}')
                    ov = await r.evaluate("document.scrollingElement.scrollWidth <= innerWidth + 1 && document.scrollingElement.scrollHeight <= innerHeight + 1")
                    ok(ov, f'no overflow after the animations — {tag}')
                    await r.click('#btnBack'); await r.wait_for_selector('#scr-menu:not([hidden])'); await r.wait_for_timeout(400)
                    hit = await r.evaluate("(() => { const b = document.getElementById('btnShop').getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!e && !!e.closest('#btnShop'); })()")
                    ok(hit, f'buttons are clickable again after the transitions — {tag}')
                    await c3.close()

            print('\n--- H. every reward moment has a sound')
            c4, r = await page(br, 915, 423, 'Sounds')
            names = ['poor', 'purchase', 'upgrade', 'questDone', 'questClaim', 'goalDone', 'goalClaim', 'reveal', 'revealBetter', 'revealTop', 'chestShake', 'chestShake2', 'chestCharge', 'chestOpen', 'coin', 'gem', 'click']
            res = await r.evaluate("""(names) => { const a = __tf.game.audio; a.unlock && a.unlock(); const bad = [];
              for (const n of names) { try { a.play(n); } catch (e) { bad.push(n + ': ' + e.message); } } return bad; }""", names)
            ok(not res, f'all {len(names)} reward sounds play without error {res}')
            await c4.close()
            await br.close()
    finally:
        srv.terminate()
    for e in errs: print('  ' + e)
    bad = fails + errs
    print(('FAILED: %d' % len(bad)) if bad else 'browser-test27: all good')
    sys.exit(1 if bad else 0)

asyncio.run(main())
