/* 王国争覇：CPU の思考（ブラウザ・Node 共通）
 * CPU はズルをしません。考えるときは know() で作った「その人が知っていてよい情報」だけを使います：
 *   自分の手札・自分のカード全体の内訳（買った／追放したカードは全員に公開）・自分の捨て札（覚えていられる）・
 *   山札の「枚数と中身の合計」（並び順は使わない）・供給・追放の山・全員の公開情報（得点・持ちカード数）・判断に必要な公開/自分だけのカード。
 * 他人の手札・山札の並びは一切読みません（test/logic.test.js で確認）。
 */
(function (root) {
  'use strict';
  var L = (typeof module !== 'undefined' && module.exports) ? require('./logic.js') : root.KS;
  var W = (typeof module !== 'undefined' && module.exports) ? (function () { try { return require('./weights.js'); } catch (e) { return null; } })() : root.KS_WEIGHTS;
  var D = L.D, isA = L.isA, cost = L.cost;
  var TW = Object.assign({ provAt: 16, hakuryoAt: 4, shoryoAt: 2, hakuryoLate: 5, ratio: 11, ppr: 1 }, (W && W.strong) || {});
  var COINV = { renkin: 0.8, shanikusai: 2.6, jikeidan: 2, kosho: 2, wanashi: 1, yatou: 1.2, ryogae: 1, ginzaiku: 0.5 };
  var DRAW = { tetsuuchi: 2.5, entaku: 3, shahon: 3, hanebashi: 2, jujutsu: 2, renkin: 1 };
  var TERM = function (c) { return isA(c, 'action') && !(D[c].plus && D[c].plus.a) && c !== 'ekken'; };

  // ================= 知ってよい情報 =================
  function know(S, p) {
    var P = S.P[p], own = L.counts(L.owned(P)), opp = [];
    var vp = S.P.map(function (Q) { return L.vpOf(L.owned(Q)); });
    var oppAtt = 0, oppJujutsu = 0;
    L.others(S, p).forEach(function (q) { var o = L.counts(L.owned(S.P[q])); opp.push(o); for (var c in o) { if (isA(c, 'attack')) oppAtt += o[c]; if (c === 'jujutsu') oppJujutsu += o[c]; } });
    var money = 0, total = 0;
    for (var c in own) { total += own[c]; if (isA(c, 'treasure')) money += D[c].coin * own[c]; if (COINV[c]) money += COINV[c] * own[c]; }
    var P0 = S.np === 2 ? 8 : 12, myVp = vp[p], oppVp = Math.max.apply(null, vp.filter(function (v, i) { return i !== p; }));
    return {
      p: p, np: S.np, phase: S.phase, actions: S.actions, buys: S.buys, coins: S.coins + (S.discount || 0), discount: S.discount || 0, merch: S.merch, silver: S.silver, bought: S.bought,
      hand: P.hand.slice(), play: P.play.slice(), deckN: P.deck.length, deckComp: L.counts(P.deck), disc: L.counts(P.disc), discTop: P.disc[P.disc.length - 1],
      own: own, total: total, money: money, supply: Object.assign({}, S.supply), kingdom: S.kingdom.slice(), trash: S.trash.length,
      vp: vp, myVp: myVp, oppVp: oppVp, lead: myVp - oppVp, turnsMine: P.turns, turns: S.P.map(function (Q) { return Q.turns; }), turnOrder: S.turn, first: S.first,
      P: S.supply.oukan, P0: P0, s: P0 / 8, empty: L.emptyPiles(S), oppAtt: oppAtt, oppJujutsu: oppJujutsu, opp: opp,
      n: function (c) { return own[c] || 0; }
    };
  }
  // ================= 作戦（買う優先順位） =================
  function plan(id, name, rules, o) { return Object.assign({ id: id, name: name, rules: rules, keepMoney: 6, thin: false }, o || {}); }
  var always = function () { return true; };
  function greens(o) {   // 王冠領・伯爵領・小領地のタイミング（BMU 型）
    o = o || {};
    var pa = o.provAt != null ? o.provAt : TW.provAt, da = o.hakuryoAt != null ? o.hakuryoAt : TW.hakuryoAt, ea = o.shoryoAt != null ? o.shoryoAt : TW.shoryoAt;
    return { head: [['oukan', function (K) { return K.money > pa || K.P <= 4 * K.s; }], ['hakuryo', function (K) { return K.P <= da * K.s; }], ['shoryo', function (K) { return K.P <= ea * K.s; }]],
      late: [['hakuryo', function (K) { return K.P <= (o.hakuryoLate != null ? o.hakuryoLate : TW.hakuryoLate) * K.s; }]] };
  }
  function limitFn(x, max, ratio) { return function (K) { return K.n(x) < Math.min(max, 1 + Math.floor((K.total - 10) / ratio)); }; }
  // お金だけ（基準：Big Money Ultimate 型）
  function bmu() { var g = greens({ provAt: 18, hakuryoAt: 4, shoryoAt: 2, hakuryoLate: 6 }); return plan('bmu', 'お金一直線', g.head.concat([['gold', always]], g.late, [['silver', always]])); }
  function bigMoney() { return plan('bm', 'お金だけ（素朴）', [['oukan', always], ['gold', always], ['silver', always]]); }
  // お金＋終端アクション X
  function bmx(x, max, o) {
    o = o || {}; var g = greens(o), lim = limitFn(x, max, o.ratio || TW.ratio);
    var mid = o.xFirst ? [[x, lim], ['gold', always]] : [['gold', always], [x, lim]];
    if (o.x2) mid.push([o.x2, limitFn(o.x2, o.max2 || 1, o.ratio || TW.ratio)]);
    return plan('bm_' + x + max + (o.x2 ? '_' + o.x2 : '') + (o.tag || ''), D[x].n + (max > 1 ? '×' + max : '') + (o.x2 ? '＋' + D[o.x2].n : '') + '＋お金' + (o.tag === 'agg' ? '（早めに王冠領）' : ''), g.head.concat(mid, g.late, o.pre || [], [['silver', always]]), o.extra);
  }
  // お金＋アクションの増えるカード（いくらでも）
  function bmn(x, o) {
    o = o || {}; var g = greens(o);
    var r = g.head.concat([['gold', always], [x, function (K) { return K.n(x) < (o.max || 8); }]]);
    if (o.t) r.push([o.t, limitFn(o.t, o.tmax || 1, TW.ratio)]);
    return plan('bmn_' + x + (o.t ? '_' + o.t : ''), D[x].n + (o.t ? '＋' + D[o.t].n : '') + '＋お金', r.concat(g.late, [['silver', always]]));
  }
  // 宿場町系のエンジン（アクションを増やして引きまくる）
  function engine(vil, drw, o) {
    o = o || {}; var g = greens({ provAt: 14, hakuryoAt: 3, shoryoAt: 1, hakuryoLate: 4 });
    var r = g.head.slice();
    if (o.trash) r.push([o.trash, function (K) { return K.n(o.trash) < 1 && K.turnsMine <= 3; }]);
    if (o.pay) r.push([o.pay, function (K) { return K.n(o.pay) < (o.payMax || 1); }]);
    r.push([drw, function (K) { return K.n(drw) < Math.min(4, K.n(vil) + 1); }]);
    r.push([vil, function (K) { return K.n(vil) < Math.min(5, K.n(drw) + 1); }]);
    r.push(['gold', always]);
    ['renkin', 'bazaar', 'shanikusai'].forEach(function (c) { if (o.k.indexOf(c) >= 0) r.push([c, always]); });
    r = r.concat(g.late, [['silver', always]]);
    return plan('eng_' + vil + '_' + drw + (o.trash ? '_' + o.trash : '') + (o.pay ? '_' + o.pay : ''), D[vil].n + '＋' + D[drw].n + (o.trash ? '＋' + D[o.trash].n : '') + (o.pay ? '＋' + D[o.pay].n : ''), r, { thin: !!o.trash, keepMoney: 5 });
  }
  // 懺悔室で圧縮してから強いカード
  function zangePlan(x, o) {
    o = o || {}; var g = greens({ provAt: 13, hakuryoAt: 3, shoryoAt: 1, hakuryoLate: 4 });
    var r = g.head.concat([['zange', function (K) { return K.n('zange') < 1 && K.turnsMine <= 2; }], [x, function (K) { return K.n(x) < (o.max || 2); }], ['gold', always]]);
    ['renkin', 'bazaar', 'shanikusai'].forEach(function (c) { if (o.k.indexOf(c) >= 0) r.push([c, always]); });
    return plan('zange_' + x, '懺悔室＋' + D[x].n, r.concat(g.late, [['silver', always]]), { thin: true, keepMoney: o.keep || 5 });
  }
  // 薬草畑ラッシュ（大工小屋／炭焼き）
  function yakusouRush(w) {
    return plan('yakusou_' + w, D[w].n + '＋薬草畑', [
      ['oukan', function (K) { return K.coins >= 8; }],
      ['yakusou', always],
      ['hakuryo', function (K) { return !K.supply.yakusou || K.empty >= 1; }],
      [w, function (K) { return K.n(w) < 9; }],
      ['shoryo', function (K) { return !K.supply.yakusou || K.n(w) >= 6; }],
      ['silver', function (K) { return K.n(w) >= 9 && K.supply.yakusou > 0 && false; }],
      ['copper', always]
    ], { yakusou: true, thin: false });
  }
  // 盤面から作戦の候補を作る
  function candidates(kingdom, np) {
    var k = kingdom, has = function (c) { return k.indexOf(c) >= 0; }, out = [bmu()];
    var terms = ['jujutsu', 'tetsuuchi', 'entaku', 'shahon', 'jikeidan', 'ryogae', 'yatou', 'chozei', 'hanebashi', 'kinmyaku', 'meikou', 'kosho', 'tatenaoshi', 'daikugoya'];
    terms.forEach(function (x) { if (!has(x)) return; out.push(bmx(x, 1)); if (DRAW[x] || x === 'jikeidan' || x === 'jujutsu') out.push(bmx(x, 2, { xFirst: x === 'jujutsu' })); });
    if (has('jujutsu')) out.push(bmx('jujutsu', 2, { xFirst: true, tag: 'agg', provAt: 15 }));
    ['renkin', 'bazaar', 'shanikusai', 'ginzaiku', 'monomi', 'hayauma', 'wanashi'].forEach(function (x) {
      if (!has(x)) return; out.push(bmn(x));
      ['jujutsu', 'tetsuuchi', 'shahon', 'entaku', 'jikeidan', 'ryogae'].forEach(function (t) { if (has(t)) out.push(bmn(x, { t: t, tmax: t === 'jujutsu' || DRAW[t] ? 2 : 1 })); });
    });
    if (has('tetsuuchi') && has('jikeidan')) out.push(bmx('tetsuuchi', 1, { x2: 'jikeidan' }));
    if (has('jujutsu') && has('hanebashi')) out.push(bmx('jujutsu', 2, { xFirst: true, x2: 'hanebashi', tag: 'm' }));
    var vils = ['shukuba', 'shanikusai'].filter(has), draws = ['tetsuuchi', 'entaku', 'shahon'].filter(has);
    vils.forEach(function (v) { draws.forEach(function (d) {
      out.push(engine(v, d, { k: k }));
      if (has('zange')) out.push(engine(v, d, { k: k, trash: 'zange' }));
      ['jujutsu', 'jikeidan'].forEach(function (pay) { if (has(pay)) out.push(engine(v, d, { k: k, pay: pay, payMax: pay === 'jujutsu' ? 2 : 1 })); });
    }); });
    if (has('zange')) ['jujutsu', 'renkin', 'bazaar', 'jikeidan', 'tetsuuchi', 'kinmyaku'].forEach(function (x) { if (has(x)) out.push(zangePlan(x, { k: k, max: x === 'renkin' || x === 'bazaar' ? 6 : 2 })); });
    if (has('yakusou')) ['daikugoya'].forEach(function (w) { if (has(w)) out.push(yakusouRush(w)); });
    var seen = {}; return out.filter(function (pl) { if (seen[pl.id]) return false; seen[pl.id] = 1; return true; });
  }
  // 「強い」が選ぶ作戦（盤面を見た経験則）
  var TERM_RANK = { entaku: 8, jikeidan: 7.8, shahon: 7.6, jujutsu: 7.2, tetsuuchi: 6.6, yatou: 5.6, ryogae: 6, meikou: 5.8, chozei: 5.4, kinmyaku: 4.6, kosho: 5, hanebashi: 5.2, tatenaoshi: 4, daikugoya: 3 };
  function strongPlan(kingdom, np) {
    var has = function (c) { return kingdom.indexOf(c) >= 0; };
    if (has('yakusou') && has('daikugoya') && np >= 3) return yakusouRush('daikugoya');
    var best = null, bv = 0;
    Object.keys(TERM_RANK).forEach(function (x) { if (has(x) && TERM_RANK[x] > bv) { bv = TERM_RANK[x]; best = x; } });
    var non = ['renkin', 'bazaar', 'shanikusai'].filter(has)[0];
    if (best && non && (DRAW[best] || best === 'jikeidan')) return bmn(non, { t: best, tmax: DRAW[best] ? 2 : 1 });
    if (best) return bmx(best, DRAW[best] ? 2 : 1);
    if (non) return bmn(non);
    return bmu();
  }
  function normalPlan(kingdom, rnd) {
    var acts = kingdom.filter(function (c) { return isA(c, 'action') && cost(c) >= 3; });
    var x = acts.length ? acts[Math.floor(rnd() * acts.length)] : null;
    return plan('normal_' + (x || 'none'), 'のんびり', [['oukan', always], ['gold', always], ['hakuryo', function (K) { return K.P <= 2 * K.s; }]].concat(x ? [[x, function (K) { return K.n(x) < 2; }]] : [], [['silver', always]]));
  }

  // ================= カードの価値（判断用の目安） =================
  var AV = { jujutsu: 3.6, renkin: 3.1, bazaar: 2.9, shanikusai: 3.0, tetsuuchi: 3.0, shahon: 3.2, entaku: 3.0, jikeidan: 2.9, monomi: 3, meikou: 3.4, kinmyaku: 2.6, yatou: 2.9, ginzaiku: 2.4, hayauma: 2.3, wanashi: 2.3,
    ryogae: 2.5, tatenaoshi: 2.2, ekken: 2.1, shukuba: 2.3, zange: 2, daikugoya: 1.9, chozei: 2.3, kosho: 2.2, monooki: 1.5, hanebashi: 1.9 };
  function late(K) { return Math.max(0, Math.min(1, (K.P0 - K.P) / K.P0 * 1.3 + (K.empty >= 2 ? 0.4 : 0))); }
  function cv(K, c, pl) {
    if (c === 'copper') return pl && pl.thin ? 0.3 : (pl && pl.yakusou ? 1.4 : 1);
    if (c === 'silver') return 2.2; if (c === 'gold') return 3.6;
    if (c === 'curse') return -2.5;
    if (c === 'yakusou') return (pl && pl.yakusou ? 3 : 0.4) + late(K) * Math.floor(K.total / 10);
    if (isA(c, 'victory')) return -0.8 + D[c].vp * (0.15 + late(K) * 1.2);
    return AV[c] || 2;
  }
  // ================= 買うカード =================
  function planPick(K, pl, coins, filterMax) {
    for (var i = 0; i < pl.rules.length; i++) {
      var r = pl.rules[i], c = r[0];
      if (!K.supply[c] || cost(c) > coins || (filterMax != null && cost(c) > filterMax)) continue;
      if (r[1](K)) return c;
    }
    return null;
  }
  // 終盤：買ったらゲームが終わるか・そのとき勝っているか
  function endsGame(K, buys) {
    var sup = Object.assign({}, K.supply); buys.forEach(function (c) { sup[c]--; });
    var e = 0; for (var k in sup) if (sup[k] <= 0) e++;
    return sup.oukan <= 0 || e >= 3;
  }
  function vpAfter(K, buys) { var own = Object.assign({}, K.own), n = K.total; buys.forEach(function (c) { own[c] = (own[c] || 0) + 1; n++; }); var v = 0; for (var c in own) { if (c === 'yakusou') v += Math.floor(n / 10) * own[c]; else if (D[c].vp) v += D[c].vp * own[c]; } return v; }
  // 同点のときの扱い：手番の少ない方が勝ち。自分が最後の手番なら同点は「引き分け以上」
  function winsWith(K, v) {
    var ok = true;
    K.vp.forEach(function (o, i) { if (i === K.p) return; if (o > v) ok = false; else if (o === v && K.turns[i] <= K.turnsMine - 0 && !(K.turns[i] < K.turnsMine)) { /* 同じ手番数なら共同勝利 */ } else if (o === v && K.turns[i] < K.turnsMine) ok = false; });
    return ok;
  }
  function chooseBuys(K, pl, lv, coins, buys) {
    var out = [], left = coins;
    for (var b = 0; b < buys; b++) {
      var Kb = Object.assign({}, K, { supply: Object.assign({}, K.supply), coins: left, own: Object.assign({}, K.own) });
      out.forEach(function (c) { Kb.supply[c]--; Kb.own[c] = (Kb.own[c] || 0) + 1; Kb.total++; });
      Kb.n = function (c) { return Kb.own[c] || 0; };
      Kb.P = Kb.supply.oukan;
      var c = planPick(Kb, pl, left);
      if (lv === 'strong' || lv === 'ultra') c = endgameAdjust(Kb, pl, lv, left, c, out);
      if (!c) break;
      if (c === 'copper' && !pl.yakusou) break;
      if (b > 0 && c === 'curse') break;
      out.push(c); left -= cost(c);
    }
    return out;
  }
  function endgameAdjust(K, pl, lv, coins, c, prev) {
    var opts = Object.keys(K.supply).filter(function (k) { return K.supply[k] > 0 && cost(k) <= coins; });
    // 1) いま終わらせて勝てるなら終わらせる（最後の王冠領／3つ目の山）
    var vpCards = opts.filter(function (k) { return isA(k, 'victory') || k === 'curse' || K.supply[k] === 1; }).sort(function (a, b) { return vpAfter(K, prev.concat([b])) - vpAfter(K, prev.concat([a])); });
    for (var i = 0; i < vpCards.length; i++) { var t = prev.concat([vpCards[i]]); if (endsGame(K, t) && winsWith(K, vpAfter(K, t))) return vpCards[i]; }
    if (!c) return c;
    // 2) 買うと終わって負けるなら買わない（別のものに）
    if (endsGame(K, prev.concat([c])) && !winsWith(K, vpAfter(K, prev.concat([c])))) {
      var alt = opts.filter(function (k) { return k !== c && !endsGame(K, prev.concat([k])); }).sort(function (a, b) { return cv(K, b, pl) - cv(K, a, pl); })[0];
      return alt && cv(K, alt, pl) > 0 ? alt : null;
    }
    // 3) 最後から2枚目の王冠領ルール：買ったあと相手が最後の1枚で逆転できるなら伯爵領に
    if (TW.ppr && c === 'oukan' && K.supply.oukan === 2) {
      var my = vpAfter(K, prev.concat(['oukan']));
      if (K.vp.some(function (o, i) { return i !== K.p && o + 6 > my; }) && K.supply.hakuryo > 0 && coins >= 5) return 'hakuryo';
    }
    // 4) 山切れが近い：相手が次の手番で終わらせて勝ちそうなら、得点を優先
    if (K.empty >= 2 && K.lead <= 0 && !isA(c, 'victory')) { var v = ['oukan', 'hakuryo', 'shoryo'].filter(function (k) { return opts.indexOf(k) >= 0 && !endsGame(K, prev.concat([k])); })[0]; if (v) return v; }
    return c;
  }

  // ================= アクションを使う順 =================
  function playScore(K, c, hand) {
    var others = hand.slice(); others.splice(others.indexOf(c), 1);
    var terms = others.filter(TERM).length, acts = K.actions;
    var pl = D[c].plus || {};
    if (c === 'ekken') return others.some(function (x) { return isA(x, 'action'); }) ? 96 : -1;
    if (pl.a >= 2) return terms >= acts || others.some(function (x) { return DRAW[x]; }) ? 92 + (pl.m ? 1 : 0) : 70;
    if (pl.a === 1) return { shanikusai: 89, renkin: 88, bazaar: 87, monomi: 86, ginzaiku: 85, hayauma: 84, wanashi: 83, monooki: others.some(function (x) { return isA(x, 'victory') || x === 'curse'; }) ? 80 : 20 }[c] || 80;
    var v = { jujutsu: K.supply.curse > 0 ? 66 : 48, meikou: 60, tetsuuchi: 56, entaku: 55, shahon: 40 + 3 * Math.max(0, 7 - others.length), jikeidan: 54, yatou: 52, ryogae: others.some(function (x) { return isA(x, 'treasure'); }) ? 50 : 4,
      kinmyaku: others.some(function (x) { return x === 'silver' || x === 'copper'; }) ? 47 : 4, chozei: 46, zange: 58, tatenaoshi: 30, daikugoya: 38, kosho: 44, hanebashi: 42 }[c] || 30;
    if (acts >= 2 && DRAW[c]) v += 10;
    return v;
  }
  // ================= 判断 =================
  function keepVal(K, c, pl, ctx) {
    if (isA(c, 'treasure')) return D[c].coin + (c === 'silver' && K.merch && !K.silver ? K.merch : 0);
    if (isA(c, 'action')) return AV[c] ? AV[c] * 0.8 : 1.5;
    return -1 + (c === 'curse' ? -0.5 : 0);
  }
  function worstN(K, hand, n, pl) {   // 価値の低い n 枚（終端アクションの重複は低めに）
    var idx = hand.map(function (c, i) { return i; }), seenT = 0, val = {};
    idx.slice().sort(function (a, b) { return keepVal(K, hand[b], pl) - keepVal(K, hand[a], pl); }).forEach(function (i) {
      var c = hand[i], v = keepVal(K, c, pl);
      if (TERM(c)) { if (seenT >= Math.max(1, K.actions)) v = 0.4; seenT++; }
      val[i] = v;
    });
    return idx.sort(function (a, b) { return val[a] - val[b]; }).slice(0, n);
  }
  function trashChoices(K, hand, max, pl, why) {
    var out = [], money = K.money, endish = late(K) > 0.6;
    var order = hand.map(function (c, i) { return i; }).sort(function (a, b) { return rankTrash(hand[a]) - rankTrash(hand[b]); });
    function rankTrash(c) { return c === 'curse' ? 0 : c === 'shoryo' ? 1 : c === 'copper' ? 2 : 9; }
    for (var j = 0; j < order.length && out.length < max; j++) {
      var c = hand[order[j]];
      if (c === 'curse') out.push(order[j]);
      else if (c === 'shoryo' && !endish) out.push(order[j]);
      else if (c === 'copper' && (pl.thin || why === 'zange') && money - 1 >= (pl.keepMoney || 6) && !endish) { out.push(order[j]); money -= 1; }
    }
    return out;
  }
  function bestGain(K, pl, max, filter, why) {
    var opts = Object.keys(K.supply).filter(function (k) { return K.supply[k] > 0 && cost(k) <= max && L.matches(k, filter); });
    if (!opts.length) return null;
    var c = planPick(Object.assign({}, K, { coins: max }), pl, max);
    if (c && opts.indexOf(c) >= 0 && (c !== 'copper' || pl.yakusou || opts.length === 1)) return c;
    return opts.sort(function (a, b) { return cv(K, b, pl) - cv(K, a, pl) || cost(b) - cost(a); })[0];
  }
  function decideSmart(S, p, nd, lv, pl) {
    var K = know(S, p), hand = K.hand;
    switch (nd.k) {
      case 'action': {
        var best = -1, bi = -1;
        hand.forEach(function (c, i) { if (!isA(c, 'action')) return; var s = playScore(K, c, hand); if (s > best) { best = s; bi = i; } });
        return best > 10 ? { a: 'play', i: bi } : { a: 'end' };
      }
      case 'buy': {
        if (!K.bought && hand.some(function (c) { return isA(c, 'treasure'); })) return { a: 'all' };
        var b = chooseBuys(K, pl, lv, K.coins, K.buys);
        return b.length ? { a: 'buy', c: b[0] } : { a: 'end' };
      }
      case 'hand': return { sel: handPick(K, nd, pl, lv) };
      case 'supply': {
        if (nd.why === 'tatenaoshi') return { c: tatenaoshiGain(K, pl, nd.max) };
        if (nd.why === 'bazaar') { var bz = bestGain(K, pl, nd.max, nd.filter, nd.why); return { c: bz && (isA(bz, 'action') || (bz === 'copper' && pl.yakusou) || (isA(bz, 'victory') && late(K) > 0.6)) ? bz : null }; }
        return { c: bestGain(K, pl, nd.max, nd.filter, nd.why) };
      }
      case 'yn': return { y: yn(K, nd, pl) };
      case 'pick': return { sel: pickFrom(K, nd, pl) };
      case 'monomi': {
        var fate = nd.cards.map(function (c) {
          if (c === 'curse') return 'trash';
          if (c === 'shoryo') return late(K) > 0.6 ? 'discard' : 'trash';
          if (c === 'copper') return pl.thin && K.money - 1 >= pl.keepMoney ? 'trash' : (pl.yakusou ? 'keep' : 'discard');
          if (isA(c, 'victory')) return pl.yakusou && c === 'yakusou' ? 'keep' : 'discard';
          return 'keep';
        });
        var keep = []; fate.forEach(function (f, i) { if (f === 'keep') keep.push(i); });
        keep.sort(function (a, b) { return cv(K, nd.cards[b], pl) - cv(K, nd.cards[a], pl); });
        return { fate: fate, order: keep };
      }
    }
    return {};
  }
  function tatenaoshiGain(K, pl, max) {
    var late2 = late(K) > 0.5;
    if (max >= 8 && K.supply.oukan && (late2 || K.P <= 5 * K.s)) return 'oukan';
    if (max >= 6 && K.supply.gold && !late2) return 'gold';
    return bestGain(K, pl, max, null, 'tatenaoshi');
  }
  function handPick(K, nd, pl, lv) {
    var hand = K.hand, n = nd.max, w = nd.why;
    var elig = hand.map(function (c, i) { return i; }).filter(function (i) { return L.matches(hand[i], nd.filter); });
    if (w === 'jikeidan') { var tr = elig.slice().sort(function (a, b) { return D[hand[a]].coin - D[hand[b]].coin; }); return tr.slice(0, 1); }
    if (w === 'wanashi' || w === 'jujutsuDisc' || w === 'entaku') return worstN(K, hand, nd.min, pl);
    if (w === 'tetsuuchi') return elig.length && !pl.yakusou ? [elig[0]] : [];
    if (w === 'renkin') return trashChoices(K, hand, 1, pl, 'zange');
    if (w === 'monooki') {
      var acts = K.actions, out = [], seenT = 0;
      hand.forEach(function (c, i) { if (isA(c, 'victory') && !(pl.yakusou && c === 'yakusou' && false) || c === 'curse') out.push(i); else if (TERM(c)) { if (seenT >= acts) out.push(i); seenT++; } });
      return out;
    }
    if (w === 'zange') return trashChoices(K, hand, 4, pl, 'zange');
    if (w === 'ryogae') { var cu = hand.indexOf('copper'), si = hand.indexOf('silver'); if (cu >= 0 && !pl.yakusou) return [cu]; if (si >= 0 && late(K) > 0.6) return [si]; return []; }
    if (w === 'kinmyaku') {
      var s = hand.indexOf('silver'), c = hand.indexOf('copper');
      if (s >= 0 && K.supply.gold) return [s]; if (c >= 0 && K.supply.silver && !pl.yakusou) return [c]; return [];
    }
    if (w === 'ekken') {
      var bi = -1, bv = -1;
      elig.forEach(function (i) { var c = hand[i]; if (c === 'ekken' && elig.length > 1) return; var v = (AV[c] || 2) + (DRAW[c] ? 0.5 : 0) + (c === 'jujutsu' && K.supply.curse > 0 ? 1 : 0); if (v > bv) { bv = v; bi = i; } });
      return bi >= 0 ? [bi] : elig.slice(0, 1);
    }
    if (w === 'tatenaoshi') {
      var best = null, bs = -99;
      hand.forEach(function (c, i) {
        var g = tatenaoshiGain(K, pl, cost(c) + 2), gv = g ? cv(K, g, pl) : 0, s = gv - cv(K, c, pl);
        if (c === 'gold' && g === 'oukan') s += 2;
        if (s > bs) { bs = s; best = i; }
      });
      return [best];
    }
    if (w === 'chozei') return elig.slice(0, 1);
    if (w === 'meikou') {   // 山札の上に置く：次のターンに使いたくて、今は使わないもの
      var bestI = 0, bestS = -99;
      hand.forEach(function (c, i) {
        var s;
        if (isA(c, 'action')) s = K.actions === 0 ? 3 + (AV[c] || 2) : 1;
        else if (isA(c, 'treasure')) s = 1.5 + D[c].coin * 0.3 - (K.phase === 'action' ? 1.5 : 0);
        else s = -3;
        if (s > bestS) { bestS = s; bestI = i; }
      });
      return [bestI];
    }
    return worstN(K, hand, nd.min, pl).filter(function (i) { return L.matches(hand[i], nd.filter); }).slice(0, nd.min);
  }
  function yn(K, nd, pl) {
    switch (nd.why) {
      case 'hanebashi': return true;
      case 'kosho': return true;
      case 'jujutsu': return K.hand.length >= 4 || late(K) > 0.7 ? !(K.hand.some(function (c) { return c === 'gold'; }) && K.hand.length <= 4) : true;   // はい＝手札を1枚捨てる（呪いより軽いことが多い）
      case 'ekkenBack': return (AV[nd.c] || 2) >= 3 && late(K) < 0.8;
      case 'shahon': return K.actions === 0;
    }
    return true;
  }
  function pickFrom(K, nd, pl) {
    var cs = nd.cards;
    if (nd.why === 'hayauma') {
      var bi = -1, bv = 2.3; cs.forEach(function (c, i) { var v = cv(K, c, pl); if (isA(c, 'treasure') || isA(c, 'action')) if (v > bv) { bv = v; bi = i; } });
      return bi >= 0 ? [bi] : [];
    }
    if (nd.why === 'yatou') { var o = nd.only.slice().sort(function (a, b) { return cv(K, cs[a], pl) - cv(K, cs[b], pl); }); return [o[0]]; }
    return cs.slice(0, nd.min).map(function (c, i) { return i; });
  }
  // ---- 弱い：ほぼ気まぐれ（ルールは守る） ----
  function decideWeak(S, p, nd, rnd) {
    var P = S.P[p], hand = P.hand;
    var anyIdx = function (f) { return hand.map(function (c, i) { return i; }).filter(function (i) { return L.matches(hand[i], f); }); };
    switch (nd.k) {
      case 'action': { var a = anyIdx('action'); return a.length && rnd() < 0.85 ? { a: 'play', i: a[Math.floor(rnd() * a.length)] } : { a: 'end' }; }
      case 'buy': {
        if (!S.bought && hand.some(function (c) { return isA(c, 'treasure'); })) return { a: 'all' };
        if (S.bought && rnd() < 0.6) return { a: 'end' };
        var opts = Object.keys(S.supply).filter(function (k) { return S.supply[k] > 0 && cost(k) <= S.coins && k !== 'curse' && (k !== 'copper' || rnd() < 0.1) && (k !== 'shoryo' || rnd() < 0.15) && (k !== 'hakuryo' || S.supply.oukan < (S.np === 2 ? 5 : 7) || rnd() < 0.2); });
        opts = opts.filter(function (k) { return D[k].ed === 0 || (L.counts(L.owned(P))[k] || 0) < (k === 'zange' ? 1 : 4); });
        if (S.coins >= 8 && S.supply.oukan && rnd() < 0.75) return { a: 'buy', c: 'oukan' };
        if (!opts.length || rnd() < 0.05) return { a: 'end' };
        opts.sort(function (x, y) { return cost(y) - cost(x) + (rnd() - 0.5) * 4; });
        return { a: 'buy', c: opts[0] };
      }
      case 'hand': { var e = anyIdx(nd.filter); shuffleR(e, rnd); var n = nd.min + Math.floor(rnd() * (nd.max - nd.min + 1)); return { sel: e.slice(0, n) }; }
      case 'supply': { var g = L.gainOptions(S, nd.max, nd.filter); g.sort(function (x, y) { return cost(y) - cost(x) + (rnd() - 0.5) * 3; }); return { c: g[0] || null }; }
      case 'yn': return { y: nd.why === 'hanebashi' ? true : rnd() < 0.5 };
      case 'pick': { var idx = (nd.only || nd.cards.map(function (c, i) { return i; })).slice(); shuffleR(idx, rnd); return { sel: idx.slice(0, Math.max(nd.min, Math.min(nd.max, Math.floor(rnd() * (nd.max + 1))))) }; }
      case 'monomi': return { fate: nd.cards.map(function (c) { return c === 'curse' ? 'trash' : isA(c, 'victory') && rnd() < 0.5 ? 'discard' : 'keep'; }) };
    }
    return {};
  }
  function shuffleR(a, rnd) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  var WEAKPL = null;
  // ---- 普通：素直なお金＋気に入ったカード（終盤の細かい計算はしない） ----
  function decide(S, p, lv, pl, rnd) {
    rnd = rnd || Math.random;
    var nd = S.need; if (!nd || nd.p !== p) return null;
    if (lv === 'weak') {   // 弱い：買い物とアクションはほぼ気まぐれ。カードの細かい判断は半分くらい まとも（懺悔室・建て直しは まとも）
      if (nd.k === 'action' || nd.k === 'buy' || (rnd() < 0.45 && ['zange', 'tatenaoshi', 'kinmyaku', 'ryogae', 'ekken'].indexOf(nd.why) < 0)) return decideWeak(S, p, nd, rnd);
      return decideSmart(S, p, nd, 'weak', pl && pl.rules && pl.rules.length ? pl : WEAKPL);
    }
    return decideSmart(S, p, nd, lv, pl);
  }
  // ================= 自己対戦（シミュレーション） =================
  function simGame(kingdom, seats, seed, o) {
    o = o || {};
    var rnd = L.mulberry(seed * 7 + 3);
    var S = L.newGame({ np: seats.length, kingdom: kingdom, seed: seed, noLog: true, start: o.start });
    var guard = 0;
    while (!S.over && guard++ < 20000) {
      var p = S.need.p, st = seats[p], a = decide(S, p, st.lv, st.plan, rnd);
      var e = L.act(S, p, a);
      if (e) { e = L.act(S, p, fallback(S)); if (e) throw new Error('AI stuck: ' + e + ' ' + JSON.stringify(S.need)); }
      if (S.turnNo > 100 * seats.length) break;   // 念のため（ふつうは起きない）
    }
    return S;
  }
  function fallback(S) {
    var nd = S.need;
    switch (nd.k) { case 'action': return { a: 'end' }; case 'buy': return { a: 'end' }; case 'hand': { var e = []; S.P[nd.p].hand.forEach(function (c, i) { if (L.matches(c, nd.filter)) e.push(i); }); return { sel: e.slice(0, nd.min) }; }
      case 'supply': return { c: L.gainOptions(S, nd.max, nd.filter)[0] || null }; case 'yn': return { y: false }; case 'pick': return { sel: (nd.only || [0]).slice(0, nd.min) }; case 'monomi': return { fate: nd.cards.map(function () { return 'keep'; }) }; }
    return {};
  }
  // アストラウルトラ：ゲームの最初に、この王国で作戦の候補どうしを自己対戦させて一番勝てるものを選ぶ
  // （公開情報＝王国の10種と人数だけを使う。手札や山札はまだ誰にも分からない）
  function* ultraSelectGen(kingdom, np, opt) {
    opt = opt || {};
    var cands = candidates(kingdom, np), field = [strongPlan(kingdom, np), bmu()], seed = opt.seed || 1, games1 = opt.g1 || 24, games2 = opt.g2 || 60, res = [];
    var done = 0, total = cands.length * games1 + Math.min(opt.top || 5, cands.length) * games2;
    function* score(pl, opps, n) {   // 1試合ごとに yield（ブラウザでは少しずつ計算して画面を止めない）
      var w = 0;
      for (var i = 0; i < n; i++) {
        var seats = [], me = i % np;
        for (var q = 0; q < np; q++) seats.push(q === me ? { lv: 'ultra', plan: pl } : { lv: 'strong', plan: opps[(i + q) % opps.length] });
        var S = simGame(kingdom, seats, seed + i * 131, { start: Math.floor(i / np) % np });
        if (S.result && S.result.winners.indexOf(me) >= 0) w += 1 / S.result.winners.length;
        yield ++done / total;
      }
      return w / n;
    }
    for (var i = 0; i < cands.length; i++) { var s1 = yield* score(cands[i], field, games1); res.push({ plan: cands[i], s1: s1 }); }
    res.sort(function (a, b) { return b.s1 - a.s1; });
    var top = res.slice(0, Math.min(opt.top || 5, res.length)), opps = field.concat(top.map(function (r) { return r.plan; }));
    for (var j = 0; j < top.length; j++) { top[j].s2 = yield* score(top[j].plan, opps, games2); }
    top.sort(function (a, b) { return b.s2 - a.s2; });
    return { plan: top[0].plan, table: top.map(function (r) { return { id: r.plan.id, name: r.plan.name, s1: +r.s1.toFixed(3), s2: +r.s2.toFixed(3) }; }), n: cands.length };
  }
  function ultraSelect(kingdom, np, opt) { var g = ultraSelectGen(kingdom, np, opt), r; do { r = g.next(); } while (!r.done); return r.value; }
  function planFor(lv, kingdom, np, rnd) {
    if (lv === 'weak') return WEAKPL;
    if (lv === 'normal') return normalPlan(kingdom, rnd || Math.random);
    return strongPlan(kingdom, np);
  }
  // 計画（plan）は関数を含むので、保存・再開用に「作り方」で表す
  function planById(id, kingdom, np) {
    if (!id) return null;
    var all = candidates(kingdom, np).concat([strongPlan(kingdom, np), bmu(), bigMoney()]);
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    if (id === 'weak') return WEAKPL;
    if (id.indexOf('normal_') === 0) { var x = id.slice(7); return plan(id, 'のんびり', [['oukan', always], ['gold', always], ['hakuryo', function (K) { return K.P <= 2 * K.s; }]].concat(x !== 'none' ? [[x, function (K) { return K.n(x) < 2; }]] : [], [['silver', always]])); }
    return strongPlan(kingdom, np);
  }
  WEAKPL = plan('weak', '気まぐれ', [['oukan', always], ['gold', always], ['silver', always]]);
  var api = { know: know, decide: decide, simGame: simGame, candidates: candidates, strongPlan: strongPlan, normalPlan: normalPlan, bmu: bmu, bigMoney: bigMoney, bmx: bmx, bmn: bmn, engine: engine, yakusouRush: yakusouRush,
    ultraSelect: ultraSelect, ultraSelectGen: ultraSelectGen, planFor: planFor, planById: planById, fallback: fallback, TW: TW };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KS_AI = api;
})(this);
