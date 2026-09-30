# Voice chat HIDDEN for release (FEATURES.VOICE_ENABLED = false), end to end in a real browser:
#   - no mic button in a match, no voice panel, no voice settings, nothing about voice on first run
#   - the touch layout editor has no MIC entry and no mic button to drag
#   - the microphone is never asked for, and the voice system is never even created
#   - the game still plays normally (practice match), and squads / world chat are untouched
# and with the server switched to VOICE_ENABLED=1 the voice UI is all back — proof it was hidden,
# not removed. (browser-test11 and browser-test12 run the whole voice and editor suites that way.)
import asyncio, os, subprocess, time, sys, tempfile
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOCK = os.path.join(ROOT, 'tools', 'mock-three.js')
errs = []; fails = []
def ok(c, m):
    print(('  ok   ' if c else '  FAIL ') + m)
    if not c: fails.append(m)

# counts every attempt to open the microphone, before the page's own code runs
MIC_SPY = """(() => { window.__micAsks = 0;
  const md = navigator.mediaDevices || (navigator.mediaDevices = {});
  md.getUserMedia = () => { window.__micAsks++; return Promise.reject(new Error('spy')); };
  const P = navigator.permissions; if (P && P.query) { const q = P.query.bind(P);
    P.query = (d) => { if (d && d.name === 'microphone') window.__micAsks++; return q(d); }; } })();"""

async def page(br, port, name='Solo'):
    ctx = await br.new_context(viewport={'width': 844, 'height': 390}, has_touch=True, is_mobile=True, service_workers='block')
    await ctx.add_init_script(MIC_SPY)
    p = await ctx.new_page()
    p.on('pageerror', lambda e: errs.append(f'PAGEERROR {e}'))
    await p.route('https://cdn.jsdelivr.net/**', lambda r: r.fulfill(path=MOCK, content_type='text/javascript'))
    await p.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(body='', content_type='text/css'))
    await p.goto(f'http://localhost:{port}/')
    await p.wait_for_function('window.__tf && window.__tf.stage', timeout=20000)
    await p.evaluate("() => { if (__tf.eco) __tf.eco.dailyAuto = true; }")
    await p.evaluate(f"__tf.acc.ensure('{name}')")
    await p.wait_for_function('__tf.acc.online && __tf.acc.wallet && __tf.acc.info', timeout=10000)
    await p.evaluate("() => { for (const id of ['ecoModal', 'dlg']) { const m = document.getElementById(id); if (m) m.hidden = true; } }")
    await p.wait_for_timeout(500)
    return ctx, p

VISIBLE = """(sel) => [...document.querySelectorAll(sel)].filter(e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
  return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; }).length"""

async def open_settings(p):
    await p.click('#btnMore'); await p.wait_for_selector('#mnDrawer:not([hidden])'); await p.wait_for_timeout(150)
    await p.click('#btnSettings'); await p.wait_for_selector('#btnTouchEdit')
    await p.wait_for_timeout(300)

async def run(port, voice_on):
    env = {**os.environ, 'PORT': str(port), 'DATA_DIR': tempfile.mkdtemp(prefix='kt-b26-'), 'REG_LIMIT': '100'}
    if voice_on: env['VOICE_ENABLED'] = '1'
    srv = subprocess.Popen(['node', 'server/index.js'], cwd=ROOT, env=env, stdout=subprocess.PIPE); time.sleep(0.9)
    try:
        async with async_playwright() as pw:
            br = await pw.chromium.launch()
            ctx, p = await page(br, port)
            tag = 'ON ' if voice_on else 'OFF'
            if not voice_on:
                ok(await p.evaluate("__tf.acc.info.features.voice === false"), f'[{tag}] the server says voice is off')
                ok(await p.evaluate("__tf.voice === null"), f'[{tag}] the voice system is never created')
                await open_settings(p)
                n = await p.evaluate(VISIBLE, '#settings .vc-feat, #settings [data-set^="voice"]')
                ok(n == 0, f'[{tag}] no voice settings are shown ({n})')
                # no gap where they were: the row after "Mute all" is the debug row, directly
                gap = await p.evaluate("""() => { const a = document.querySelector('[data-set="mute"]').closest('.st-row'), b = document.querySelector('[data-set="debug"]').closest('.st-row');
                  return Math.round(b.getBoundingClientRect().top - a.getBoundingClientRect().bottom); }""")
                ok(gap < 16, f'[{tag}] and no empty space is left where they were ({gap}px between Mute all and the next row)')
                await p.click('#btnTouchEdit'); await p.wait_for_selector('#tedit:not([hidden])'); await p.wait_for_timeout(300)
                pick = await p.evaluate("[...document.querySelectorAll('#teSel button')].filter(b => getComputedStyle(b).display !== 'none').map(b => b.dataset.v)")
                ok('mic' not in pick and sorted(pick) == ['aim', 'fire', 'move', 'power'], f'[{tag}] the layout editor lists no MIC ({pick})')
                ok(await p.evaluate(VISIBLE, '#vcBtn') == 0, f'[{tag}] and shows no mic button to drag')
                ok(await p.evaluate("!__tf.touch.els.mic"), f'[{tag}] the mic is not part of the touch layout at all')
                await p.click('#teDone'); await p.wait_for_timeout(200)
                await p.goto(f'http://localhost:{port}/?fresh=1'); await p.wait_for_function('window.__tf')
                await p.evaluate("document.getElementById('welcome').hidden = false")
                ok(await p.evaluate(VISIBLE, '#welcome .vc-feat') == 0, f'[{tag}] the first-run screen says nothing about voice chat')
                await ctx.close(); ctx, p = await page(br, port, 'Solo2')

            # a practice match: plays normally, and (when off) no mic, no voice panel, no mic request
            await p.click('#btnPractice'); await p.wait_for_selector('#scr-lobby:not([hidden])')
            await p.wait_for_function("__tf.room && __tf.room.players.length >= 4", timeout=15000)
            await p.click('#btnStart'); await p.wait_for_selector('#hud:not([hidden])', timeout=15000)
            await p.wait_for_timeout(1500)
            mic = await p.evaluate(VISIBLE, '#vcBtn')
            if voice_on and mic != 1 and os.environ.get('DBG'):
                print('    DBG', await p.evaluate("({ hidden: document.getElementById('vcBtn').hidden, touch: __tf.hud.touch, playing: __tf.hud.playing, voice: !!__tf.voice, novoice: document.body.classList.contains('no-voice'), disp: getComputedStyle(document.getElementById('vcBtn')).display })"))
            if voice_on:
                ok(mic == 1, f'[{tag}] switched on: the mic button is back in the match')
                ok(await p.evaluate("!!__tf.voice"), f'[{tag}] switched on: the voice system exists again')
                ok(await p.evaluate("!document.body.classList.contains('no-voice')"), f'[{tag}] switched on: nothing of voice is hidden')
            else:
                ok(mic == 0, f'[{tag}] no mic button in the match')
                ok(await p.evaluate(VISIBLE, '#vcPanel') == 0, f'[{tag}] no voice panel in the match')
                # the match really plays: the tank drives and fires
                x0 = await p.evaluate("__tf.net.me.x + ',' + __tf.net.me.z")
                await p.evaluate("""() => { const T = __tf.touch; T.moveMag = 1; T.moveDir = 0.5; T.active = true; }""")
                await p.keyboard.down('KeyW'); await p.wait_for_timeout(900); await p.keyboard.up('KeyW')
                x1 = await p.evaluate("__tf.net.me.x + ',' + __tf.net.me.z")
                ok(x0 != x1, f'[{tag}] the game still plays: the tank drives ({x0} → {x1})')
                ok(await p.evaluate("__micAsks") == 0, f'[{tag}] the microphone was never asked for')
            await ctx.close()

            if not voice_on:
                # squads and world chat are untouched
                ca, A = await page(br, port, 'Aa'); cb, B = await page(br, port, 'Bb')
                r = await B.evaluate("__tf.acc.req({t:'worldSay', text:'anyone for a game?'})")
                ok(r.get('t') == 'ok', f'[{tag}] world chat still works')
                bid = await B.evaluate("__tf.acc.id"); aid = await A.evaluate("__tf.acc.id")
                r1 = await A.evaluate(f"__tf.acc.req({{t:'partyInvite', to:{bid}}})"); await B.wait_for_timeout(300)
                r2 = await B.evaluate(f"__tf.acc.req({{t:'partyAccept', leader:{aid}}})"); await A.wait_for_timeout(800)
                ok(r1.get('t') == 'ok' and r2.get('t') == 'ok' and await A.evaluate("__tf.acc.party && __tf.acc.party.members.length === 2"),
                   f'[{tag}] squads still work')
                ok(await A.evaluate("__micAsks") == 0 and await B.evaluate("__micAsks") == 0, f'[{tag}] still no microphone request anywhere')
                await ca.close(); await cb.close()
            await br.close()
    finally:
        srv.terminate()

async def main():
    await run(8826, False)
    await run(8827, True)
    for e in errs: print('  ' + e)
    bad = fails + errs
    print(('FAILED: %d' % len(bad)) if bad else 'browser-test26: all good')
    sys.exit(1 if bad else 0)

asyncio.run(main())
