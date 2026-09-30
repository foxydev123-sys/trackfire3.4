# The menu camera must stay on the tanks through every squad and map change.
#
# The bug: after a squad change or a map change the menu camera sometimes ended up far back, with the
# tanks tiny, and stayed there. Root cause (fixed in lobbystage.js): the bottom row of tiles reaches
# past the middle of the screen, the framing code took it for a panel down the left whose edge was
# off the far side, pulled the camera back and sideways — and the pull-back had nothing to bring it
# back, so one bad frame was permanent.
#
# Every rendered frame of every step below is recorded and checked:
#   pull-back and sideways slide are finite and inside the menu range; the camera is never further
#   from the line-up than a menu shot can be (so it never shows the whole map); every tank on the
#   stage stays a usable size on screen; and a squad change is a short eased move, not a jump.
#
#   python3 tools/browser-test25.py            full (20 cycles)
#   python3 tools/browser-test25.py --quick    5 cycles
import asyncio, os, subprocess, time, sys, tempfile, json
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8825; MOCK = os.path.join(ROOT, 'tools', 'mock-three.js')
QUICK = '--quick' in sys.argv
CYCLES = 5 if QUICK else 20
DATA = tempfile.mkdtemp(prefix='kt-b25-')
errs = []; fails = []
def ok(c, m):
    print(('  ok   ' if c else '  FAIL ') + m)
    if not c: fails.append(m)

# Recorded every frame: [fit, pan, camera→stage distance, smallest tank width as a share of the
# screen, number of tanks, screen, cam.dist]
REC = """() => { window.__cam = []; const f = () => {
  const s = __tf.stage, c = __tf.menuCam, scr = document.querySelector('.screen:not([hidden])');
  if (s && c && s.L && (scr && (scr.id === 'scr-menu' || scr.id === 'scr-page'))) {
    const st = s.L.stage, d = Math.hypot(c.position.x - st.x, c.position.z - st.z);
    const bx = (s.valid && s.lastBoxes) || [];
    const w = bx.length ? Math.min(...bx.map(b => b.hi - b.lo)) / innerWidth : -1;
    __cam.push([s.fit, s.pan, d, w, s.views.size, scr.id, s.cam.dist, !!s.move]);
  }
  requestAnimationFrame(f); }; requestAnimationFrame(f); }"""
LIMITS = "() => { const s = __tf.stage; return { shot: s.L.shot.dist }; }"

async def page(br, W, H, name, lang='en'):
    ctx = await br.new_context(viewport={'width': W, 'height': H}, has_touch=True, is_mobile=True, service_workers='block')
    p = await ctx.new_page()
    p.on('pageerror', lambda e: errs.append(f'[{name}] PAGEERROR {e}'))
    await p.route('https://cdn.jsdelivr.net/**', lambda r: r.fulfill(path=MOCK, content_type='text/javascript'))
    await p.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(body='', content_type='text/css'))
    await p.goto(f'http://localhost:{PORT}/')
    await p.wait_for_function('window.__tf && window.__tf.stage', timeout=20000)
    await p.evaluate("() => { if (__tf.eco) __tf.eco.dailyAuto = true; }")
    await p.evaluate(f"__tf.setLang('{lang}')")
    await p.evaluate(f"__tf.acc.ensure('{name}')")
    await p.wait_for_function('__tf.acc.online && __tf.acc.wallet', timeout=10000)
    await p.evaluate("() => { for (const id of ['ecoModal', 'dlg']) { const m = document.getElementById(id); if (m) m.hidden = true; } }")
    await p.wait_for_timeout(900)
    await p.evaluate(REC)
    return ctx, p

async def check(p, tag, cut_ok=False):
    """Everything recorded since the last check, against the rules. `cut_ok`: this step changed the
    map, where one cut to the new map's shot is expected."""
    rows = await p.evaluate("__cam.splice(0)")
    lim = await p.evaluate(LIMITS)
    FMIN, FMAX, PMAX = 0.85, 1.75, 16
    far = 1.12 * FMAX * 30          # the furthest any menu shot can sit (largest shot distance ≈ 24–30 m)
    bad = [r for r in rows if not all(isinstance(v, (int, float)) and v == v and abs(v) != float('inf') for v in r[:4])]
    ok(not bad, f'{tag}: camera numbers are always finite ({len(rows)} frames)')
    if not rows: return rows
    fits = [r[0] for r in rows]; pans = [r[1] for r in rows]; ds = [r[2] for r in rows]
    ok(min(fits) >= FMIN - 1e-6 and max(fits) <= FMAX + 1e-6, f'{tag}: pull-back stays in the menu range ({min(fits):.2f}–{max(fits):.2f})')
    ok(max(abs(x) for x in pans) <= PMAX + 1e-6, f'{tag}: sideways slide stays small ({max(abs(x) for x in pans):.1f} m)')
    ok(max(ds) < far, f'{tag}: the camera never backs off to show the map ({max(ds):.1f} m from the stage, limit {far:.0f})')
    ws = [r[3] for r in rows if r[3] >= 0 and r[4] > 0]
    if ws: ok(min(ws) > 0.045, f'{tag}: every tank stays a usable size on screen (smallest {min(ws)*100:.1f}% of the width)')
    # squad changes glide: no single frame moves the shot a lot (a map change is one cut, allowed)
    jumps = [abs(rows[i][0] - rows[i-1][0]) for i in range(1, len(rows)) if rows[i][5] == rows[i-1][5]]
    big = sorted(jumps)[-2:] if cut_ok else sorted(jumps)[-1:]
    lim_j = 0.12
    ok(all(j <= lim_j for j in (big[:-1] if cut_ok else big)) , f'{tag}: no jump in the framing between frames (largest {max(jumps) if jumps else 0:.3f})')
    if os.environ.get('DBG') and jumps and max(jumps) > lim_j:
        i = max(range(1, len(rows)), key=lambda i: abs(rows[i][0] - rows[i-1][0]))
        for r in rows[max(0, i-4):i+4]: print('     ', [round(x, 3) if isinstance(x, float) else x for x in r])
    # and at the end of the step, the shot is back near the composed one — not stuck out
    # at rest the camera is no further back than the closest clear shot for this line-up
    t = await p.evaluate("(() => { const s = __tf.stage; return s.views.size ? s.tightest(__tf.menuCam).fit : 1; })()")
    now = await p.evaluate("__tf.stage.fit")
    ok(now <= t + 0.03, f'{tag}: at rest the camera is only as far back as it needs to be ({now:.2f}, closest clear shot {t:.2f})')
    return rows

async def req(p, js): return await p.evaluate(f"__tf.acc.req({js})")

async def join(A, B):
    """B joins A's squad the way the game does it: A invites (B just posted in world chat), B accepts."""
    await B.evaluate("__tf.acc.req({t:'worldSay', text:'squad? ' + Math.random().toString(36).slice(2, 7)})")
    bid = await B.evaluate("__tf.acc.id"); aid = await A.evaluate("__tf.acc.id")
    r = await req(A, f"{{t:'partyInvite', to:{bid}}}")
    await B.wait_for_timeout(250)
    r2 = await req(B, f"{{t:'partyAccept', leader:{aid}}}")
    return r.get('t') == 'ok' and r2.get('t') == 'ok'

FULL = """(n) => { const ids = ['q2','q3','q4'], tk = ['zagros','korek','newroz'];
  __tf.acc.party = { leader: __tf.acc.id, map: null, members: [{ id: __tf.acc.id, name: 'Me', tank: { id: 'safeen', level: 1 } }]
    .concat(ids.slice(0, n - 1).map((id, i) => ({ id, name: 'Mate' + i, tank: { id: tk[i], level: 1 } }))) };
  __tf.acc.emit('party', __tf.acc.party); }"""

async def main():
    srv = subprocess.Popen(['node', 'server/index.js'], cwd=ROOT,
        env={**os.environ, 'PORT': str(PORT), 'DATA_DIR': DATA, 'REG_LIMIT': '200'}, stdout=subprocess.PIPE)
    time.sleep(0.9)
    try:
        async with async_playwright() as pw:
            br = await pw.chromium.launch()
            # 915×423 is the phone the bug was reported on: wide enough that YOUR TANK shows in the
            # bottom row, which is what makes that row reach past the middle
            ca, A = await page(br, 915, 423, 'Aa')
            cb, B = await page(br, 915, 423, 'Bb')
            await A.wait_for_timeout(600); await check(A, 'solo')

            print('\n--- 1. the exact bug: a squad on Desert')
            ok(await join(A, B), 'B joins A')
            await A.wait_for_timeout(1200); await check(A, 'player joins')
            await A.evaluate("__tf.setMenuMap('desert')"); await A.wait_for_timeout(1600)
            rows = await check(A, 'Desert with a squad of two', cut_ok=True)
            ok(rows and rows[-1][0] < 1.25, f'Desert squad shot is close in, not far back ({rows[-1][0]:.2f}, was 1.6 and stuck)')

            print(f'\n--- 2. join / map change / leave × {CYCLES}')
            maps = ['hawler', 'desert', 'forest', 'stadium']
            for i in range(CYCLES):
                await B.wait_for_timeout(2600)                          # world chat's spam gap
                if not (await A.evaluate("!!(__tf.acc.party && __tf.acc.party.members && __tf.acc.party.members.length > 1)")):
                    ok(await join(A, B), f'[{i}] B joins again')
                await A.evaluate(f"__tf.setMenuMap('{maps[i % 4]}')")     # rapid join + map change
                await A.wait_for_timeout(250)
                await A.evaluate(f"__tf.setMenuMap('{maps[(i + 1) % 4]}')")
                await A.wait_for_timeout(900)
                await check(A, f'[{i}] join + map changes', cut_ok=True)
                await req(B, "{t:'partyLeave'}")                         # rapid leave + map change
                await A.evaluate(f"__tf.setMenuMap('{maps[(i + 2) % 4]}')")
                await A.wait_for_timeout(1100)
                await check(A, f'[{i}] leave + map change', cut_ok=True)
                await check(B, f'[{i}] B after leaving', cut_ok=True)
                if QUICK and i >= 1: break

            print('\n--- 3. joining ANOTHER player\'s squad (A joins B)')
            await A.wait_for_timeout(2600)
            ok(await join(B, A), 'A joins B')
            await A.wait_for_timeout(1400); await check(A, 'joined someone else\'s squad')
            await B.evaluate("__tf.setMenuMap('forest')"); await B.wait_for_timeout(800)
            await B.evaluate("__tf.setMenuMap('desert')"); await B.wait_for_timeout(1200)
            await check(B, 'leader changes map repeatedly', cut_ok=True)
            await check(A, 'member while the leader changes map', cut_ok=True)
            await req(A, "{t:'partyLeave'}"); await A.wait_for_timeout(1200)
            await check(A, 'party member leaves')

            print('\n--- 4. map changes on your own, and with a full squad')
            for mp in maps:
                await A.evaluate(f"__tf.setMenuMap('{mp}')"); await A.wait_for_timeout(900)
                await check(A, f'{mp}, one player', cut_ok=True)
            await A.evaluate(FULL, 4); await A.wait_for_timeout(1200)
            await check(A, 'full squad arrives')
            for mp in maps + maps:
                await A.evaluate(f"__tf.setMenuMap('{mp}')"); await A.wait_for_timeout(700)
                await check(A, f'{mp}, full squad', cut_ok=True)
            for n in (3, 2, 4, 1, 4):
                await A.evaluate(FULL, n); await A.wait_for_timeout(700)
                await check(A, f'squad of {n}')

            print('\n--- 5. away from the menu and back, language, resize')
            await A.evaluate(FULL, 3); await A.wait_for_timeout(800)
            for pg in ('#btnShop', '#btnQuests', '#navFriends'):
                await A.click(pg); await A.wait_for_timeout(500)
                await A.click('#btnBack'); await A.wait_for_selector('#scr-menu:not([hidden])'); await A.wait_for_timeout(700)
                await check(A, f'back from {pg}')
            for lang in ('ku', 'ar', 'en'):
                await A.evaluate(f"__tf.setLang('{lang}')"); await A.wait_for_timeout(900)
                await check(A, f'language {lang} with a squad')
            for (w, h) in ((844, 390), (740, 360), (1366, 768), (667, 375), (915, 423)):
                await A.set_viewport_size({'width': w, 'height': h}); await A.wait_for_timeout(900)
                await check(A, f'resize to {w}x{h} with a squad', cut_ok=True)

            print('\n--- 6. a bad frame of layout cannot leave the camera out there')
            await A.evaluate("() => { const s = __tf.stage; s.fit = s.wantFit = 1.7; }")
            await A.wait_for_timeout(1600)
            rows = await A.evaluate("__cam.splice(0)")
            ok(rows[-1][0] < 1.2, f'pushed out to 1.7, the camera comes back in by itself ({rows[-1][0]:.2f})')
            await A.evaluate("() => { const s = __tf.stage; s.fit = NaN; s.pan = Infinity; }")
            await A.wait_for_timeout(300)
            rows = await A.evaluate("__cam.splice(0)")
            ok(all(r[0] == r[0] and abs(r[1]) < 10 for r in rows[1:]), 'an invalid shot is replaced by the last good one on the next frame')
            await ca.close(); await cb.close()
            await br.close()
    finally:
        srv.terminate()
    for e in errs: print('  ' + e)
    bad = fails + errs
    print(('FAILED: %d' % len(bad)) if bad else 'browser-test25: all good')
    sys.exit(1 if bad else 0)

asyncio.run(main())
