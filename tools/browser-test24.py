# THIS BATCH, END TO END:
#   A. touching, dragging, swiping and scrolling the UI never moves the menu camera
#   B. a touch owned by the UI never drives the in-match controls (multi-touch included)
#   C. red dots: set by real state, cleared when handled, rolled up into the corner menu
#   D. world chat from the menu: send, show as text, tap a name to invite / befriend
#   E. landscape only: upright shows "rotate", sideways shows the game, turning keeps the layout
#   F. the menu layout at every landscape size in all three languages: nothing overlaps, nothing is
#      cut off, everything inside the safe area, and the middle is left to the tanks
#   G. kill confirmation only for the killer; debris settles and stops
import asyncio, os, subprocess, time, sys, tempfile, json
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8826; MOCK = os.path.join(ROOT, 'tools', 'mock-three.js')
DATA = tempfile.mkdtemp(prefix='kt-b24-')
QUICK = '--quick' in sys.argv

errs, fails = [], []
def ok(c, m):
    print(('  ok   ' if c else '  FAIL ') + m)
    if not c: fails.append(m)

async def page(br, W, H, mobile=True, lang='en', name='Solomon'):
    ctx = await br.new_context(viewport={'width': W, 'height': H}, has_touch=mobile, is_mobile=mobile, service_workers='block')
    p = await ctx.new_page()
    p.on('pageerror', lambda e: errs.append(f'PAGEERROR {e}'))
    await p.route('https://cdn.jsdelivr.net/**', lambda r: r.fulfill(path=MOCK, content_type='text/javascript'))
    await p.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(body='', content_type='text/css'))
    await p.goto(f'http://localhost:{PORT}/')
    await p.wait_for_function('window.__tf && window.__tf.stage', timeout=20000)
    await p.evaluate("() => { if (__tf.eco) __tf.eco.dailyAuto = true; }")      # no daily-reward pop-up over the test
    await p.evaluate(f"__tf.setLang('{lang}')")
    if name:
        await p.evaluate(f"__tf.acc.ensure('{name}')")
        await p.wait_for_function('__tf.acc.online && __tf.acc.wallet', timeout=10000)
    await p.evaluate("() => { for (const id of ['ecoModal', 'dlg']) { const m = document.getElementById(id); if (m) m.hidden = true; } }")
    await p.wait_for_timeout(1400)
    return ctx, p

SHOT = """() => { const s = __tf.stage; return { pan: s.pan, fit: s.fit, sig: s._sig, epoch: __tf.layoutEpoch }; }"""
def same(a, b): return abs(a['pan'] - b['pan']) < 1e-3 and abs(a['fit'] - b['fit']) < 1e-3

async def swipe(p, sel, dx, dy):
    # a REAL touch scroll gesture, the way a thumb does it — not a synthetic scroll event
    box = await p.locator(sel).first.bounding_box()
    if not box: return
    cdp = await p.context.new_cdp_session(p)
    await cdp.send('Input.synthesizeScrollGesture', {'x': int(box['x'] + box['width'] / 2), 'y': int(box['y'] + box['height'] / 2),
        'xDistance': dx, 'yDistance': dy, 'gestureSourceType': 'touch', 'speed': 1200, 'repeatCount': 1})
    await p.wait_for_timeout(250)

async def main():
    srv = subprocess.Popen(['node', 'server/index.js'], cwd=ROOT,
        env={**os.environ, 'PORT': str(PORT), 'DATA_DIR': DATA, 'REG_LIMIT': '200'}, stdout=subprocess.PIPE)
    time.sleep(0.9)
    try:
        async with async_playwright() as pw:
            br = await pw.chromium.launch()

            # ================= A. the UI never moves the menu camera =================
            print('--- A. UI touches do not move the menu camera')
            for lang in ('en', 'ku'):
                ctx, p = await page(br, 844, 390, lang=lang)
                await p.evaluate("""() => { __tf.acc.party = { leader: __tf.acc.id, map: null, members: [
                  { id: __tf.acc.id, name: 'Solomon', tank: { id: 'zagros', level: 4 } },
                  { id: 'p2', name: 'Hemin', tank: { id: 'safeen', level: 3 } }] }; __tf.acc.emit('party', __tf.acc.party); }""")
                await p.wait_for_timeout(1600)
                base = await p.evaluate(SHOT)
                rects0 = await p.evaluate("""() => ['#homeSide', '#mnRail', '.mn-play', '#mnTop'].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return [s, Math.round(r.left), Math.round(r.top)]; })""")
                for sel in ['#homeSide', '#mnRail', '.mn-play', '#mnTop', '#scr-menu']:
                    for dx, dy in [(-260, 0), (260, 0), (0, -200), (0, 200)]:
                        await swipe(p, sel, dx, dy)
                after = await p.evaluate(SHOT)
                rects1 = await p.evaluate("""() => ['#homeSide', '#mnRail', '.mn-play', '#mnTop'].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return [s, Math.round(r.left), Math.round(r.top)]; })""")
                scrolled = await p.evaluate("""() => [...document.querySelectorAll('#scr-menu, #scr-menu *')].filter(e => e.scrollLeft || e.scrollTop).map(e => e.id || e.className).slice(0, 4)""")
                ok(rects0 == rects1, f'swiping the panels does not slide them — {lang}' + ('' if rects0 == rects1 else f' {rects0} -> {rects1}'))
                ok(not scrolled, f'nothing on the menu scrolls under a thumb — {lang} {scrolled}')
                ok(same(base, after), f"and the camera has not moved — {lang} (pan {base['pan']:.3f}->{after['pan']:.3f}, fit {base['fit']:.3f}->{after['fit']:.3f})")
                # taps on buttons, the drawer, the profile chip
                await p.click('#btnMore'); await p.wait_for_timeout(300)
                await swipe(p, '#mnDrawer', 0, -200)
                await p.click('#btnMoreClose'); await p.wait_for_timeout(300)
                ok(same(base, await p.evaluate(SHOT)), f'opening and scrolling the corner menu does not move it — {lang}')
                # pages over the menu: open, scroll, come back
                for btn in ['#btnQuests', '#navFriends', '#btnShop', '#btnGoals']:
                    await p.click(btn); await p.wait_for_selector('#scr-page:not([hidden])')
                    await swipe(p, '#scr-page', 0, -300)
                    await p.click('#btnBack'); await p.wait_for_selector('#scr-menu:not([hidden])'); await p.wait_for_timeout(400)
                end = await p.evaluate(SHOT)
                ok(same(base, end), f"opening Quests, Friends, Shop and Goals and scrolling them leaves the camera where it was — {lang} (pan {base['pan']:.3f}->{end['pan']:.3f})")
                await ctx.close()

            # ================= B. pointer ownership =================
            print('\n--- B. a touch that starts on the UI belongs to the UI')
            ctx, p = await page(br, 844, 390)
            own = await p.evaluate("""async () => {
              const ev = (type, el, id, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, bubbles: true, cancelable: true, clientX: x, clientY: y }));
              const m = await import('/js/input/ptrown.js');
              const b = document.getElementById('btnShop').getBoundingClientRect();
              ev('pointerdown', document.getElementById('btnShop'), 21, b.left + 5, b.top + 5);
              ev('pointerdown', document.getElementById('view'), 22, 400, 200);
              const r = { a: m.ownerOf(21), b: m.ownerOf(22) };
              ev('pointerup', window, 21, 0, 0); ev('pointerup', window, 22, 0, 0);
              r.after = m.ownerOf(21); return r; }""")
            ok(own['a'] == 'ui' and own['b'] == 'world', f"each finger is owned by what it landed on (UI: {own['a']}, 3D view: {own['b']})")
            ok(own['after'] is None, 'and lifting it ends the claim')
            # in a match: a thumb that began on a UI button and slides onto the stick area does not steer
            await p.click('#btnPractice'); await p.wait_for_selector('#scr-lobby:not([hidden])')
            await p.wait_for_function("__tf.room && __tf.room.players.length >= 4", timeout=15000)
            await p.click('#btnStart'); await p.wait_for_selector('#hud:not([hidden])', timeout=15000)
            await p.wait_for_timeout(1200)
            leak = await p.evaluate("""() => {
              const ev = (type, el, id, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: x, clientY: y }));
              const T = __tf.touch, mv = document.getElementById('moveBase').getBoundingClientRect();
              const ui = document.getElementById('btnScores') || document.querySelector('.m-btn');
              const u = ui.getBoundingClientRect();
              ev('pointerdown', ui, 31, u.left + 3, u.top + 3);                    // starts on the UI
              for (let i = 0; i < 6; i++) ev('pointermove', window, 31, mv.left + mv.width / 2 + i * 12, mv.top + mv.height / 2);
              const fromUi = T.moveMag;
              ev('pointerup', window, 31, 0, 0);
              // a second finger that starts on the controls does steer — the guard is not a blanket block
              ev('pointerdown', document.getElementById('touch'), 32, mv.left + mv.width / 2, mv.top + mv.height / 2);
              for (let i = 1; i <= 6; i++) ev('pointermove', window, 32, mv.left + mv.width / 2 + i * 14, mv.top + mv.height / 2);
              const fromStick = T.moveMag; ev('pointerup', window, 32, 0, 0);
              return { fromUi, fromStick }; }""")
            ok(leak['fromUi'] == 0, f"a thumb that starts on a button does not steer the tank when it slides over the stick ({leak['fromUi']})")
            ok(leak['fromStick'] > 0.3, f"while a thumb that starts on the controls still does ({leak['fromStick']:.2f})")

            # ================= G. kill confirmation (same match) =================
            print('\n--- G. kill confirmation')
            ids = await p.evaluate("() => ({ me: __tf.net.myId, bot: __tf.room.players.find(q => q.bot).id, bot2: __tf.room.players.filter(q => q.bot)[1].id })")
            await p.evaluate(f"__tf.game.onScheduled({{ t: 'kill', k: {ids['me']}, v: {ids['bot']} }})")
            await p.wait_for_timeout(150)
            kc = await p.evaluate("() => ({ on: !document.getElementById('killOk').hidden, name: document.getElementById('killOkName').textContent, lbl: document.getElementById('killOkLbl').textContent })")
            botName = await p.evaluate(f"__tf.room.players.find(q => q.id === {ids['bot']}).name")
            ok(kc['on'] and kc['name'] == botName, f"the killer sees YOU DESTROYED {kc['name']}")
            await p.wait_for_timeout(2100)
            ok(await p.evaluate("document.getElementById('killOk').hidden"), 'and it goes away again by itself')
            await p.evaluate(f"__tf.game.onScheduled({{ t: 'kill', k: {ids['bot2']}, v: {ids['bot']} }})")
            await p.wait_for_timeout(150)
            ok(await p.evaluate("document.getElementById('killOk').hidden"), 'somebody else\'s kill gives you no confirmation')
            # a quick double, well after the first one
            await p.evaluate("() => { __tf.hud.kLast = 0; }")
            await p.evaluate(f"__tf.game.onScheduled({{ t: 'kill', k: {ids['me']}, v: {ids['bot']} }})")
            await p.evaluate(f"__tf.game.onScheduled({{ t: 'kill', k: {ids['me']}, v: {ids['bot2']} }})")
            await p.wait_for_timeout(120)
            ok(await p.evaluate("document.getElementById('killOkN').textContent === '×2' && !document.getElementById('killOkN').hidden"), 'two kills in quick succession count up (×2)')
            if os.environ.get('KT_SHOTS'): await p.screenshot(path=os.path.join(os.environ['KT_SHOTS'], 't24-kill.png'))

            # debris settles and stops (same match)
            print('\n--- G2. debris settles and stops')
            await p.evaluate("""() => { const D = __tf.game.W.debris; D.clear();
              // somewhere no tank is near, so nothing drives through the pieces and wakes them up again
              const me = __tf.net.me, snap = __tf.net.snaps.at(-1), tanks = snap ? [...snap.tanks.values()] : [];
              let spot = null;
              for (let r = 10; r < 60 && !spot; r += 5) for (let a = 0; a < 6.28 && !spot; a += 0.5) {
                const x = me.x + Math.cos(a) * r, z = me.z + Math.sin(a) * r;
                if (tanks.every(q => Math.hypot(q.x - x, q.z - z) > 12)) spot = { x, z };
              }
              spot = spot || { x: me.x + 8, z: me.z + 8 };
              D.burst('rock', spot.x, 1, spot.z); }""")
            n0 = await p.evaluate("__tf.game.W.debris.activeCount()")
            ok(2 <= n0 <= 4, f'a crushed rock throws only a few chunks ({n0})')
            await p.wait_for_timeout(4000)
            st = await p.evaluate("() => { const D = __tf.game.W.debris, on = D.items.filter(i => i.on); return { active: D.activeCount(), on: on.length, frozen: on.filter(i => i.rest && i.m.matrixAutoUpdate === false).length }; }")
            ok(st['active'] == 0, f"after they land nothing is still being simulated ({st['active']} moving)")
            ok(st['frozen'] == st['on'], f"and every settled piece is frozen ({st['frozen']}/{st['on']})")
            await ctx.close()

            # ================= C. red dots =================
            print('\n--- C. notification dots')
            ctx, p = await page(br, 844, 390)
            dots = await p.evaluate("""async () => {
              const W = __tf.acc.wallet, E = __tf.eco, S = __tf.social, out = {};
              W.daily.canClaim = false; W.wheel.free = false;
              for (const q of W.quests.list) { q.prog = 0; q.claimed = false; }
              E.renderHome(); out.q0 = __tf.dotOf('quests');
              W.quests.list[0].prog = W.quests.list[0].need; E.renderHome();
              out.q1 = __tf.dotOf('quests'); out.q1vis = !document.getElementById('bgQuests').hidden;
              out.more1 = !document.getElementById('moreDot').hidden;                 // Quests is on the main screen, not in the drawer
              W.quests.list[0].claimed = true; E.renderHome(); out.q2 = __tf.dotOf('quests');
              // a friend request
              __tf.acc.incoming = [{ id: 999, name: 'Hemin', tag: '1234' }]; S.renderHome();
              out.f1 = __tf.dotOf('friends'); out.f1vis = !document.getElementById('frBadge').hidden;
              __tf.acc.incoming = []; S.renderHome(); out.f2 = __tf.dotOf('friends');
              // something inside the drawer: the corner menu lights up, and only then
              W.daily.canClaim = true; E.renderHome(); out.m1 = !document.getElementById('moreDot').hidden;
              W.daily.canClaim = false; E.renderHome(); out.m2 = !document.getElementById('moreDot').hidden;
              W.wheel.free = true; E.renderHome(); out.m3 = !document.getElementById('moreDot').hidden;
              // opening the menu screen is NOT handling it
              __tf.social.go('quests'); await new Promise(r => setTimeout(r, 300)); __tf.social.back(); await new Promise(r => setTimeout(r, 300));
              out.m4 = !document.getElementById('moreDot').hidden;
              return out; }""")
            ok(dots['q0'] == 0, 'no finished quest: no dot on Goals/Quests')
            ok(dots['q1'] >= 1 and dots['q1vis'], f"a finished quest puts a dot on Quests ({dots['q1']})")
            ok(not dots['more1'], 'which is on the main screen, so the corner menu stays clear')
            ok(dots['q2'] == 0, 'claiming it clears the dot')
            ok(dots['f1'] >= 1 and dots['f1vis'], 'a friend request puts a dot on Friends')
            ok(dots['f2'] == 0, 'answering it clears it')
            ok(dots['m1'] and not dots['m2'], 'a reward hidden in the corner menu lights the corner menu, and clears with it')
            ok(dots['m3'], 'so does a free spin')
            ok(dots['m4'], 'and merely opening screens does not clear it — only dealing with it does')

            # ================= D. world chat =================
            print('\n--- D. world chat from the menu')
            ctx2, q = await page(br, 844, 390, name='Hemin')
            await q.click('#btnChat'); await q.wait_for_selector('#wcList')
            await q.fill('#wcInput', 'anyone for ranked? <img src=x onerror="window.__xss=1">')
            await q.click('#wcForm button'); await q.wait_for_timeout(500)
            ok(await q.evaluate("[...document.querySelectorAll('#wcList .wm-t')].some(e => e.textContent.includes('anyone for ranked?'))"), 'a message sent from the lobby appears in the chat')
            ok(await q.evaluate("!document.querySelector('#wcList img') && !window.__xss"), 'markup in a message is shown as text, never run')
            ok(await q.evaluate("document.getElementById('wcInput').maxLength === 120"), 'the box stops at 120 characters')
            # Solomon sees it, taps Hemin's name, invites him — no friendship needed, he was asking
            await p.click('#btnChat'); await p.wait_for_selector('#wcList')
            await p.wait_for_function("[...document.querySelectorAll('#wcList .wm-who')].some(b => b.textContent.includes('Hemin'))", timeout=5000)
            await p.evaluate("[...document.querySelectorAll('#wcList .wm-who')].find(b => b.textContent.includes('Hemin')).click()")
            await p.wait_for_selector('#dlg:not([hidden])')
            acts = await p.evaluate("[...document.querySelectorAll('#dlgCard [data-w]')].map(b => b.dataset.w)")
            ok(all(a in acts for a in ['profile', 'friend', 'invite', 'mute', 'report']), f'tapping a name offers profile, add friend, invite, mute and report ({acts})')
            await p.click('#dlgCard [data-w=invite]')
            got = await q.wait_for_function("__tf.acc && [...document.querySelectorAll('#notifs .ntf')].length > 0", timeout=5000)
            ok(bool(got), 'the invitation reaches the other player')
            # add friend from the same menu
            await p.evaluate("[...document.querySelectorAll('#wcList .wm-who')].find(b => b.textContent.includes('Hemin')).click()")
            await p.wait_for_selector('#dlg:not([hidden])'); await p.click('#dlgCard [data-w=friend]')
            await q.wait_for_timeout(700)
            ok(await q.evaluate("__tf.acc.incoming.some(f => f.name === 'Solomon')"), 'and a friend request from the chat arrives too')
            # a chat dot while you are elsewhere
            await p.click('#btnBack'); await p.wait_for_selector('#scr-menu:not([hidden])')
            await q.wait_for_timeout(2700)                                  # the spam gap between two messages
            await q.fill('#wcInput', 'still looking for a squad'); await q.click('#wcForm button'); await q.wait_for_timeout(700)
            diag = await p.evaluate("({ dot: __tf.dotOf('chat'), n: __tf.acc.world.length, seen: __tf.acc.worldSeen, unread: __tf.acc.worldUnread(), page: __tf.social.page, last: (__tf.acc.world.at(-1) || {}).text })")
            ok(diag['dot'] is True, f'a new message while you are in the menu puts a dot on Chat {diag}')
            await p.click('#btnChat'); await p.wait_for_timeout(400)
            ok(await p.evaluate("__tf.dotOf('chat') === 0"), 'reading it clears the dot')
            await ctx2.close(); await ctx.close()

            # ================= E. landscape only =================
            print('\n--- E. landscape only')
            ctx, p = await page(br, 390, 844, name=None)
            ok(await p.is_visible('#rotate'), 'a phone held upright gets the "rotate your device" card')
            txt = await p.evaluate("document.querySelector('#rotate p').textContent")
            ok('Rotate' in txt, f'which says so ({txt})')
            await p.set_viewport_size({'width': 844, 'height': 390}); await p.wait_for_timeout(500)
            ok(not await p.is_visible('#rotate') and await p.is_visible('#btnQuick'), 'turned sideways, the game is there')
            before = await p.evaluate("() => { const r = document.querySelector('.mn-play').getBoundingClientRect(); return [Math.round(r.right), Math.round(r.bottom)]; }")
            await p.set_viewport_size({'width': 390, 'height': 844}); await p.wait_for_timeout(300)
            await p.set_viewport_size({'width': 844, 'height': 390}); await p.wait_for_timeout(500)
            after = await p.evaluate("() => { const r = document.querySelector('.mn-play').getBoundingClientRect(); return [Math.round(r.right), Math.round(r.bottom)]; }")
            ok(before == after, f'turning it back and forth leaves the layout exactly as it was ({before} / {after})')
            await ctx.close()
            ctx, p = await page(br, 1000, 1300, mobile=False, name=None)
            ok(not await p.is_visible('#rotate'), 'a tall desktop window is not asked to rotate')
            await ctx.close()

            # ================= F. the layout, everywhere =================
            print('\n--- F. the menu layout at every landscape size, in all three languages')
            SIZES = [(667, 375), (740, 360), (812, 375), (844, 390), (932, 430), (1024, 768), (1180, 820), (1366, 768), (1920, 1080), (2560, 1080)]
            if QUICK: SIZES = [(740, 360), (1366, 768)]
            for (W, H) in SIZES:
                for lang in ('en', 'ar', 'ku'):
                    ctx, p = await page(br, W, H, mobile=H < 500, lang=lang)
                    await p.evaluate("""() => { __tf.acc.party = { leader: __tf.acc.id, map: null, members: [
                      { id: __tf.acc.id, name: 'Solomon', tank: { id: 'zagros', level: 4 } },
                      { id: 'p2', name: 'Hemin', tank: { id: 'safeen', level: 3 } }, { id: 'p3', name: 'Dilan', tank: { id: 'korek', level: 2 } }] };
                      __tf.acc.emit('party', __tf.acc.party); }""")
                    await p.wait_for_timeout(900)
                    L = await p.evaluate("""() => {
                      const vis = (e) => { if (!e || e.hidden) return false; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
                      const box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
                      const groups = {
                        top: [...document.querySelectorAll('#mnTop > *')].filter(vis).map(box),
                        wallet: [...document.querySelectorAll('#walletBar .wb')].filter(vis).map(box),
                        season: [document.getElementById('seasonLine')].filter(vis).map(box),
                        rail: [...document.querySelectorAll('#mnRail .ebtn, #mnRail .tank-card')].filter(vis).map(box),
                        play: [...document.querySelectorAll('.mn-play > .btn, .mn-play > .join, .mn-play > .mn-logo')].filter(vis).map(box),
                        squad: [...document.querySelectorAll('#homeSide > *')].filter(vis).map(box),
                      };
                      const clip = [...document.querySelectorAll('#mnRail .ebtn > span, .mn-play > .btn > span, #mnTop .nm, #walletBar b')].filter(vis)
                        .filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent.trim()).slice(0, 4);
                      // the room-code box must hold the widest possible 5-character code
                      const ci = document.getElementById('codeInp'), cs = getComputedStyle(ci), sp = document.createElement('span');
                      sp.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${cs.font};letter-spacing:${cs.letterSpacing}`;
                      sp.textContent = 'WWM8W'; document.body.append(sp); const need = sp.getBoundingClientRect().width; sp.remove();
                      const code = { need: Math.round(need), have: Math.round(ci.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) };
                      return { groups, clip, code, W: innerWidth, H: innerHeight };
                    }""")
                    tag = f'{W}x{H} {lang}'
                    names = list(L['groups'].keys())
                    clash = []
                    for i in range(len(names)):
                        for j in range(i + 1, len(names)):
                            for a in L['groups'][names[i]]:
                                for b in L['groups'][names[j]]:
                                    if min(a['r'], b['r']) - max(a['l'], b['l']) > 1 and min(a['b'], b['b']) - max(a['t'], b['t']) > 1:
                                        clash.append(f"{names[i]}/{names[j]}")
                    ok(not clash, f'nothing overlaps — {tag}' + (f' -> {sorted(set(clash))}' if clash else ''))
                    out = [n for n in names for a in L['groups'][n] if a['l'] < 4 or a['t'] < 4 or a['r'] > L['W'] - 4 or a['b'] > L['H'] - 4]
                    ok(not out, f'everything sits inside the screen edges — {tag}' + (f' -> {sorted(set(out))}' if out else ''))
                    ok(not L['clip'], f'no label is cut off — {tag}' + (f' -> {L["clip"]}' if L['clip'] else ''))
                    ok(L['code']['have'] >= L['code']['need'], f"a whole room code fits in the box — {tag} ({L['code']})")
                    # the middle of the screen belongs to the tanks: no panel may sit in it
                    cx0, cx1, cy0, cy1 = L['W'] * 0.33, L['W'] * 0.67, L['H'] * 0.22, L['H'] * 0.74
                    mid = [n for n in names if n != 'season' for a in L['groups'][n] if min(a['r'], cx1) - max(a['l'], cx0) > 2 and min(a['b'], cy1) - max(a['t'], cy0) > 2]
                    ok(not mid, f'the middle is left clear for the tanks — {tag}' + (f' -> {sorted(set(mid))}' if mid else ''))
                    await ctx.close()
            await br.close()
    finally:
        srv.terminate()
    for e in errs: print('  ' + e)
    bad = fails + errs
    print(('FAILED: %d' % len(bad)) if bad else 'browser-test24: all good')
    sys.exit(1 if bad else 0)

asyncio.run(main())
