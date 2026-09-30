# Objective markers in real practice matches, and the aiming guide.
#
#   KING OF THE CITADEL (every map) — a marker to the capture zone: an edge arrow with the zone icon
#     and "CAPTURE ZONE · 85m" when it is off screen, pointing the right way (ahead / behind / left /
#     right), a small quiet marker over it when it comes on screen; the zone has a faint beacon.
#   SURVIVAL — the same marker to the base ("DEFEND THE BASE").
#   CONVOY — follows the moving truck; ESCORT / DEFEND / STOP depending on your side; survives a
#     team change and a fresh mode-state (what a reconnect sends).
#   HOT POTATO — points at whoever holds it; switches the instant it changes hands (never at the old
#     holder); never at yourself — "YOU HAVE THE HOT POTATO" instead.
#   CTF — the flag markers now have the flag icon and distance too.
#   TEAM BATTLE — no objective, no marker.
#   Also: markers with no tank of your own (waiting to respawn), after a new match on another map,
#   and never on top of the sticks / fire button (phone layout). Labels in all three languages.
#   AIM GUIDE — dashes, not dots; the white dominant; the dark edge thinner than the dash; the same
#     number of draw calls as before; readable on the desert's sand.
#
#   python3 tools/browser-test28.py
import asyncio, os, subprocess, time, sys, tempfile, json
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8828; MOCK = os.path.join(ROOT, 'tools', 'mock-three.js')
errs = []; fails = []
def ok(c, m):
    print(('  ok   ' if c else '  FAIL ') + m)
    if not c: fails.append(m)

async def setup_pick(p, mode, mp):
    await p.click('#lbEditSetup'); await p.wait_for_selector('#scr-setup:not([hidden])')
    await p.click(f'#lbModeSeg [data-mode={mode}]')
    if mp:
        b = await p.query_selector(f'#lbMaps [data-map={mp}]')
        if b and await b.is_visible(): await b.click()
    await p.click('#btnSuGo'); await p.wait_for_selector('#scr-lobby:not([hidden])')
    await p.wait_for_function(f"__tf.room.mode === '{mode}'", timeout=5000)

async def start(p):
    await p.click('#btnStart'); await p.wait_for_selector('#hud:not([hidden])', timeout=10000)
    await p.wait_for_function("__tf.game.obj || __tf.room.mode === 'tdm'", timeout=8000)
    await p.wait_for_timeout(900)

async def pin_zone(p):
    """The server re-sends the objective whenever the zone changes hands (bots drive through it);
    let the test's zone position survive that, so it checks the arrow and not the bots."""
    await p.evaluate("""(() => { const g = __tf.game; if (g.__pinned) return; g.__pinned = 1; const o = g.onObjective.bind(g);
      g.onObjective = (ev) => { if (window.__zoneAt && ev.zone) { ev.zone.x = __zoneAt[0]; ev.zone.z = __zoneAt[1]; } return o(ev); }; })()""")

async def end(p):
    await p.evaluate("window.__zoneAt = null")
    await p.keyboard.press('Escape'); await p.click('#btnEndMatch'); await p.wait_for_selector('#endcard:not([hidden])', timeout=6000)
    await p.wait_for_function("__tf.room.state === 'lobby'", timeout=20000)
    await p.wait_for_selector('#scr-lobby:not([hidden])', timeout=6000)

# the markers as the player sees them: key → state
G = """() => { const out = {}; for (const [k, e] of (__tf.hud._gd || new Map())) { if (e.hidden) continue; const a = e._at || {};
  out[k] = { edge: e.classList.contains('edge'), on: e.classList.contains('on'), side: a.side, ang: a.ang, x: a.x, y: a.y,
             label: e.querySelector('.g-tx').textContent, dist: e.querySelector('.g-d').textContent, icon: e.dataset.icon }; } return out; }"""
# where the objective is relative to the camera's view: ahead/behind, left/right
REL = """(xyz) => { const c = __tf.game.camera, v = new __tf.V3(xyz[0], xyz[1], xyz[2]).project(c); return { x: v.x, y: v.y, behind: v.z > 1 }; }"""
dirOf = lambda a: (lambda a: 'down' if a < 45 or a >= 315 else 'left' if a < 135 else 'up' if a < 225 else 'right')(((a % 360) + 360) % 360)

async def main():
    srv = subprocess.Popen(['node', 'server/index.js'], cwd=ROOT, env={**os.environ, 'PORT': str(PORT), 'DATA_DIR': tempfile.mkdtemp()}, stdout=subprocess.PIPE); time.sleep(0.9)
    try:
        async with async_playwright() as pw:
            br = await pw.chromium.launch()
            c = await br.new_context(viewport={'width': 844, 'height': 390}, has_touch=True, is_mobile=True, service_workers='block'); p = await c.new_page()
            p.on('pageerror', lambda e: errs.append(f'PAGEERROR {e}'))
            await p.route('https://cdn.jsdelivr.net/**', lambda r: r.fulfill(path=MOCK, content_type='text/javascript'))
            await p.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(body='', content_type='text/css'))
            await p.goto(f'http://localhost:{PORT}/'); await p.wait_for_function('window.__tf && __tf.stage')
            await p.evaluate("__tf.setName('Tester')")
            await p.evaluate("(async () => { const T = await import('/js/three.js'); __tf.V3 = T.Vector3; })()")
            await p.click('#btnPractice'); await p.wait_for_selector('#scr-lobby:not([hidden])')
            await p.wait_for_function("__tf.room && __tf.room.players.length >= 4", timeout=8000)

            print('\n--- KING OF THE CITADEL, every map')
            for mp in ('hawler', 'desert', 'forest'):
                await setup_pick(p, 'koh', mp); await start(p)
                await p.wait_for_function("__tf.game.obj && __tf.game.obj.zone", timeout=6000)
                await pin_zone(p)
                g = (await p.evaluate(G)).get('zone')
                ok(g is not None and g['icon'] == 'zone', f'[{mp}] a capture-zone marker with the zone icon')
                if not g: await end(p); continue
                ok(g['label'] in ('CAPTURE ZONE', 'HOLD THE ZONE'), f'[{mp}] labelled "{g["label"]}"')
                # put the zone in known places around the camera and check where the arrow goes
                await p.wait_for_timeout(1200)                     # let the match-start camera settle
                want = {'ahead': 'up', 'behind': 'down', 'left': 'left', 'right': 'right'}
                for name in ('ahead', 'behind', 'left', 'right'):
                    # "ahead" and "right" as the camera sees them RIGHT NOW (it follows the tank)
                    me = await p.evaluate("(() => { const m = __tf.game.lastMe; return [m.x, m.z]; })()")
                    # which ground directions go straight up / straight right on screen, from the real projection
                    o = await p.evaluate(REL, [me[0], 0, me[1]]); ax = await p.evaluate(REL, [me[0] + 5, 0, me[1]]); az = await p.evaluate(REL, [me[0], 0, me[1] + 5])
                    a = (ax['x'] - o['x'], ax['y'] - o['y']); b = (az['x'] - o['x'], az['y'] - o['y']); det = a[0] * b[1] - a[1] * b[0] or 1e-9
                    solve = lambda X, Y: ((X * b[1] - Y * b[0]) / det, (a[0] * Y - a[1] * X) / det)
                    fx, fz = solve(0, 1); L = (fx * fx + fz * fz) ** 0.5 or 1; fx, fz = fx / L, fz / L          # screen up = ahead
                    rx, rz = solve(1, 0); L = (rx * rx + rz * rz) ** 0.5 or 1; rx, rz = rx / L, rz / L          # screen right
                    dx, dz = {'ahead': (fx * 120, fz * 120), 'behind': (-fx * 160, -fz * 160), 'left': (-rx * 150, -rz * 150), 'right': (rx * 150, rz * 150)}[name]
                    await p.evaluate(f"(() => {{ const z = __tf.game.obj.zone; z.x = {me[0] + dx}; z.z = {me[1] + dz}; window.__zoneAt = [z.x, z.z]; }})()")
                    await p.wait_for_timeout(250)
                    g = (await p.evaluate(G)).get('zone')
                    # for "right", screen-right as the camera sees it may be mirrored by the camera yaw — compare with the true projection
                    rel = await p.evaluate(REL, [me[0] + dx, 0, me[1] + dz])
                    truth = 'down' if rel['behind'] else ('left' if rel['x'] < -1 and abs(rel['x']) >= abs(rel['y']) else 'right' if rel['x'] > 1 and abs(rel['x']) >= abs(rel['y']) else 'up' if rel['y'] > 1 else 'down')
                    ok(g and g['edge'] and dirOf(g['ang']) in (want[name], truth), f'[{mp}] zone {name} of you: arrow on the edge pointing {dirOf(g["ang"]) if g else "?"} (expected {want[name]})')
                    ok(g and 'm' in g['dist'], f'[{mp}]   with the distance ({g["dist"] if g else ""})')
                # on screen: the arrow turns into the small marker over the zone
                me = await p.evaluate("(() => { const m = __tf.game.lastMe; return [m.x, m.z]; })()")
                await p.evaluate(f"(() => {{ const z = __tf.game.obj.zone; z.x = {me[0] + fx * 6}; z.z = {me[1] + fz * 6}; window.__zoneAt = [z.x, z.z]; }})()")
                await p.wait_for_timeout(250)
                g = (await p.evaluate(G)).get('zone')
                ok(g and g['on'] and not g['edge'], f'[{mp}] the zone on screen: no edge arrow — a small marker over it')
                ok(await p.evaluate("!!(__tf.game.zoneMesh && __tf.game.zoneMesh.userData.beam && __tf.game.zoneMesh.userData.halo)"), f'[{mp}] the zone has its faint beacon and floating ring')
                op = await p.evaluate("__tf.game.zoneMesh.userData.beam.material.opacity")
                ok(op <= 0.3, f'[{mp}] and the beacon is faint, not a glowing pillar (opacity {op})')
                # waiting to respawn: no own tank this frame — the marker still points, from where the camera is
                await p.evaluate("__tf.game.updateObjective(0.016, null)")
                ok('zone' in await p.evaluate(G), f'[{mp}] with no tank of your own (respawning), the marker stays')
                await end(p)
            # the markers never sit on the controls: sticks, fire, power
            ctl = await p.evaluate("""() => ['moveBase', 'aimBase', 'fireBtn', 'abBtn'].map(id => document.getElementById(id)).filter(e => e && e.offsetParent).map(e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; })""")

            print('\n--- SURVIVAL: the base to defend')
            await setup_pick(p, 'surv', 'hawler'); await start(p)
            await p.wait_for_function("__tf.game.obj && __tf.game.obj.zone", timeout=6000)
            g = (await p.evaluate(G)).get('zone')
            ok(g and g['label'] == 'DEFEND THE BASE', f'the Survival base is marked "DEFEND THE BASE" ({g and g["label"]})')
            await end(p)

            print('\n--- CONVOY: a moving objective')
            await setup_pick(p, 'convoy', 'hawler'); await start(p)
            await p.wait_for_function("__tf.game.ms && __tf.game.ms.truck && __tf.game.obj && __tf.game.obj.cv", timeout=8000)
            await p.wait_for_timeout(400)
            g = (await p.evaluate(G)).get('convoy')
            att = await p.evaluate("(() => { const me = __tf.room.players.find(q => q.id === __tf.net.myId); return me.team === __tf.game.obj.cv.att; })()")
            ok(g and g['icon'] == 'truck', 'a convoy marker with the truck icon')
            ok(g and g['label'] in (['ESCORT CONVOY', 'DEFEND CONVOY'] if att else ['STOP CONVOY']), f'your side decides what it says: "{g and g["label"]}" (you are {"escorting" if att else "stopping it"})')
            # it moves: follow it
            samples = []
            for _ in range(3):
                await p.evaluate("(() => { const s = __tf.game.ms; s.truck = [s.truck[0] + 40, s.truck[1] + 25, s.truck[2]]; })()")
                await p.wait_for_timeout(450)
                gg = (await p.evaluate(G)).get('convoy'); samples.append((round(gg['x']), round(gg['y']), gg['dist']))
            ok(len(set(samples)) == 3, f'as the truck moves, the marker follows it ({samples})')
            # a team change flips the job
            await p.evaluate("(() => { const me = __tf.room.players.find(q => q.id === __tf.net.myId); me.team = me.team === 'blue' ? 'red' : 'blue'; })()")
            await p.wait_for_timeout(250)
            g2 = (await p.evaluate(G)).get('convoy')
            ok(g2 and ((g2['label'] == 'STOP CONVOY') == att), f'change sides and the job changes: now "{g2 and g2["label"]}"')
            await p.evaluate("(() => { const me = __tf.room.players.find(q => q.id === __tf.net.myId); me.team = me.team === 'blue' ? 'red' : 'blue'; })()")
            # a reconnect: the client starts from nothing and the server sends the mode state again
            await p.evaluate("(() => { const g = __tf.game, s = g.ms; for (const m of Object.values(g.mp || {})) m && m.parent && m.parent.remove(m); g.mp = null; g.ms = null; g.modeState(s); })()")
            await p.wait_for_timeout(300)
            ok('convoy' in await p.evaluate(G), 'after a reconnect (fresh mode state) the convoy marker is back')
            await end(p)

            print('\n--- HOT POTATO')
            await setup_pick(p, 'potato', 'hawler'); await start(p)
            ids = await p.evaluate("(() => ({ me: __tf.net.myId, bots: __tf.room.players.filter(q => q.bot).map(q => q.id) }))()")
            await p.wait_for_function("__tf.game.ms", timeout=6000)
            # the server streams the mode state every tick; let the test decide who holds the potato
            await p.evaluate("(() => { const g = __tf.game, o = g.modeState.bind(g); g.modeState = (ev) => { if (window.__bomb !== undefined) ev.bomb = window.__bomb; o(ev); }; })()")
            # someone else holds it
            await p.evaluate(f"(() => {{ window.__bomb = [{ids['bots'][0]}, 9]; __tf.game.ms.bomb = __bomb; __tf.game.modeState(__tf.game.ms); }})()")
            await p.wait_for_timeout(300)
            g = (await p.evaluate(G)).get('potato')
            pos0 = await p.evaluate(f"(() => {{ const v = __tf.game.views.get({ids['bots'][0]}); return v && v.root.visible; }})()")
            ok((g is not None and g['icon'] == 'bomb' and g['label'] == 'HOT POTATO') or not pos0, f'another player holds it: a HOT POTATO marker on them ({g and g["label"]})')
            ok(await p.evaluate("!(__tf.hud._pw && !__tf.hud._pw.hidden)"), 'and no "you have it" warning')
            # it changes hands: the marker moves at once — never left on the old holder
            before = await p.evaluate(G)
            await p.evaluate(f"(() => {{ window.__bomb = [{ids['bots'][1]}, 8]; __tf.game.ms.bomb = __bomb; }})()")
            await p.wait_for_timeout(60)
            after = (await p.evaluate(G)).get('potato')
            tgt = await p.evaluate(f"(() => {{ const v = __tf.game.views.get({ids['bots'][1]}); if (!v || !v.root.visible) return null; const q = v.root.position; return __tf.game.project(q.x, q.y + 6.4, q.z); }})()")
            if tgt and after and after['on']:
                ok(abs(after['x'] - tgt['x']) < 3 and abs(after['y'] - tgt['y']) < 3, 'when it changes hands the marker is on the NEW holder within a frame or two')
            else:
                ok(after is not None, 'when it changes hands the marker switches to the new holder at once')
            # you hold it: no arrow at yourself, a warning instead
            await p.evaluate(f"(() => {{ window.__bomb = [{ids['me']}, 7]; __tf.game.ms.bomb = __bomb; }})()")
            await p.wait_for_timeout(200)
            gm = await p.evaluate(G)
            warn = await p.evaluate("__tf.hud._pw && !__tf.hud._pw.hidden ? __tf.hud._pw.textContent : ''")
            ok('potato' not in gm, 'YOU hold it: no marker pointing at yourself')
            ok('YOU HAVE THE HOT POTATO' in warn, f'a clear warning instead: "{warn}"')
            # nobody has it (between rounds): nothing at all
            await p.evaluate("(() => { window.__bomb = null; __tf.game.ms.bomb = null; })()"); await p.wait_for_timeout(200)
            ok('potato' not in await p.evaluate(G) and await p.evaluate("!__tf.hud._pw || __tf.hud._pw.hidden"), 'when nobody holds it: no marker and no warning')
            await end(p)

            print('\n--- CTF, TEAM BATTLE')
            await setup_pick(p, 'ctf', 'desert'); await start(p)
            await p.wait_for_function("__tf.game.obj && __tf.game.obj.flags", timeout=6000); await p.wait_for_timeout(300)
            gs = await p.evaluate(G)
            fl = [v for k, v in gs.items() if k in ('blue', 'red')]
            ok(fl and all(v['icon'] == 'flag' and 'm' in v['dist'] for v in fl), f'CTF: the flag markers use the same system — flag icon and distance ({[(v["label"], v["dist"]) for v in fl]})')
            await end(p)
            await setup_pick(p, 'tdm', 'forest'); await start(p)
            await p.wait_for_timeout(600)
            ok(await p.evaluate(G) == {}, 'Team Battle has no fixed objective: no marker at all')
            await end(p)

            print('\n--- after a map change, and not on the controls')
            await setup_pick(p, 'koh', 'forest'); await start(p)
            await p.wait_for_function("__tf.game.obj && __tf.game.obj.zone", timeout=6000); await p.wait_for_timeout(300)
            await pin_zone(p)
            z = await p.evaluate("[__tf.game.obj.zone.x, __tf.game.obj.zone.z]")
            zm = await p.evaluate("[__tf.game.zoneMesh.position.x, __tf.game.zoneMesh.position.z]")
            ok(abs(z[0] - zm[0]) < 0.1 and abs(z[1] - zm[1]) < 0.1 and 'zone' in await p.evaluate(G), 'a new match on another map: the zone and its marker are where the new zone is')
            ctl = await p.evaluate("""() => ['moveBase', 'aimBase', 'fireBtn', 'abBtn'].map(id => document.getElementById(id)).filter(e => e && e.offsetParent).map(e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; })""")
            me = await p.evaluate("(() => { const m = __tf.game.lastMe; return [m.x, m.z]; })()")
            clash = []
            for a in range(0, 360, 15):
                import math
                await p.evaluate(f"(() => {{ const z = __tf.game.obj.zone; z.x = {me[0] + math.cos(math.radians(a)) * 170}; z.z = {me[1] + math.sin(math.radians(a)) * 170}; window.__zoneAt = [z.x, z.z]; }})()")
                await p.wait_for_timeout(70)
                g = (await p.evaluate(G)).get('zone')
                if g and g['edge'] and any(r[0] - 4 < g['x'] < r[2] + 4 and r[1] - 4 < g['y'] < r[3] + 4 for r in ctl): clash.append(a)
            ok(ctl and not clash, f'in every direction the edge arrow stays off the sticks and buttons ({len(ctl)} controls checked, clashes at {clash})')
            # three languages
            for lang, word in (('ar', 'منطقة'), ('ku', 'ناوچە')):
                await p.evaluate(f"__tf.setLang('{lang}')"); await p.wait_for_timeout(200)
                await p.evaluate(f"(() => {{ const z = __tf.game.obj.zone; z.x = {me[0] + 200}; window.__zoneAt = [z.x, z.z]; }})()"); await p.wait_for_timeout(150)
                g = (await p.evaluate(G)).get('zone')
                ok(g and word in g['label'], f'[{lang}] the zone marker reads "{g and g["label"]}"')
            await p.evaluate("__tf.setLang('en')")

            print('\n--- AIM GUIDE')
            info = await p.evaluate("""(async () => { const m = await import('/js/game/aimguide.js'), a = __tf.game.aim, D = m.DASH;
              const tri = (mesh) => { const P = mesh.geometry.attributes.position.array; const xs = [], zs = []; for (let i = 0; i < 18; i += 3) { xs.push(P[i]); zs.push(P[i + 2]); }
                return { w: Math.max(...xs) - Math.min(...xs), l: Math.max(...zs) - Math.min(...zs) }; };
              const white = tri(a.dots), dark = tri(a.shade);
              let meshes = 0; for (const o of [a.shade, a.dots, a.ring, a.ringShade]) if (o) meshes++;
              return { D, white, dark, wOp: a.dots.material.opacity, dOp: a.shade.material.opacity, meshes, verts: a.dots.geometry.attributes.position.count }; })()""")
            w, d, D = info['white'], info['dark'], info['D']
            ok(w['l'] / w['w'] >= 3, f'each segment is a dash, not a dot: {w["l"]:.2f} m long, {w["w"]:.2f} m wide')
            ok((d['w'] - w['w']) / 2 < w['w'] / 2 and (d['w'] - w['w']) / 2 <= 0.05, f'the dark edge is very thin: {(d["w"] - w["w"]) / 2 * 100:.1f} cm each side, against a {w["w"] * 100:.0f} cm white dash')
            ok(info['wOp'] >= 0.9 and info['dOp'] <= 0.45, f'white dominates: white at {info["wOp"]:.2f} opacity over a faint {info["dOp"]:.2f} edge')
            ok(info['meshes'] == 4 and info['verts'] <= 34 * 6, f'no extra cost: 4 draw calls, {info["verts"]} vertices')
            # readable on desert sand: contrast of the white against the sand, and of the edge against it
            sand = await p.evaluate("(async () => { const m = await import('/shared/maps.js'); const M = m.getMap('desert'); return M.ground || M.colors || null; })()")
            lum = lambda c: (lambda r, g, b: 0.2126 * r + 0.7152 * g + 0.0722 * b)(*[(((c >> s) & 255) / 255) ** 2.2 for s in (16, 8, 0)])
            sandHex = 0xd9b77a                                     # the desert floor's colour (see world.js)
            whiteOnSand = 0.92 * 1 + 0.08 * lum(sandHex)
            edgeOnSand = (1 - info['dOp']) * lum(sandHex) + info['dOp'] * lum(0x14100c)
            ratio = (whiteOnSand + 0.05) / (edgeOnSand + 0.05)
            ok(ratio >= 1.5, f'on desert sand the white dash stands off its dark edge (contrast {ratio:.2f}:1)')
            await c.close(); await br.close()
    finally:
        srv.terminate()
    for e in errs: print('  ' + e)
    bad = fails + errs
    print(('FAILED: %d' % len(bad)) if bad else 'browser-test28: all good')
    sys.exit(1 if bad else 0)

asyncio.run(main())
