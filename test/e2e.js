// E2E: 王国争覇 — ひとり用（390×844・?from=portal・アストラウルトラ）、375×667（4人）、ホスト＋参加者のオンライン（攻撃あり・PeerJS＋ローカルSTUN）
// usage: node test/stun.js <box-ip> 3478 &  python3 -m http.server 18791 --bind 127.0.0.1 &  node test/e2e.js <box-ip> 18791
const { chromium } = require('/workspace/hayaoshi-quiz/node_modules/playwright-core');
const IP = process.argv[2] || '172.30.0.2', PORT = process.argv[3] || 18791;
const ROOT = `http://localhost:${PORT}/index.html`;
const NET = `${ROOT}?ice=${encodeURIComponent('stun:' + IP + ':3478')}&turbo`;
const SS = __dirname + '/../screenshots/';
const ONLY = process.argv[4] || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = []; const fail = m => { errors.push(m); console.log('  ✗', m); }; const ok = m => console.log('  ✓', m);
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  async function phone(label, w = 390, h = 844, desktop = false) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: desktop ? 1 : 2, isMobile: !desktop, hasTouch: !desktop, locale: 'ja-JP' });
    const p = await ctx.newPage(); p.label = label; p.touch = !desktop;
    p.on('pageerror', e => fail(`[${label}] JS error ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/PeerJS|WebSocket|net::|ERR_|Failed to load resource/.test(m.text())) fail(`[${label}] console ${m.text()}`); });
    return p;
  }
  const view = p => p.evaluate(() => window.__ll.view && JSON.parse(JSON.stringify(window.__ll.view)));
  const waitV = (p, fn, ms) => p.waitForFunction(new Function('var v = window.__ll.view; return !!v && (' + fn + ');'), null, { timeout: ms || 20000 });
  async function layout(p, tag) {
    await p.evaluate(() => { const gm = document.getElementById('game'); gm.classList.remove('quake'); document.querySelectorAll('.hitfx').forEach(e => e.classList.remove('hitfx')); });
    const r = await p.evaluate(() => {
      const vis = el => { if (!el.getClientRects().length) return false; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; };
      const fab = document.getElementById('hirobaFab'), fr = fab && vis(fab) ? fab.getBoundingClientRect() : null;
      const scr = document.querySelector('.screen.active') || document.body, sr = scr.getBoundingClientRect(), hits = [];
      scr.querySelectorAll('button, input, select, a, .cd[data-i], .pile').forEach(b => {
        if (!vis(b) || b === fab) return; const r = b.getBoundingClientRect(); if (!r.width || !r.height) return;
        const top = Math.max(r.top, sr.top), bot = Math.min(r.bottom, sr.bottom, innerHeight);
        if (bot <= top) return;
        if (fr && r.left < fr.right && r.right > fr.left && top < fr.bottom && bot > fr.top) hits.push((b.id || b.className || b.tagName) + ' ' + (b.textContent || '').trim().slice(0, 12));
      });
      const inGame = document.body.classList.contains('in-game'), land = document.body.classList.contains('land');
      const wide = [...scr.querySelectorAll('*')].filter(e => vis(e) && e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('#hand') && !e.closest('#playArea') && !e.closest('#pop') && !e.closest('#scene')).map(e => e.id || e.className);
      const box = id => { const e = document.getElementById(id); return e ? e.getBoundingClientRect() : null; };
      const piles = [...document.querySelectorAll('#supply .pile')].map(e => e.getBoundingClientRect());
      const hand = box('hand'), prompt = box('prompt'), log = box('log');
      return { land, docScroll: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - innerHeight, scrollY, fab: !!fr, hits, inGame, wide, vh: innerHeight,
        handBottom: hand ? hand.bottom : 0, promptH: prompt ? prompt.height : 0, logH: log ? log.height : 0, pileMinW: piles.length ? Math.min(...piles.map(r => r.width)) : 99, pileMinH: piles.length ? Math.min(...piles.map(r => r.height)) : 99 };
    });
    if (r.docScroll > 1 || r.scrollY) fail(`[${tag}] page scrolls: ${JSON.stringify(r)}`);
    if (r.hits.length) fail(`[${tag}] hub button overlaps: ${r.hits.join(', ')}`);
    if (r.wide.length) fail(`[${tag}] elements overflow horizontally: ${r.wide.slice(0, 5).join(', ')}`);
    if (r.inGame) {
      if (r.fab) fail(`[${tag}] hub button visible during play`);
      if (r.handBottom > r.vh + 0.5) fail(`[${tag}] hand off-screen ${JSON.stringify(r)}`);
      if (!r.land && r.logH < 30) fail(`[${tag}] log squeezed ${r.logH}`);
      if (r.land ? (r.pileMinW < 30 || r.pileMinH < 26) : (r.pileMinW < 36 || r.pileMinH < 40)) fail(`[${tag}] supply tiles too small ${r.pileMinW}x${r.pileMinH}`);
    }
    return r;
  }
  // 手札のカード：重なっていても実際に見えている点を探してタップ／上にスワイプ
  async function cardPoint(p, i) {
    return p.evaluate(i => {
      const el = document.querySelector(`#hand .cd[data-i="${i}"]`); if (!el) return null;
      if (!document.body.classList.contains('land')) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const r = el.getBoundingClientRect();
      for (const y of [r.top + Math.min(40, r.height / 3), r.top + 18, r.top + 60]) {   // 見えている帯のまん中（端だとタッチ補正で隣のカードになる）
        const xs = [];
        for (let x = r.left + 2; x < r.right - 2; x += 3) { if (y > innerHeight - 2 || x < 0 || x > innerWidth - 1) continue; const h = document.elementFromPoint(x, y); if (h && h.closest('.cd') === el) xs.push(x); }
        if (xs.length) return { x: xs[Math.floor(xs.length / 2)], y };
      }
      return null;
    }, i);
  }
  async function tapCard(p, i) {
    const pt = await cardPoint(p, i); if (!pt) { fail(`[${p.label}] hand card ${i} not reachable`); return; }
    if (p.touch) await p.touchscreen.tap(pt.x, pt.y); else await p.mouse.click(pt.x, pt.y);
  }
  async function swipeCard(p, i) {
    const pt = await cardPoint(p, i); if (!pt) { fail(`[${p.label}] hand card ${i} not reachable for swipe: ` + (await p.evaluate(() => (document.querySelector('.ov.active') || {}).id + ' ' + document.getElementById('choiceBox').textContent.slice(0, 80) + ' need=' + JSON.stringify(window.__ll.view.g.need)))); await p.screenshot({ path: SS + 'dbg_' + p.label + '.png' }); return; }
    await p.mouse.move(pt.x, pt.y); await p.mouse.down();
    for (let k = 1; k <= 8; k++) { await p.mouse.move(pt.x + k, pt.y - k * 14); await sleep(16); }
    await p.mouse.up();
  }
  const tapS = (p, sel) => p.touch ? p.tap(sel, { force: true }) : p.click(sel, { force: true });
  const isLand = p => p.evaluate(() => document.body.classList.contains('land'));
  // 自分の番を本物のタップで進める（アクション：2回タップで使う／購入：財宝を出す→光っている山→「買う」）
  async function humanTurns(p, who, n, shots) {
    let turns = 0, steps = 0; const kinds = {}; const t0 = Date.now();
    while (turns < n && Date.now() - t0 < 120000) {
      const st = await p.waitForFunction(() => {
        const v = window.__ll.view; if (!v || v.phase !== 'game') return 'over';
        const g = v.g; if (!g.need || g.need.p !== g.me || g.wait > 0 || g.over) return false;
        return g.need.k;
      }, null, { timeout: 60000, polling: 50 }).then(h => h.jsonValue(), () => 'timeout');
      if (st === 'over' || st === 'timeout') break;
      const g = (await view(p)).g, k = g.k, land = await isLand(p);
      if (st === 'action') {
        const i = g.hand.findIndex(c => ['shukuba', 'shanikusai', 'bazaar', 'renkin', 'tetsuuchi', 'entaku', 'jikeidan', 'jujutsu', 'ryogae', 'ginzaiku'].includes(c));
        if (i >= 0 && g.actions > 0 && land && kinds.play) { await swipeCard(p, i); kinds.swipeAction = (kinds.swipeAction || 0) + 1; }
        else if (i >= 0 && g.actions > 0) {
          await tapCard(p, i); await sleep(180);
          if (shots && !kinds.focus) { await p.screenshot({ path: SS + shots + '_action_focus.png' }); kinds.focus = 1; }
          await tapCard(p, i); kinds.play = (kinds.play || 0) + 1;
        } else await tapS(p, '#prompt [data-b="endAction"]');
      } else if (st === 'buy') {
        if (!g.bought && g.hand.some(c => ['copper', 'silver', 'gold'].includes(c))) {
          const ti = g.hand.findIndex(c => c === 'silver' || c === 'gold'), ci = g.hand.findIndex(c => ['copper', 'silver', 'gold'].includes(c));
          if (land && (kinds.swipeTreasure || 0) < 2) { await swipeCard(p, ci); kinds.swipeTreasure = (kinds.swipeTreasure || 0) + 1; }
          else if (ti >= 0 && !kinds.oneTreasure) { await tapCard(p, ti); kinds.oneTreasure = 1; }
          else await tapS(p, '#prompt [data-b="all"]');
        } else {
          const want = ['oukan', 'gold', 'renkin', 'bazaar', 'shanikusai', 'tetsuuchi', 'shukuba', 'silver'].find(c => g.supply[c] > 0 && window_cost(c) <= g.coins);
          if (want && g.buys > 0) {
            await tapS(p, `#supply .pile[data-c="${want}"]`); await sleep(120);
            if (shots && !kinds.buySheet) { await p.screenshot({ path: SS + shots + '_buy_sheet.png' }); kinds.buySheet = 1; }
            await tapS(p, '#choiceBox [data-b="buyGo"]'); kinds.buy = (kinds.buy || 0) + 1;
          } else {
            await tapS(p, '#prompt [data-b="endTurn"]'); await sleep(80);
            if (await p.isVisible('#confirmModal')) await tapS(p, '#cfYes');
          }
        }
      } else { await p.evaluate(() => window.__ll.act(autoAnswer(window.__ll.view.g))); kinds.other = 1; }
      await p.waitForFunction(k => { const v = window.__ll.view; return !v.g || v.g.k !== k; }, k, { timeout: 8000 }).catch(() => fail(`[${who}] tap had no effect (${st})`));
      if (st === 'buy' && (await view(p)).g.turn !== g.me) turns++;
      steps++;
    }
    ok(`[${who}] ${turns} turns / ${steps} steps by real taps (${Object.entries(kinds).map(e => e[0] + (e[1] > 1 ? '×' + e[1] : '')).join('／')})`);
    return kinds;
  }
  const COST = { oukan: 8, gold: 6, renkin: 5, bazaar: 5, shanikusai: 5, tetsuuchi: 4, shukuba: 3, silver: 3 };
  function window_cost(c) { return COST[c]; }
  // 横画面：盤のすべての部品が画面内・重なっていない・選択パネルが画面に収まる
  async function landCheck(p, tag) {
    await layout(p, tag);
    const r = await p.evaluate(() => {
      const vw = innerWidth, vh = innerHeight, out = [], R = e => e.getBoundingClientRect();
      const vis = el => { if (!el.getClientRects().length) return false; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; };
      if (!document.body.classList.contains('land')) return { notLand: true };
      const sheet = document.getElementById('choiceSheet').classList.contains('active');
      const sel = sheet ? '#choiceSheet .card' : '#supply .pile, #prompt .pbtn, #counters .tk, #counters .pl, #logBtnL, #oppBar .op, .top .ib';
      document.querySelectorAll(sel).forEach(e => { if (!vis(e)) return; const b = R(e); if (b.left < -1 || b.top < -1 || b.right > vw + 1 || b.bottom > vh + 1) out.push((e.id || e.className) + ' ' + [b.left, b.top, b.right, b.bottom].map(Math.round)); });
      const piles = [...document.querySelectorAll('#supply .pile')].filter(vis).map(R), btns = [...document.querySelectorAll('#prompt .pbtn, #logBtnL')].filter(vis).map(R);
      const hit = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1, over = [];
      btns.forEach(b => piles.forEach(q => { if (hit(b, q)) over.push('button×pile'); }));
      const hc = [...document.querySelectorAll('#hand .cd')].map(R), kb = Math.max(...piles.map(q => q.bottom));
      hc.forEach(c => { if (c.top < kb - 1) over.push('hand×kingdom'); if (c.top > vh - 60) over.push('hand card hidden'); });
      btns.forEach(b => hc.forEach(c => { if (hit(b, c)) over.push('button×hand'); }));
      return { out, over: [...new Set(over)], sheet };
    });
    if (r.notLand) fail(`[${tag}] expected the landscape board`);
    else { if (r.out.length) fail(`[${tag}] outside the screen: ${r.out.slice(0, 4).join(' | ')}`); if (r.over.length) fail(`[${tag}] overlaps: ${r.over.join(', ')}`); }
    return r;
  }
  // 決まった判断で止めて（hold）画面を撮る
  async function capture(p, key, file, ms) {
    const hit = await p.waitForFunction(key => { const v = window.__ll.view; if (!v || !v.g || !v.g.need) return v && v.phase === 'end' ? 'end' : false; const n = v.g.need; return n.p === v.g.me && (n.k + ':' + (n.why || '') === key || n.k === key) ? 'hit' : false; }, key, { timeout: ms || 90000, polling: 40 }).then(h => h.jsonValue(), () => false);
    if (hit !== 'hit') return false;
    await sleep(350); await p.screenshot({ path: SS + file });
    return true;
  }
  async function playToEnd(p, maxMs, every) {
    const t0 = Date.now(); let n = 0;
    while (Date.now() - t0 < maxMs) { const v = await view(p); if (v.phase === 'end') return v; if (every && v.phase === 'game' && n++ % 6 === 0) await every(v); await sleep(500); }
    return view(p);
  }

  // ================= 1) ひとり用 390×844, ?from=portal, 3人・アストラウルトラ =================
  if (!ONLY || ONLY === 'solo') {
    const p = await phone('solo390');
    await p.goto(ROOT + '?turbo&from=portal'); await sleep(400);
    const L1 = await layout(p, 'title390');
    if (!L1.fab) fail('hub button should show on title with ?from=portal'); else ok('title: 🏠 ひろばへ visible with ?from=portal, no overlap, no page scroll');
    await p.screenshot({ path: SS + 'title.png' });
    await p.fill('#nameIn', 'りょう'); await p.tap('#soloBtn'); await p.waitForSelector('#lobby.active');
    await layout(p, 'lobby390');
    await p.tap('#npSeg button[data-v="3"]'); await waitV(p, 'v.opts.np === 3');
    await p.selectOption('select[data-c="0"][data-k="ch"]', 'kon');
    await p.selectOption('select[data-c="0"][data-k="lv"]', 'ultra');
    await p.selectOption('select[data-c="1"][data-k="lv"]', 'strong');
    await p.tap('#kmodeSeg button[data-v="set"]'); await p.tap('#setList button[data-v="first"]');
    await waitV(p, "v.opts.cpu[0].lv === 'ultra' && v.opts.cpu[0].ch === 'kon' && v.opts.cpu[1].lv === 'strong'");
    const chs = await p.evaluate(() => window.__ll.view.opts.cpu.map(c => c.ch));
    if (new Set(chs).size !== 6) fail('duplicate characters after swap ' + chs); else ok('character select swaps instead of duplicating: ' + chs.slice(0, 2).join(','));
    await p.screenshot({ path: SS + 'lobby_solo.png' });
    await p.tap('#kPreview [data-info="jikeidan"]'); await sleep(150);
    if (!(await p.isVisible('#choiceSheet'))) fail('lobby card info sheet'); else { await p.screenshot({ path: SS + 'lobby_cardinfo.png' }); ok('lobby: tap a kingdom card → description sheet'); }
    await p.tap('#choiceBox [data-b="closeCard"]');
    await p.tap('#kmodeSeg button[data-v="custom"]'); await p.tap('#customGrid [data-c="jujutsu"]'); await p.tap('#customGrid [data-c="renkin"]');
    await waitV(p, "v.opts.pick.length === 2"); await p.evaluate(() => document.getElementById('customBox').scrollIntoView()); await p.screenshot({ path: SS + 'lobby_custom.png' });
    ok('custom kingdom pick works (2 picked, rest random at start)');
    await p.tap('#startBtn');
    await p.waitForSelector('#awaken.on', { timeout: 5000 }).catch(() => fail('awakening did not start'));
    const dur = await p.evaluate(() => Math.max.apply(null, document.getAnimations().filter(a => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#awaken')).map(x => x.effect.getComputedTiming().endTime)));
    await p.evaluate(() => document.getAnimations().forEach(a => { a.pause(); a.currentTime = 4300; }));
    await sleep(200); await p.screenshot({ path: SS + 'awaken.png' });
    const aw = await p.evaluate(() => ({ txt: document.getElementById('awaken').textContent.replace(/\s+/g, ' ').slice(0, 70), bgm: window.__ll.bgm() }));
    await p.evaluate(() => document.getAnimations().forEach(a => a.play()));
    if (!(dur > 5000 && dur < 9000)) fail('awakening length ' + dur); else ok(`覚醒 cinematic ${(dur / 1000).toFixed(1)}s 「${aw.txt.trim()}」`);
    await p.tap('#awaken'); await sleep(200);
    if (await p.$('#awaken.on')) fail('tap did not skip the cinematic'); else ok('tap skips the cinematic');
    await waitV(p, 'v.g.wait === 0', 30000);
    const kd = await view(p);
    ok('kingdom with picks: ' + kd.g.kingdom.join(',') + (kd.g.kingdom.includes('jujutsu') && kd.g.kingdom.includes('renkin') ? '' : ' ✗'));
    const plan = await p.evaluate(() => window.__ll.hostRoom().G.utable);
    if (!plan || !plan.length) fail('ultra did not select a plan'); else ok('アストラウルトラ selected 「' + plan[0].name + '」 (self-play ' + plan.map(x => x.name + ' ' + x.s2).slice(0, 3).join(' / ') + ')');
    await sleep(800);
    const b = await p.evaluate(() => window.__ll.bgm());
    if (b.cur !== 'epic') fail('boss BGM not playing ' + JSON.stringify(b)); else ok('boss BGM after awakening');
    if (!(await p.$('.pr.ultra'))) fail('ultra aura missing'); else ok('アストラウルトラ has the aura border');
    await layout(p, 'game390');
    await p.screenshot({ path: SS + 'game_390.png' });
    await p.tap('#refBtn2'); await sleep(200);
    if (!(await p.isVisible('#refModal'))) fail('card reference not reachable'); else { await p.screenshot({ path: SS + 'card_ref.png' }); ok('🃏 card list with remaining counts opens during play'); }
    await p.tap('#refClose');
    await humanTurns(p, 'solo390', 4, 'solo');
    await layout(p, 'game390-mid'); await p.screenshot({ path: SS + 'game_390_mid.png' });
    await p.tap('#logToggle'); await sleep(100); await p.screenshot({ path: SS + 'log_open.png' }); await p.tap('#logToggle');
    await p.tap('.pr[data-p="1"]'); await sleep(120); await p.screenshot({ path: SS + 'player_sheet.png' }); await p.tap('#choiceBox [data-b="closeCard"]');
    await p.evaluate(() => { window.__ll.autoplay = true; window.__ll.buyList = ['oukan', 'gold', 'jujutsu', 'renkin', 'tetsuuchi', 'jikeidan', 'silver']; });
    const t0 = Date.now();
    const v = await playToEnd(p, 300000, async () => { await layout(p, 'game390-auto'); });
    if (v.phase !== 'end') fail('solo 390 game did not finish: ' + v.phase);
    else {
      const r = v.g.result;
      ok(`solo 3-player game finished (${((Date.now() - t0) / 1000).toFixed(0)}s): ${v.g.owners.map((o, i) => (o.e || '') + o.name + (o.lv ? '(' + o.lv + ')' : '') + ' ★' + r.scores[i]).join(' / ')} — ${r.why}, winners ${r.winners}`);
      await sleep(500); await p.screenshot({ path: SS + 'result.png' }); await layout(p, 'result390');
      const fabEnd = await p.evaluate(() => getComputedStyle(document.getElementById('hirobaFab')).display !== 'none');
      if (!fabEnd) fail('hub button should return on the result screen'); else ok('hub button back on result screen');
      if (!(await p.$('#rankList .deck .mini'))) fail('deck breakdown missing'); else ok('result shows deck breakdown');
      // もう一度（同じ王国）：前の勝者が最後の手番
      const w = r.winners; await p.tap('#againBtn'); await waitV(p, 'v.phase === "game" && v.g.wait === 0', 30000);
      const v2 = await view(p);
      if (w.length === 1) { if (v2.g.first !== (w[0] + 1) % 3) fail('rematch first player should be left of winner'); else ok('rematch: previous winner goes last (first = seat ' + v2.g.first + ')'); }
      if (v2.g.kingdom.join() !== v.g.kingdom.join()) fail('rematch should keep kingdom'); else ok('rematch keeps the same kingdom');
      // 再開（ホストのリロード）
      await p.evaluate(() => { window.__ll.autoplay = false; });
      await waitV(p, 'v.g && v.g.need && v.g.need.p === v.g.me && v.g.P[v.g.me].turns >= 1', 60000); await sleep(1500);   // CPU が止まる「自分の番」で保存を待つ
      const snap = await p.evaluate(() => { const S = window.__ll.hostRoom().G.S; return JSON.stringify({ h: S.P.map(P => P.hand), d: S.P.map(P => P.deck), s: S.supply }); });
      await p.reload(); await sleep(400);
      if (!(await p.isVisible('#resumeBtn'))) fail('resume button missing after reload');
      else {
        await p.tap('#resumeBtn'); await waitV(p, 'v.phase === "game" && v.g.wait === 0', 10000);
        const snap2 = await p.evaluate(() => { const S = window.__ll.hostRoom().G.S; return JSON.stringify({ h: S.P.map(P => P.hand), d: S.P.map(P => P.deck), s: S.supply }); });
        if (snap !== snap2) fail('resumed state differs'); else ok('host reload → 再開: identical state rebuilt from seed + decision log');
      }
    }
    await p.context().close();
  }

  // ================= 2) ひとり用 375×667（iPhone SE）、4人・強い＋選択パネル =================
  if (!ONLY || ONLY === 'se') {
    const p = await phone('solo375', 375, 667);
    await p.goto(ROOT + '?turbo&from=portal'); await sleep(300);
    await layout(p, 'title375'); await p.screenshot({ path: SS + 'title_375.png' });
    await p.tap('#soloBtn'); await p.waitForSelector('#lobby.active');
    await p.tap('#npSeg button[data-v="4"]'); await p.tap('#lvAllSeg button[data-v="strong"]');
    await p.tap('#kmodeSeg button[data-v="custom"]');
    for (const c of ['monooki', 'zange', 'hayauma', 'tatenaoshi', 'ekken', 'monomi', 'kinmyaku', 'meikou', 'shahon', 'jikeidan']) await p.tap(`#customGrid [data-c="${c}"]`);
    await waitV(p, 'v.opts.np === 4 && v.opts.pick.length === 10');
    await layout(p, 'lobby375');
    await p.tap('#startBtn'); await waitV(p, 'v.phase === "game" && v.g.wait === 0');
    if (await p.$('#awaken.on')) fail('cinematic should not play without アストラウルトラ');
    await layout(p, 'game375'); await p.screenshot({ path: SS + 'game_375.png' });
    await p.setViewportSize({ width: 375, height: 553 }); await sleep(200);   // Safari のツールバーが出ているとき
    const Ls = await layout(p, 'game375x553'); await p.screenshot({ path: SS + 'game_375x553.png' }); ok('375×553 (Safari toolbars) fits: log ' + Math.round(Ls.logH) + 'px, hand bottom ' + Math.round(Ls.handBottom));
    await p.setViewportSize({ width: 375, height: 667 }); await sleep(100);
    await p.tap('#menuBtn'); const hub = await p.isVisible('#menuHiroba'); await p.tap('#menuRules'); await sleep(150);
    if (!hub || !(await p.isVisible('#rulesModal'))) fail('⋯ menu: rules / ひろば not reachable'); else ok('⋯ menu has 🏠 ひろばへ and あそびかた during play');
    await p.screenshot({ path: SS + 'rules_375.png' }); await p.tap('#rulesClose');
    await humanTurns(p, 'solo375', 2, 'se');
    await p.evaluate(() => { window.__ll.autoplay = true; window.__ll.buyList = ['oukan', 'gold', 'monomi', 'meikou', 'shahon', 'ekken', 'hayauma', 'tatenaoshi', 'zange', 'monooki', 'jikeidan', 'kinmyaku', 'silver']; window.__ll.buyAny = true; window.__ll.hold = ['hand:jikeidan', 'monomi', 'pick:hayauma', 'hand:ekken', 'hand:monooki', 'supply:meikou', 'yn:shahon']; });
    const want = { 'hand:jikeidan': 'panel_jikeidan_375.png', monomi: 'panel_monomi_375.png', 'pick:hayauma': 'panel_hayauma_375.png', 'hand:ekken': 'panel_ekken_375.png', 'hand:monooki': 'panel_monooki_375.png', 'supply:meikou': 'panel_meikou_375.png', 'yn:shahon': 'panel_shahon_375.png' };
    const got = []; const t0 = Date.now();
    while (Date.now() - t0 < 240000) {
      const v = await view(p); if (v.phase === 'end') break;
      const g = v.g, n = g && g.need;
      if (n && n.p === g.me && !g.wait) {
        const key = n.k === 'monomi' ? 'monomi' : n.k + ':' + (n.why || '');
        if (want[key]) {
          await sleep(300); await layout(p, 'panel-' + key); await p.screenshot({ path: SS + want[key] }); got.push(key); delete want[key];
          await p.evaluate(k => { window.__ll.hold = window.__ll.hold.filter(x => x !== k); }, key);
          if (key === 'monomi') { /* 物見やぐら：実際のボタンで「追放」→決定 */ await p.tap('#choiceBox [data-sf="0:trash"]').catch(() => {}); await sleep(80); await p.tap('#choiceBox [data-b="monomiOk"]').catch(() => {}); }
        }
      }
      await sleep(150);
    }
    ok('choice panels captured on 375×667: ' + got.join(', '));
    await p.evaluate(() => { window.__ll.hold = []; });
    const v = await playToEnd(p, 200000);
    if (v.phase !== 'end') fail('375 game did not finish'); else ok(`375×667 4-player game finished: ★${v.g.result.scores.join(' / ')} (${v.g.result.why}, turns ${v.g.P.map(P => P.turns).join('/')})`);
    await sleep(400); await p.screenshot({ path: SS + 'result_375.png' });
    await p.context().close();
  }

  // ================= 2b) 横画面のゲーム盤：844×390（iPhone 横）・667×375（SE 横）・1280×720（PC） =================
  if (!ONLY || ONLY === 'land') {
    for (const [w, h, tag, desk] of [[844, 390, '844x390', false], [667, 375, '667x375', false], [1280, 720, '1280x720', true]]) {
      const p = await phone('land' + tag, w, h, desk), big = tag === '844x390';
      await p.goto(ROOT + '?turbo&from=portal'); await sleep(400);
      const Lt = await layout(p, 'title-' + tag); if (!Lt.fab) fail(`[${tag}] ひろばへ missing on title`);
      await p.fill('#nameIn', 'りょう'); await p.click('#soloBtn'); await p.waitForSelector('#lobby.active'); await layout(p, 'lobby-' + tag);
      await p.click(`#npSeg button[data-v="${big ? 3 : 2}"]`);
      if (big) await p.selectOption('select[data-c="0"][data-k="lv"]', 'ultra');
      await p.click('#kmodeSeg button[data-v="custom"]');
      for (const c of ['shukuba', 'bazaar', 'shanikusai', 'jikeidan', 'monomi', 'ekken', 'hanebashi', 'jujutsu', 'monooki', 'renkin']) await p.click(`#customGrid [data-c="${c}"]`);
      await waitV(p, 'v.opts.pick.length === 10');
      await p.click('#hanebashiSeg button[data-v="0"]');   // 跳ね橋は毎回きく（パネルを確かめる）
      await p.click('#startBtn');
      if (big) {
        await p.waitForSelector('#awaken.on', { timeout: 5000 }).catch(() => fail('awakening did not start (land)'));
        await p.evaluate(() => document.getAnimations().forEach(a => { a.pause(); a.currentTime = 4300; })); await sleep(150);
        await p.screenshot({ path: SS + 'land_awaken.png' }); await p.evaluate(() => document.getAnimations().forEach(a => a.play()));
        await p.click('#awaken'); ok(`[${tag}] 覚醒 cinematic plays over the landscape board`);
      }
      await waitV(p, 'v.phase === "game" && v.g.wait === 0', 40000);
      if (!(await isLand(p))) fail(`[${tag}] landscape board not used`); else ok(`[${tag}] landscape board active (--s ${await p.evaluate(() => getComputedStyle(document.body).getPropertyValue('--s'))})`);
      await sleep(300); await landCheck(p, 'land-start-' + tag); await p.screenshot({ path: SS + `land_${tag}_start.png` });
      if (big) {   // 回転：縦にすると縦の画面＋「横向きがおすすめ」、横に戻すと盤
        await p.setViewportSize({ width: 390, height: 844 }); await sleep(300);
        const pr = await p.evaluate(() => ({ land: document.body.classList.contains('land'), hint: document.getElementById('rotHint').classList.contains('on') }));
        await layout(p, 'rotated-portrait'); await p.screenshot({ path: SS + 'land_rotated_portrait.png' });
        if (pr.land || !pr.hint) fail('rotate to portrait: ' + JSON.stringify(pr)); else ok('rotate to portrait → portrait layout + 「横向きがおすすめ」 hint');
        await p.setViewportSize({ width: w, height: h }); await sleep(300);
        if (!(await isLand(p))) fail('rotate back to landscape'); else ok('rotate back → landscape board');
      }
      const kinds = await humanTurns(p, 'land' + tag, 5, 'land_' + tag);
      if (!kinds.swipeTreasure) fail(`[${tag}] no swipe-to-play happened`); else ok(`[${tag}] swipe up to play: treasures ×${kinds.swipeTreasure}${kinds.swipeAction ? ', actions ×' + kinds.swipeAction : ''}`);
      await landCheck(p, 'land-mid-' + tag); await p.screenshot({ path: SS + `land_${tag}_mid.png` });
      // ログ・相手の状態・追放置き場・メニュー（ひろばへ）
      // 相手の攻撃（🔮呪術師など）で自分への質問が出ていたら先に答える
      for (let k = 0; k < 6; k++) { const busy = await p.evaluate(() => { const g = window.__ll.view.g; if (g && g.need && g.need.p === g.me && ['yn', 'hand', 'pick', 'supply'].includes(g.need.k)) { window.__ll.act(autoAnswer(g)); return true; } return false; }); if (!busy) break; await sleep(300); }
      await p.click('#logBtnL'); await sleep(120);
      if (!(await p.isVisible('#log'))) fail(`[${tag}] log not reachable`); else { await p.screenshot({ path: SS + `land_${tag}_log.png` }); ok(`[${tag}] 📜 log opens`); }
      await p.click('#logToggle');
      await p.click('#oppBar .op'); await sleep(120);
      if (!(await p.isVisible('#choiceSheet'))) fail(`[${tag}] opponent sheet`); else { await landCheck(p, 'land-player-' + tag); await p.click('#choiceBox [data-b="closeCard"]'); }
      await p.click('#trashBtn'); await sleep(120);
      if (!(await p.isVisible('#choiceSheet'))) fail(`[${tag}] trash sheet`); else await p.click('#choiceBox [data-b="closeCard"]');
      await p.click('#menuBtn'); const hub = await p.isVisible('#menuHiroba'); await p.click('#menuClose');
      if (!hub) fail(`[${tag}] ひろばへ not in menu`); else ok(`[${tag}] opponent sheet / trash / ⋯ menu (ひろばへ) reachable`);
      // 選択パネル（攻撃・跳ね橋・物見やぐら・謁見の間・物置）
      const want = { 'hand:jikeidan': 1, 'yn:hanebashi': 1, monomi: 1, 'hand:ekken': 1, 'hand:monooki': 1 };
      await p.evaluate(h => { window.__ll.autoplay = true; window.__ll.buyAny = true; window.__ll.buyList = ['oukan', 'gold', 'monomi', 'ekken', 'hanebashi', 'monooki', 'jikeidan', 'renkin', 'silver']; window.__ll.hold = h; }, Object.keys(want));
      const got = []; const t0 = Date.now();
      while (Date.now() - t0 < (big ? 240000 : 150000)) {
        const v = await view(p); if (v.phase === 'end') break;
        const g = v.g, n = g && g.need;
        if (n && n.p === g.me && !g.wait) {
          const key = n.k === 'monomi' ? 'monomi' : n.k + ':' + (n.why || '');
          if (want[key]) {
            await sleep(300); await landCheck(p, `land-panel-${key}-${tag}`); await p.screenshot({ path: SS + `land_${tag}_panel_${key.replace(':', '_')}.png` }); got.push(key); delete want[key];
            if (key.startsWith('hand:')) {   // 実際にカードをタップして選んで決定
              for (let i = 0, s2 = 0; i < g.hand.length && s2 < Math.max(1, n.min); i++) { const c = g.hand[i]; if (n.filter === 'action' && !['shukuba', 'bazaar', 'shanikusai', 'jikeidan', 'monomi', 'ekken', 'hanebashi', 'jujutsu', 'monooki', 'renkin'].includes(c)) continue; await tapCard(p, i); s2++; await sleep(120); }
              await p.click('#prompt [data-b="handOk"]').catch(() => {});
            } else if (key === 'monomi') { await p.click('#choiceBox [data-sf="0:trash"]').catch(() => {}); await sleep(80); await p.click('#choiceBox [data-b="monomiOk"]').catch(() => {}); }
            else if (key === 'yn:hanebashi') { await p.click('#choiceBox [data-b="yes"]').catch(() => {}); }
            await sleep(250);
            await p.evaluate(k => { window.__ll.hold = window.__ll.hold.filter(x => x !== k); }, key);
          }
        }
        await sleep(150);
      }
      ok(`[${tag}] panels in landscape: ${got.join(', ') || '(none)'}${Object.keys(want).length ? '（not seen: ' + Object.keys(want).join(', ') + '）' : ''}`);
      if (!got.length) fail(`[${tag}] no choice panel reached`);
      await p.evaluate(() => { window.__ll.hold = []; });
      const v = await playToEnd(p, 300000, async () => { await landCheck(p, 'land-auto-' + tag); });
      if (v.phase !== 'end') fail(`[${tag}] landscape game did not finish`);
      else { ok(`[${tag}] landscape solo game finished: ★${v.g.result.scores.join(' / ')} (${v.g.result.why})`); await sleep(400); await layout(p, 'land-result-' + tag); await p.screenshot({ path: SS + `land_${tag}_result.png` }); }
      await p.context().close();
    }
  }

  // ================= 3) オンライン：ホスト＋参加者（攻撃カードあり・跳ね橋は毎回きく） =================
  if (!ONLY || ONLY === 'net') {
    const host = await phone('host'), guest = await phone('guest', 844, 390);   // 参加者は横向きのスマホ
    await host.goto(NET); await host.fill('#nameIn', 'りょう'); await host.tap('#createBtn');
    await host.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.getElementById('codeBig').textContent), null, { timeout: 30000 }).catch(() => {});
    const code = await host.textContent('#codeBig');
    if (!/^[A-Z0-9]{4}$/.test(code)) fail('room could not be created (signaling blocked?)');
    else {
      ok('room created ' + code + ' (PeerJS cloud signaling)');
      if (!(await host.$('#qr svg'))) fail('QR code missing'); else ok('invite QR code shown');
      await guest.goto(NET + '&room=' + code); await guest.fill('#nameIn', 'たろう'); await guest.tap('#joinInvitedBtn');
      await waitV(host, 'v.seats.length === 2 && v.seats[1].connected', 40000).then(() => ok('guest joined via invite link (WebRTC)'), () => fail('guest could not connect'));
      await host.evaluate(() => { const o = window.__ll.hostRoom().opts; o.kmode = 'custom'; o.pick = ['jikeidan', 'jujutsu', 'yatou', 'chozei', 'hanebashi', 'monomi', 'shahon', 'ekken', 'monooki', 'kosho']; o.autoHanebashi = false; o.np = 2; window.__ll.refresh(); });
      await waitV(guest, "v.phase === 'lobby' && v.opts.kmode === 'custom' && v.opts.pick.length === 10");
      await guest.screenshot({ path: SS + 'online_guest_lobby.png' });
      await host.tap('#startBtn');
      await waitV(guest, 'v.phase === "game" && v.g.wait === 0', 20000);
      ok('online game started: ' + (await view(guest)).g.kingdom.join(','));
      const BUY = ['oukan', 'gold', 'jikeidan', 'yatou', 'chozei', 'silver'];
      await host.evaluate(b => { window.__ll.autoplay = true; window.__ll.buyList = b; }, BUY);
      await guest.evaluate(b => { window.__ll.autoplay = true; window.__ll.buyList = b; window.__ll.buyAny = true; window.__ll.hold = ['hand:jikeidan', 'yn:hanebashi', 'hand:chozei', 'pick:yatou']; }, ['oukan', 'hakuryo', 'gold', 'hanebashi', 'silver']);
      const want = { 'hand:jikeidan': 'online_guest_jikeidan.png', 'yn:hanebashi': 'online_guest_hanebashi.png', 'hand:chozei': 'online_guest_chozei.png', 'pick:yatou': 'online_guest_yatou.png' };
      const got = []; let leaks = 0, checks = 0, rejoined = false; const t0 = Date.now();
      while (Date.now() - t0 < 300000) {
        const gv = await view(guest); if (!gv) { await sleep(300); continue; }
        if (gv.phase === 'end') break;
        if (gv.phase === 'game' && gv.g) {
          // 情報もれチェック：参加者の画面データに ほかの人の手札・山札の中身が入っていない
          const S = await host.evaluate(() => { const S = window.__ll.hostRoom().G.S; return { hand0: S.P[0].hand, deck0: S.P[0].deck, deck1: S.P[1].deck }; });
          const g = gv.g; checks++;
          if (g.P.some(P => 'hand' in P || 'deck' in P || 'disc' in P)) leaks++;
          if (g.need && g.need.p !== g.me && g.need.cards && !['kanja', 'kaitou', 'kaitouGain'].includes(g.need.why)) leaks++;
          if (g.need && g.need.p !== g.me && g.need.why === 'hanebashi') leaks++;
          if (g.ev.some(e => e.mine && e.p !== g.me)) leaks++;
          if (JSON.stringify(g.hand) !== JSON.stringify((await host.evaluate(() => window.__ll.hostRoom().G.S.P[1].hand)))) { /* 1フレームずれは許す */ }
          const n = g.need;
          if (n && n.p === g.me) {
            const key = n.k + ':' + (n.why || '');
            if (want[key]) {
              await sleep(350); await landCheck(guest, 'guest-' + key); await guest.screenshot({ path: SS + want[key] }); got.push(key); delete want[key];
              if (key === 'yn:hanebashi') { await guest.tap('#choiceBox [data-b="yes"]').catch(() => {}); await guest.evaluate(() => { window.__ll.noHanebashi = true; }); }   // 以後は見せずに攻撃を受けて、ほかのパネルも確かめる
              else if (key.startsWith('hand:')) {   // 実際にタップして選ぶ
                for (let i = 0, s = 0; i < g.hand.length && s < n.min; i++) { if (!n.filter || (n.filter === 'victory' && ['shoryo', 'hakuryo', 'oukan'].includes(g.hand[i]))) { await tapCard(guest, i); s++; await sleep(120); } }
                await guest.tap('#prompt [data-b="handOk"]').catch(() => {});
              } else if (key === 'pick:yatou') { await guest.tap('#choiceBox .pickCards .cd.can').catch(() => {}); await sleep(60); await guest.tap('#choiceBox [data-b="pickOk"]').catch(() => {}); }
              await sleep(200);
              await guest.evaluate(k => { window.__ll.hold = window.__ll.hold.filter(x => x !== k); }, key);
            }
          }
          if (!rejoined && g.P[0].turns >= 6) {   // 参加者がリロード → 同じ席に戻る
            rejoined = true; const me = g.me;
            await guest.reload(); await sleep(500);
            if (!(await guest.isVisible('#rejoinBtn'))) fail('rejoin button missing');
            else {
              await guest.tap('#rejoinBtn');
              await waitV(guest, 'v.phase === "game" && v.g && v.g.me === ' + me, 30000).then(() => ok('guest reload → 「部屋に戻る」 back in the same seat'), () => fail('rejoin failed'));
              await guest.evaluate(b => { window.__ll.autoplay = true; window.__ll.buyList = b; window.__ll.hold = []; }, ['oukan', 'hakuryo', 'gold', 'hanebashi', 'silver']);
              await guest.evaluate(h => { window.__ll.hold = h; window.__ll.noHanebashi = true; }, Object.keys(want));
            }
          }
        }
        await sleep(200);
      }
      ok('guest panels captured: ' + got.join(', ') + (Object.keys(want).length ? '（not seen: ' + Object.keys(want).join(', ') + '）' : ''));
      if (leaks) fail('hidden info leaked to guest in ' + leaks + '/' + checks + ' snapshots'); else ok(`no hidden info in guest views (${checks} snapshots: other hands/decks, others' prompts, private events)`);
      await guest.evaluate(() => { window.__ll.hold = []; });
      const gv = await playToEnd(guest, 200000);
      if (gv.phase !== 'end') fail('online game did not finish'); else {
        ok(`online 2-player game finished: ★${gv.g.result.scores.join(' / ')} (${gv.g.result.why})`);
        await sleep(300); await guest.screenshot({ path: SS + 'online_guest_result.png' }); await host.screenshot({ path: SS + 'online_host_result.png' });
        const ev = await host.evaluate(() => window.__ll.hostRoom().G.S.log.length);
        ok('host decision log length ' + ev);
        const st = await host.evaluate(() => { const S = window.__ll.hostRoom().G.S, c = {}; S.ev.forEach(e => { const k = e.k + (e.c ? ':' + e.c : '') + (e.why ? '/' + e.why : ''); if (/play|hanebashi|discard|topdeck|revealHand|reveal/.test(e.k)) c[k] = (c[k] || 0) + 1; }); return c; });
        ok('attack-related events (last 300): ' + JSON.stringify(st));
      }
      await host.screenshot({ path: SS + 'online_host.png' });
    }
    await host.context().close(); await guest.context().close();
  }
  await browser.close();
  console.log(errors.length ? `\nE2E: ${errors.length} problem(s)` : '\nE2E: all good');
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
