/* 王国争覇：ルールエンジン（ブラウザ・Node 共通、依存なし）
 * ゲーム全体を1つのジェネレーター（コルーチン）として書き、プレイヤーの判断が必要なところで need を yield します。
 * 乱数は状態に入れた mulberry32 なので、seed と判断の列があれば完全に再現できます（ホストの再開にも使用）。
 */
(function (root) {
  'use strict';
  var C = (typeof module !== 'undefined' && module.exports) ? require('./cards.js') : root.KS_CARDS;
  var D = C.D;
  function isA(c, t) { return !!D[c] && D[c].t.indexOf(t) >= 0; }
  function cost(c) { return D[c].cost; }
  function price(S, c) { return Math.max(0, cost(c) - (S.discount || 0)); }
  function matches(c, f) { return !f || c === f || isA(c, f); }
  // ---- 乱数（状態に保存できる） ----
  function rngOf(S) { return function () { var t = S.rs = (S.rs + 0x6D2B79F5) | 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function mulberry(a) { var s = { rs: a | 0 }; return rngOf(s); }
  function shuffle(a, rnd) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  // ---- おすすめの王国（公式ルールブックの推奨セットと同じ10種。セット名はこちらで付けた日本語） ----
  var SETS = [
    { id: 'first', n: 'はじめての王国', ed: 2, k: ['monooki', 'bazaar', 'ginzaiku', 'jikeidan', 'kinmyaku', 'hanebashi', 'tatenaoshi', 'tetsuuchi', 'shukuba', 'daikugoya'] },
    { id: 'size', n: 'ちぐはぐな大きさ', ed: 2, k: ['meikou', 'yatou', 'chozei', 'zange', 'shanikusai', 'yakusou', 'monomi', 'ekken', 'jujutsu', 'daikugoya'] },
    { id: 'decktop', n: '山札のてっぺん', ed: 2, k: ['meikou', 'chozei', 'entaku', 'shanikusai', 'hayauma', 'renkin', 'ryogae', 'monomi', 'kosho', 'shukuba'] },
    { id: 'sleight', n: '手さばき', ed: 2, k: ['monooki', 'entaku', 'shanikusai', 'yakusou', 'hayauma', 'shahon', 'jikeidan', 'wanashi', 'tetsuuchi', 'ekken'] },
    { id: 'improve', n: '改良の日々', ed: 2, k: ['meikou', 'monooki', 'bazaar', 'ginzaiku', 'kinmyaku', 'hanebashi', 'ryogae', 'wanashi', 'tatenaoshi', 'jujutsu'] },
    { id: 'silvergold', n: '銀と金', ed: 2, k: ['yatou', 'chozei', 'zange', 'hayauma', 'renkin', 'ginzaiku', 'kinmyaku', 'ryogae', 'ekken', 'kosho'] }
  ];
  function pool() { return C.K2.slice(); }
  function randomKingdom(rnd, ed1, fixed) {
    var out = (fixed || []).slice(0, 10), rest = shuffle(pool(ed1).filter(function (k) { return out.indexOf(k) < 0; }), rnd);
    while (out.length < 10) out.push(rest.shift());
    return sortK(out);
  }
  function sortK(k) { return k.slice().sort(function (a, b) { return cost(a) - cost(b) || C.ORDER.indexOf(a) - C.ORDER.indexOf(b); }); }

  // ---- 準備（第2版ルールブック 3ページ） ----
  function supplyCounts(np, kingdom) {
    var v = np === 2 ? 8 : 12, s = { copper: 60 - 7 * np, silver: 40, gold: 30, shoryo: v, hakuryo: v, oukan: v, curse: 10 * (np - 1) };
    kingdom.forEach(function (k) { s[k] = isA(k, 'victory') ? v : 10; });
    return s;
  }
  function newGame(o) {
    var np = o.np | 0; if (np < 2 || np > 4) throw new Error('人数は2〜4人です');
    var kingdom = sortK(o.kingdom);
    if (kingdom.length !== 10 || kingdom.some(function (k) { return !D[k] || !(D[k].ed > 0); }) || new Set(kingdom).size !== 10) throw new Error('王国カードは異なる10種類');
    var S = { np: np, kingdom: kingdom, supply: supplyCounts(np, kingdom), trash: [], P: [], turn: 0, turnNo: 0, phase: 'start', actions: 0, buys: 0, coins: 0, merch: 0, silver: false, bought: false,
      need: null, ev: [], evId: 0, seq: 0, over: false, result: null, rs: (o.seed == null ? 12345 : o.seed) | 0, seed: o.seed | 0, err: null, log: o.noLog ? null : [] };
    var rnd = rngOf(S);
    for (var p = 0; p < np; p++) {
      var deck = shuffle(['copper', 'copper', 'copper', 'copper', 'copper', 'copper', 'copper', 'shoryo', 'shoryo', 'shoryo'], rnd);
      S.P.push({ deck: deck, hand: [], disc: [], play: [], aside: [], turns: 0 });
    }
    S.P.forEach(function (P) { P.hand = P.deck.splice(0, 5); });
    S.turn = o.start != null ? o.start : Math.floor(rnd() * np);
    S.first = S.turn;
    if (o.setup) o.setup(S);   // テスト用：手札・山札などを指定する
    S.gen = gameLoop(S);
    step(S, undefined);
    return S;
  }
  function rnd(S) { return rngOf(S)(); }
  function ev(S, o) { o.id = ++S.evId; S.ev.push(o); if (S.ev.length > 400) S.ev.splice(0, S.ev.length - 300); return o; }
  function step(S, a) { var r = S.gen.next(a); S.need = r.done ? null : r.value; }
  function act(S, p, a) {
    if (S.over) return 'ゲームは終わっています';
    var nd = S.need; if (!nd) return '進行中ではありません';
    if (nd.p !== p) return 'あなたの番ではありません';
    S.err = null;
    step(S, a || {});
    if (S.err) return S.err;
    if (S.log) S.log.push([p, a]);
    return null;
  }
  // ---- カードの移動 ----
  function drawOne(S, p) {
    var P = S.P[p];
    if (!P.deck.length) { if (!P.disc.length) return null; P.deck = shuffle(P.disc, rngOf(S)); P.disc = []; ev(S, { k: 'shuffle', p: p }); }
    return P.deck.shift();
  }
  function draw(S, p, n, why) {
    var got = [];
    for (var i = 0; i < n; i++) { var c = drawOne(S, p); if (c == null) break; S.P[p].hand.push(c); got.push(c); }
    if (n > 0) ev(S, { k: 'draw', p: p, n: got.length, why: why, mine: { cards: got } });
    return got;
  }
  // 山札の上から n 枚を取り出す（必要ならシャッフル）。取り出したカードはどこにも属さないので呼び出し側で置く
  function takeTop(S, p, n) { var out = []; for (var i = 0; i < n; i++) { var c = drawOne(S, p); if (c == null) break; out.push(c); } return out; }
  function gain(S, p, c, dest, why) {
    if (!S.supply[c]) return false;
    S.supply[c]--;
    var P = S.P[p];
    if (dest === 'hand') P.hand.push(c); else if (dest === 'deck') P.deck.unshift(c); else P.disc.push(c);
    ev(S, { k: 'gain', p: p, c: c, dest: dest || 'disc', why: why });
    return true;
  }
  function takeIdx(arr, idx) { var s = idx.slice().sort(function (a, b) { return b - a; }), out = []; s.forEach(function (i) { out.push(arr.splice(i, 1)[0]); }); return out.reverse(); }
  function trashCards(S, p, cards, why) { cards.forEach(function (c) { S.trash.push(c); }); if (cards.length) ev(S, { k: 'trash', p: p, cards: cards.slice(), why: why }); }
  function discardCards(S, p, cards, why) {
    if (!cards.length) return;
    cards.forEach(function (c) { S.P[p].disc.push(c); });
    ev(S, { k: 'discard', p: p, n: cards.length, top: cards[cards.length - 1], why: why, mine: { cards: cards.slice() } });   // 捨て札は一番上だけ公開
  }
  function emptyPiles(S) { var n = 0; for (var k in S.supply) if (S.supply[k] === 0) n++; return n; }
  function plus(S, p, o, why) {
    if (!o) return;
    if (o.c) draw(S, p, o.c, why);
    if (o.a) S.actions += o.a;
    if (o.b) S.buys += o.b;
    if (o.m) S.coins += o.m;
  }

  // ---- 判断の要求（need）と検証 ----
  function* ask(S, nd) {
    nd.id = ++S.seq;
    while (true) {
      var a = yield nd, r = check(S, nd, a || {});
      if (typeof r === 'string') { S.err = r; continue; }
      return r;
    }
  }
  function uniqIdx(sel, n) { if (!Array.isArray(sel)) return null; var s = sel.map(Number); if (s.some(function (i) { return !(i >= 0 && i < n && Math.floor(i) === i); })) return null; if (new Set(s).size !== s.length) return null; return s; }
  function check(S, nd, a) {
    var P = S.P[nd.p];
    switch (nd.k) {
      case 'action':
        if (a.a === 'end') return { a: 'end' };
        if (a.a === 'play') { var i = +a.i; if (!(i >= 0 && i < P.hand.length) || !isA(P.hand[i], 'action')) return 'そのカードは使えません'; if (S.actions < 1) return 'アクションが残っていません'; return { a: 'play', i: i }; }
        return '不明な操作です';
      case 'buy':
        if (a.a === 'end') return { a: 'end' };
        if (a.a === 'all') return S.bought ? '購入のあとは貨幣を出せません' : { a: 'all' };
        if (a.a === 'treasure') { var j = +a.i; if (S.bought) return '購入のあとは貨幣を出せません'; if (!(j >= 0 && j < P.hand.length) || !isA(P.hand[j], 'treasure')) return 'そのカードは出せません'; return { a: 'treasure', i: j }; }
        if (a.a === 'buy') {
          var c = String(a.c); if (!(c in S.supply)) return 'そのカードは買えません';
          if (!S.supply[c]) return 'その山はもうありません';
          var coins = S.coins + (a.auto && !S.bought ? handCoins(S, nd.p) : 0);
          if (coins < price(S, c)) return 'お金が足りません';
          if (S.buys < 1) return '購入が残っていません';
          return { a: 'buy', c: c, auto: !!a.auto && !S.bought };
        }
        return '不明な操作です';
      case 'hand': {
        var s = uniqIdx(a.sel, P.hand.length); if (!s) return '選び方が正しくありません';
        if (s.length < nd.min || s.length > nd.max) return nd.min === nd.max ? nd.min + '枚選んでください' : (nd.min ? nd.min + '〜' : '') + nd.max + '枚まで選べます';
        if (s.some(function (i) { return !matches(P.hand[i], nd.filter); })) return 'そのカードは選べません';
        return { sel: s };
      }
      case 'supply': {
        if (a.c == null || a.c === '') { if (nd.optional || !gainOptions(S, nd.max, nd.filter).length) return { c: null }; return 'カードを選んでください'; }
        var g = String(a.c); if (gainOptions(S, nd.max, nd.filter).indexOf(g) < 0) return 'そのカードはもらえません';
        return { c: g };
      }
      case 'yn': return { y: !!a.y };
      case 'pick': {
        var t = uniqIdx(a.sel, nd.cards.length); if (!t) return '選び方が正しくありません';
        if (t.length < nd.min || t.length > nd.max) return nd.min === nd.max ? nd.min + '枚選んでください' : nd.max + '枚まで選べます';
        if (t.some(function (i) { return !matches(nd.cards[i], nd.filter); })) return 'そのカードは選べません';
        return { sel: t };
      }
      case 'monomi': {
        var f = Array.isArray(a.fate) ? a.fate : []; if (f.length !== nd.cards.length || f.some(function (x) { return ['trash', 'discard', 'keep'].indexOf(x) < 0; })) return '各カードの行き先を選んでください';
        var keep = []; f.forEach(function (x, i) { if (x === 'keep') keep.push(i); });
        var ord = Array.isArray(a.order) ? a.order.map(Number) : keep;
        if (ord.length !== keep.length || ord.some(function (i) { return keep.indexOf(i) < 0; }) || new Set(ord).size !== ord.length) ord = keep;
        return { fate: f.slice(), order: ord };
      }
    }
    return '不明な操作です';
  }
  function handCoins(S, p) { return S.P[p].hand.reduce(function (s, c) { return s + (isA(c, 'treasure') ? D[c].coin + (c === 'silver' ? 0 : 0) : 0); }, 0) + (!S.silver && S.P[p].hand.indexOf('silver') >= 0 ? S.merch : 0); }
  function gainOptions(S, max, filter) { var o = []; for (var k in S.supply) if (S.supply[k] > 0 && cost(k) <= max && matches(k, filter)) o.push(k); return o; }
  // 手札から選ぶ（選択肢が1通りしかないときは聞かない）
  function* pickHand(S, p, o) {
    var P = S.P[p], idx = []; P.hand.forEach(function (c, i) { if (matches(c, o.filter)) idx.push(i); });
    var max = Math.min(o.max, idx.length), min = Math.min(o.min || 0, max);
    if (max === 0) return [];
    if (min === max) { var kinds = new Set(idx.map(function (i) { return P.hand[i]; })); if (max === idx.length || kinds.size === 1) return idx.slice(0, max); }
    var r = yield* ask(S, { p: p, k: 'hand', min: min, max: max, filter: o.filter || null, why: o.why, src: o.src, by: o.by });
    return r.sel;
  }
  function* gainUpTo(S, p, max, filter, dest, why) {
    var opts = gainOptions(S, max, filter);
    if (!opts.length) { ev(S, { k: 'nogain', p: p, why: why }); return null; }
    var r = opts.length === 1 ? { c: opts[0] } : yield* ask(S, { p: p, k: 'supply', max: max, filter: filter || null, dest: dest || 'disc', why: why });
    if (r.c) gain(S, p, r.c, dest, why);
    return r.c;
  }
  function others(S, p) { var o = []; for (var i = 1; i < S.np; i++) o.push((p + i) % S.np); return o; }
  // 攻撃：効果の前に、ほかの人は手番順に跳ね橋を見せられる
  function* hanebashiCheck(S, p, c) {
    var prot = {};
    for (var q of others(S, p)) {
      if (S.P[q].hand.indexOf('hanebashi') < 0) continue;
      var r = yield* ask(S, { p: q, k: 'yn', why: 'hanebashi', src: c, by: p });
      if (r.y) { prot[q] = true; ev(S, { k: 'hanebashi', p: q, by: p, src: c }); }
    }
    return prot;
  }

  // ---- カードの効果 ----
  var FX = {
    monooki: function* (S, p) {
      var sel = yield* pickHand(S, p, { min: 0, max: S.P[p].hand.length, why: 'monooki' });
      discardCards(S, p, takeIdx(S.P[p].hand, sel), 'monooki');
      draw(S, p, sel.length, 'monooki');
    },
    zange: function* (S, p) { var sel = yield* pickHand(S, p, { min: 0, max: 4, why: 'zange' }); trashCards(S, p, takeIdx(S.P[p].hand, sel), 'zange'); },
    hanebashi: function* () {},
    hayauma: function* (S, p) {
      var P = S.P[p]; if (!P.disc.length) return;
      var r = yield* ask(S, { p: p, k: 'pick', cards: P.disc.slice(), min: 0, max: 1, why: 'hayauma' });
      if (r.sel.length) { var c = P.disc.splice(r.sel[0], 1)[0]; P.deck.unshift(c); ev(S, { k: 'topdeck', p: p, n: 1, why: 'hayauma', mine: { cards: [c] } }); }
    },
    ginzaiku: function* (S) { S.merch++; },
    kosho: function* (S, p) {
      var P = S.P[p], t = takeTop(S, p, 1); if (!t.length) return;
      var c = t[0]; P.disc.push(c); ev(S, { k: 'kosho', p: p, c: c });
      if (!isA(c, 'action')) return;
      var r = yield* ask(S, { p: p, k: 'yn', why: 'kosho', c: c });
      if (!r.y || P.disc[P.disc.length - 1] !== c) return;
      P.disc.pop(); P.play.push(c); ev(S, { k: 'play', p: p, c: c, via: 'kosho' });
      yield* playCard(S, p, c, {});
    },
    shukuba: function* (S, p) {
      var t = takeTop(S, p, 1); if (!t.length) return;
      var c = t[0]; ev(S, { k: 'reveal', p: p, cards: [c], why: 'shukuba' });
      if (isA(c, 'action')) { S.P[p].hand.push(c); ev(S, { k: 'draw', p: p, n: 1, why: 'shukuba', mine: { cards: [c] } }); }
      else { S.P[p].disc.push(c); ev(S, { k: 'discard', p: p, n: 1, top: c, open: [c], why: 'shukuba' }); }
    },
    daikugoya: function* (S, p) { yield* gainUpTo(S, p, 4, null, 'disc', 'daikugoya'); },
    chozei: function* (S, p, inst, prot) {
      gain(S, p, 'silver', 'deck', 'chozei');
      for (var q of others(S, p)) {
        if (prot[q]) continue;
        var P = S.P[q];
        if (!P.hand.some(function (c) { return isA(c, 'victory'); })) { ev(S, { k: 'revealHand', p: q, cards: P.hand.slice(), why: 'chozei' }); continue; }
        var sel = yield* pickHand(S, q, { min: 1, max: 1, filter: 'victory', why: 'chozei', by: p });
        var c = P.hand.splice(sel[0], 1)[0]; P.deck.unshift(c); ev(S, { k: 'topdeck', p: q, n: 1, c: c, why: 'chozei' });
      }
    },
    jikeidan: function* (S, p, inst, prot) {
      for (var q of others(S, p)) {
        if (prot[q]) continue;
        if (!S.P[q].hand.some(function (c) { return isA(c, 'treasure'); })) { ev(S, { k: 'show', p: q, cards: S.P[q].hand.slice(), why: 'jikeidan' }); continue; }
        var sel = yield* pickHand(S, q, { min: 1, max: 1, filter: 'treasure', why: 'jikeidan', by: p });
        discardCards(S, q, takeIdx(S.P[q].hand, sel), 'jikeidan');
      }
    },
    ryogae: function* (S, p) {
      var sel = yield* pickHand(S, p, { min: 0, max: 1, filter: 'treasure', why: 'ryogae' });
      if (sel.length) { var c = takeIdx(S.P[p].hand, sel)[0]; trashCards(S, p, [c], 'ryogae'); S.coins += cost(c) + 2; }
    },
    wanashi: function* (S, p) {
      var n = Math.min(emptyPiles(S), S.P[p].hand.length); if (!n) return;
      var sel = yield* pickHand(S, p, { min: n, max: n, why: 'wanashi' });
      discardCards(S, p, takeIdx(S.P[p].hand, sel), 'wanashi');
    },
    tatenaoshi: function* (S, p) {
      if (!S.P[p].hand.length) return;
      var sel = yield* pickHand(S, p, { min: 1, max: 1, why: 'tatenaoshi' });
      var c = takeIdx(S.P[p].hand, sel)[0]; trashCards(S, p, [c], 'tatenaoshi');
      yield* gainUpTo(S, p, cost(c) + 2, null, 'disc', 'tatenaoshi');
    },
    tetsuuchi: function* (S, p) {
      var sel = yield* pickHand(S, p, { min: 0, max: 1, filter: 'copper', why: 'tetsuuchi', ask: true });
      if (!sel.length) return;
      discardCards(S, p, takeIdx(S.P[p].hand, sel), 'tetsuuchi'); draw(S, p, 1, 'tetsuuchi');
    },
    ekken: function* (S, p) {
      var sel = yield* pickHand(S, p, { min: 0, max: 1, filter: 'action', why: 'ekken' });
      if (!sel.length) return;
      var c = takeIdx(S.P[p].hand, sel)[0]; S.P[p].play.push(c);
      ev(S, { k: 'play', p: p, c: c, via: 'ekken', n: 1 });
      yield* playCard(S, p, c, {});
      var P = S.P[p], i = P.play.lastIndexOf(c); if (i < 0) return;
      var r = yield* ask(S, { p: p, k: 'yn', why: 'ekkenBack', c: c });
      if (r.y && P.play.lastIndexOf(c) >= 0) { P.play.splice(P.play.lastIndexOf(c), 1); P.deck.unshift(c); ev(S, { k: 'topdeck', p: p, n: 1, c: c, why: 'ekken' }); }
    },
    yatou: function* (S, p, inst, prot) {
      gain(S, p, 'gold', 'disc', 'yatou');
      for (var q of others(S, p)) {
        if (prot[q]) continue;
        var cards = takeTop(S, q, 2); if (!cards.length) { ev(S, { k: 'reveal', p: q, cards: [], why: 'yatou' }); continue; }
        ev(S, { k: 'reveal', p: q, cards: cards.slice(), why: 'yatou' });
        var cand = []; cards.forEach(function (c, i) { if (isA(c, 'treasure') && c !== 'copper') cand.push(i); });
        var ti = -1;
        if (cand.length === 1 || (cand.length === 2 && cards[cand[0]] === cards[cand[1]])) ti = cand[0];
        else if (cand.length === 2) { var r = yield* ask(S, { p: q, k: 'pick', cards: cards.slice(), min: 1, max: 1, filter: null, only: cand, why: 'yatou', by: p }); ti = cand.indexOf(r.sel[0]) >= 0 ? r.sel[0] : cand[0]; }
        var rest = cards.filter(function (c, i) { return i !== ti; });
        if (ti >= 0) trashCards(S, q, [cards[ti]], 'yatou');
        rest.forEach(function (c) { S.P[q].disc.push(c); });
        if (rest.length) ev(S, { k: 'discard', p: q, n: rest.length, top: rest[rest.length - 1], open: rest.slice(), why: 'yatou' });
      }
    },
    entaku: function* (S, p) {
      for (var q of others(S, p)) {
        if (!S.P[q].hand.length) continue;
        var sel = yield* pickHand(S, q, { min: 1, max: 1, why: 'entaku', by: p });
        ev(S, { k: 'show', p: q, cards: [S.P[q].hand[sel[0]]], why: 'entaku' });
      }
    },
    shanikusai: function* (S) { S.discount = (S.discount || 0) + 1; },
    renkin: function* (S, p) {
      var sel = yield* pickHand(S, p, { min: 0, max: 1, why: 'renkin' });
      if (sel.length) { trashCards(S, p, takeIdx(S.P[p].hand, sel), 'renkin'); S.coins += 2; }
    },
    shahon: function* (S, p) {
      var P = S.P[p], aside = [];
      while (P.hand.length < 7) {
        var t = takeTop(S, p, 1); if (!t.length) break;
        var c = t[0];
        if (isA(c, 'action')) {
          var r = yield* ask(S, { p: p, k: 'yn', why: 'shahon', c: c });
          if (r.y) { aside.push(c); P.aside.push(c); ev(S, { k: 'aside', p: p, c: c }); continue; }
        }
        P.hand.push(c); ev(S, { k: 'draw', p: p, n: 1, why: 'shahon', mine: { cards: [c] } });
      }
      if (aside.length) { aside.forEach(function (c) { P.aside.splice(P.aside.indexOf(c), 1); P.disc.push(c); }); ev(S, { k: 'discard', p: p, n: aside.length, top: aside[aside.length - 1], open: aside.slice(), why: 'shahon' }); }
    },
    bazaar: function* (S, p) {
      var opts = gainOptions(S, 2, null); if (!opts.length) return;
      var r = yield* ask(S, { p: p, k: 'supply', max: 2, filter: null, dest: 'disc', why: 'bazaar', optional: true });
      if (r.c) gain(S, p, r.c, 'disc', 'bazaar');
    },
    kinmyaku: function* (S, p) {
      var sel = yield* pickHand(S, p, { min: 0, max: 1, filter: 'treasure', why: 'kinmyaku' });
      if (!sel.length) return;
      var c = takeIdx(S.P[p].hand, sel)[0]; trashCards(S, p, [c], 'kinmyaku');
      yield* gainUpTo(S, p, cost(c) + 3, 'treasure', 'hand', 'kinmyaku');
    },
    monomi: function* (S, p) {
      var P = S.P[p], cards = takeTop(S, p, 2); if (!cards.length) return;
      var r = yield* ask(S, { p: p, k: 'monomi', cards: cards.slice(), why: 'monomi' });
      var tr = [], di = [];
      r.fate.forEach(function (f, i) { if (f === 'trash') tr.push(cards[i]); else if (f === 'discard') di.push(cards[i]); });
      trashCards(S, p, tr, 'monomi');
      discardCards(S, p, di, 'monomi');
      var back = r.order.map(function (i) { return cards[i]; });
      for (var i = back.length - 1; i >= 0; i--) P.deck.unshift(back[i]);
      ev(S, { k: 'monomiDone', p: p, nt: tr.length, nd: di.length, nk: back.length, mine: { back: back } });
    },
    jujutsu: function* (S, p, inst, prot) {
      for (var q of others(S, p)) {
        if (prot[q]) continue;
        var canCurse = S.supply.curse > 0, canDisc = S.P[q].hand.length > 0;
        if (!canCurse && !canDisc) continue;
        var dis = !canCurse ? true : !canDisc ? false : (yield* ask(S, { p: q, k: 'yn', why: 'jujutsu', by: p })).y;
        if (dis) { var sel = yield* pickHand(S, q, { min: 1, max: 1, why: 'jujutsuDisc', by: p }); discardCards(S, q, takeIdx(S.P[q].hand, sel), 'jujutsu'); }
        else gain(S, q, 'curse', 'disc', 'jujutsu');
      }
    },
    meikou: function* (S, p) {
      yield* gainUpTo(S, p, 5, null, 'hand', 'meikou');
      if (!S.P[p].hand.length) return;
      var sel = yield* pickHand(S, p, { min: 1, max: 1, why: 'meikou' });
      var c = takeIdx(S.P[p].hand, sel)[0]; S.P[p].deck.unshift(c);
      ev(S, { k: 'topdeck', p: p, n: 1, why: 'meikou', mine: { cards: [c] } });
    },
    yakusou: function* () {}
  };
  function* playCard(S, p, c, inst) {
    var prot = {};
    if (isA(c, 'attack')) prot = yield* hanebashiCheck(S, p, c);
    plus(S, p, D[c].plus, c);
    yield* FX[c](S, p, inst || {}, prot);
  }
  function playTreasure(S, p, i) {
    var P = S.P[p], c = P.hand.splice(i, 1)[0]; P.play.push(c);
    var m = D[c].coin; S.coins += m;
    if (c === 'silver' && !S.silver) { S.silver = true; S.coins += S.merch; m += S.merch; }
    return m;
  }

  // ---- ターンの流れ（A：アクション → B：購入 → C：片付け） ----
  function* gameLoop(S) {
    while (true) {
      var p = S.turn, P = S.P[p];
      P.turns++; S.turnNo++;
      S.phase = 'action'; S.actions = 1; S.buys = 1; S.coins = 0; S.merch = 0; S.discount = 0; S.silver = false; S.bought = false;
      ev(S, { k: 'turn', p: p, n: P.turns });
      while (S.actions > 0 && P.hand.some(function (c) { return isA(c, 'action'); })) {
        var a = yield* ask(S, { p: p, k: 'action' });
        if (a.a === 'end') break;
        var c = P.hand.splice(a.i, 1)[0]; S.actions--; P.play.push(c);
        ev(S, { k: 'play', p: p, c: c });
        yield* playCard(S, p, c, {});
      }
      S.phase = 'buy';
      while (S.buys > 0) {
        var b = yield* ask(S, { p: p, k: 'buy' });
        if (b.a === 'end') break;
        if (b.a === 'treasure') { var tc = P.hand[b.i], m = playTreasure(S, p, b.i); ev(S, { k: 'treasures', p: p, cards: [tc], m: m }); continue; }
        if (b.a === 'all' || b.auto) { var cs = [], mm = 0; for (var i = P.hand.length - 1; i >= 0; i--) if (isA(P.hand[i], 'treasure')) { cs.unshift(P.hand[i]); mm += playTreasure(S, p, i); } if (cs.length) ev(S, { k: 'treasures', p: p, cards: cs, m: mm }); if (b.a === 'all') continue; }
        S.buys--; S.coins -= price(S, b.c); S.bought = true;
        gain(S, p, b.c, 'disc', 'buy');
      }
      // 片付け：手札を捨ててから、場のカードをその上に（手札の中身は見せなくてよい）
      S.phase = 'cleanup';
      P.disc = P.disc.concat(P.hand, P.play); P.hand = []; P.play = [];
      draw(S, p, 5, 'cleanup');
      ev(S, { k: 'endTurn', p: p });
      if (S.supply.oukan === 0 || emptyPiles(S) >= 3) { finish(S); return; }
      S.turn = (p + 1) % S.np;
    }
  }
  // ---- 得点 ----
  function owned(P) { return P.deck.concat(P.hand, P.disc, P.play, P.aside); }
  function counts(list) { var o = {}; list.forEach(function (c) { o[c] = (o[c] || 0) + 1; }); return o; }
  function vpOf(list) {
    var n = list.length, v = 0;
    list.forEach(function (c) { if (c === 'yakusou') v += Math.floor(n / 10); else if (D[c].vp) v += D[c].vp; });
    return v;
  }
  function finish(S) {
    S.phase = 'over'; S.over = true; S.need = null;
    var sc = S.P.map(function (P) { return vpOf(owned(P)); }), best = Math.max.apply(null, sc);
    var tied = sc.map(function (v, i) { return i; }).filter(function (i) { return sc[i] === best; });
    var minT = Math.min.apply(null, tied.map(function (i) { return S.P[i].turns; }));
    var win = tied.filter(function (i) { return S.P[i].turns === minT; });
    S.result = { scores: sc, turns: S.P.map(function (P) { return P.turns; }), winners: win, why: S.supply.oukan === 0 ? 'oukan' : 'piles', tieBreak: tied.length > 1 && win.length < tied.length,
      empty: Object.keys(S.supply).filter(function (k) { return S.supply[k] === 0; }), decks: S.P.map(function (P) { return counts(owned(P)); }) };
    ev(S, { k: 'over', winners: win, scores: sc, why: S.result.why });
  }

  // ---- 見てよい情報だけを取り出す ----
  function needView(nd, q) {
    if (!nd) return null;
    if (nd.why === 'hanebashi' && nd.p !== q) return { p: nd.p, k: 'wait', id: nd.id };   // 跳ね橋を持っていることは本人以外に見せない
    var o = {}; for (var k in nd) if (k !== 'cards' || nd.p === q) o[k] = Array.isArray(nd[k]) ? nd[k].slice() : nd[k];
    if (nd.p !== q) { delete o.c; delete o.only; if (nd.why === 'kanja' || nd.why === 'kaitou' || nd.why === 'kaitouGain') { /* 公開されたカードなので見せてよい */ o.cards = nd.cards ? nd.cards.slice() : undefined; o.c = nd.c; } }
    return o;
  }
  function evView(e, q) {
    var o = {}; for (var k in e) if (k !== 'mine') o[k] = e[k];
    if (e.mine && e.p === q) o.mine = e.mine;
    return o;
  }
  function pubPlayer(P) { var all = owned(P); return { nh: P.hand.length, nd: P.deck.length, ndisc: P.disc.length, top: P.disc.length ? P.disc[P.disc.length - 1] : null, play: P.play.slice(), aside: P.aside.slice(), turns: P.turns, own: counts(all), total: all.length, vp: vpOf(all) }; }
  function viewFor(S, q, nEv) {
    var v = { np: S.np, kingdom: S.kingdom.slice(), supply: Object.assign({}, S.supply), trash: S.trash.slice(), turn: S.turn, turnNo: S.turnNo, phase: S.phase,
      actions: S.actions, buys: S.buys, coins: S.coins, discount: S.discount || 0, merch: S.merch, silver: S.silver, bought: S.bought, over: S.over, result: S.result, first: S.first,
      P: S.P.map(pubPlayer), hand: q >= 0 && q < S.np ? S.P[q].hand.slice() : null, need: needView(S.need, q), k: S.seq,
      ev: S.ev.slice(-(nEv || 120)).map(function (e) { return evView(e, q); }) };
    return v;
  }
  // 再開用：seed と判断の列から状態を作り直す
  function replay(o, log) { var S = newGame(o); for (var i = 0; i < log.length; i++) { var e = act(S, log[i][0], log[i][1]); if (e) throw new Error('replay failed at ' + i + ': ' + e); } return S; }

  var api = { C: C, D: D, isA: isA, cost: cost, matches: matches, SETS: SETS, pool: pool, randomKingdom: randomKingdom, sortK: sortK, supplyCounts: supplyCounts,
    newGame: newGame, act: act, viewFor: viewFor, replay: replay, mulberry: mulberry, shuffle: shuffle, owned: owned, counts: counts, vpOf: vpOf, emptyPiles: emptyPiles,
    gainOptions: gainOptions, price: price, handCoins: handCoins, others: others };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KS = api;
})(this);
