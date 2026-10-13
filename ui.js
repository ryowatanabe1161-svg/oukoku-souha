/* 王国争覇：画面の描画と、手札・供給・選択パネルの操作 */
'use strict';
var ui = { k: -1, sel: [], focus: -1, fate: [], order: 0, seenEv: 0, gameNo: -1, lastNotice: 0, sayId: 0, endShown: -1, awakenFor: -1, logOpen: false };
function pname(g, p) { var o = g.owners[p]; return o ? (p === g.me ? 'あなた' : o.name) : '?'; }
function pface(g, p) { var o = g.owners[p]; return o.kind === 'cpu' ? o.e : p === g.me ? '🙂' : '👤'; }
function myNeed(g) { return g && g.need && g.need.p === g.me && g.me >= 0 && !g.over && !g.wait; }
function cb(c) { return '<b class="cn">' + cemo(c) + cname(c) + '</b>'; }

function render(v) {
  lastView = v; window.__ll.view = v;
  if (v.notice && v.notice.id !== ui.lastNotice) { ui.lastNotice = v.notice.id; if (v.notice.msg) toast(v.notice.msg); }
  if (v.phase === 'lobby') { show('lobby'); renderLobby(v); }
  else if (v.phase === 'game' && v.g) { show('game'); renderGame(v); if (typeof maybeRotHint === 'function') maybeRotHint(); }
  else if (v.phase === 'end' && v.g) { show('end'); renderEnd(v); }
  BGM.want(v.phase === 'game' && v.g && v.g.ultra ? 'epic' : 'normal'); BGM.sync();
}

// ================= ロビー =================
function segHtml(items, cur, ro) { return items.map(function (it) { return '<button data-v="' + it[0] + '" class="' + (String(it[0]) === String(cur) ? 'on' : '') + '"' + (ro ? ' disabled' : '') + '>' + it[1] + '</button>'; }).join(''); }
function renderLobby(v) {
  var isHost = !!host, o = v.opts, ro = !isHost;
  $('codeBig').textContent = v.code;
  var url = inviteUrl(v.code);
  if (!v.solo && $('qr').dataset.url !== url) {
    $('inviteUrl').textContent = url;
    try { var qr = qrcode(0, 'M'); qr.addData(url); qr.make(); $('qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch (e) { $('qr').textContent = ''; }
    $('qr').dataset.url = url;
  }
  $('seatCount').textContent = v.seats.length + ' / ' + MAX_HUMANS + '人';
  $('seatList').innerHTML = v.seats.map(function (s) {
    return '<div class="seat' + (s.connected ? '' : ' offline') + '"><span class="av">' + esc(s.name.slice(0, 1)) + '</span><span class="nm">' + esc(s.name) + '</span>' +
      (s.kind === 'host' ? '<span class="tagx host">ホスト</span>' : '') + (s.sid === v.sid ? '<span class="tagx you">あなた</span>' : '') + (!s.connected ? '<span class="tagx off">切断中</span>' : '') +
      (isHost && s.kind === 'remote' ? '<button class="xbtn" data-sid="' + s.sid + '" aria-label="外す">✕</button>' : '') + '</div>';
  }).join('');
  $('seatHint').textContent = v.seats.length < 2 ? '招待URLかQRコードを送ってね。空いた席は CPU が入ります。' : '';
  // 王国
  $('kmodeSeg').innerHTML = segHtml([['set', 'おすすめ'], ['random', 'ランダム'], ['custom', '自分で選ぶ']], o.kmode, ro);
  var sets = L.SETS.slice();
  $('setList').style.display = o.kmode === 'set' ? '' : 'none';
  $('setList').innerHTML = segHtml(sets.map(function (s) { return [s.id, esc(s.n)]; }), o.set, ro);
  $('rollBtn').style.display = o.kmode === 'random' && isHost ? '' : 'none';
  $('customBox').style.display = o.kmode === 'custom' ? '' : 'none';
  var shown;
  if (o.kmode === 'set') shown = L.sortK((L.SETS.filter(function (s) { return s.id === o.set; })[0] || L.SETS[0]).k);
  else if (o.kmode === 'random') shown = o.kingdom;
  else shown = null;
  if (o.kmode === 'custom') {
    $('customNote').textContent = '選んだ数：' + o.pick.length + ' / 10（足りない分はスタート時にランダム）';
    $('customGrid').innerHTML = L.sortK(L.pool(o.ed1)).map(function (c) { return '<button class="ktile' + (o.pick.indexOf(c) >= 0 ? ' on' : '') + '" data-c="' + c + '"' + (ro ? ' disabled' : '') + '><span class="co">' + D[c].cost + '</span>' + D[c].e + '<b>' + D[c].n + '</b>' + (D[c].ed === 1 ? '<i>初版</i>' : '') + '</button>'; }).join('');
  }
  $('kPreview').innerHTML = shown ? shown.map(function (c) { return '<button class="ktile pv" data-info="' + c + '"><span class="co">' + D[c].cost + '</span>' + D[c].e + '<b>' + D[c].n + '</b></button>'; }).join('') : '';
  $('kPreview').style.display = shown ? '' : 'none';
  // 人数・CPU
  var r = npRange(v.seats.length);
  $('npSeg').innerHTML = [2, 3, 4].map(function (n) { return '<button data-v="' + n + '" class="' + (n === Math.max(o.np, v.seats.length) ? 'on' : '') + '"' + (ro || n < r[0] ? ' disabled' : '') + '>' + n + '人</button>'; }).join('');
  var nCpu = Math.max(0, Math.max(o.np, v.seats.length) - v.seats.length);
  $('cpuList').innerHTML = nCpu ? o.cpu.slice(0, nCpu).map(function (c, i) {
    var ch = CH[c.ch];
    if (ro) return '<div class="crow"><span class="fc">' + ch.e + '</span><span class="nm">' + ch.name + '</span><span class="lv ' + c.lv + '">' + LV[c.lv] + '</span></div>';
    return '<div class="crow"><span class="fc">' + ch.e + '</span><select data-c="' + i + '" data-k="ch">' + CH_KEYS.map(function (k) { return '<option value="' + k + '"' + (k === c.ch ? ' selected' : '') + '>' + CH[k].e + CH[k].name + '</option>'; }).join('') + '</select>' +
      '<select data-c="' + i + '" data-k="lv" class="' + c.lv + '">' + LV_KEYS.map(function (k) { return '<option value="' + k + '"' + (k === c.lv ? ' selected' : '') + '>' + LV[k] + '</option>'; }).join('') + '</select></div>';
  }).join('') : '<p class="hint">CPU なし（全員が人間）</p>';
  $('lvAllSeg').innerHTML = segHtml(LV_KEYS.map(function (k) { return [k, LV[k]]; }), '', ro);
  $('hanebashiSeg').innerHTML = segHtml([['1', '自動で見せる'], ['0', '毎回きく']], o.autoHanebashi ? '1' : '0', ro);
  $('startBtn').disabled = v.seats.some(function (s) { return !s.connected; }) && false;
}

// ================= ゲーム =================
var WHY_HAND = {
  monooki: function (n) { return '📦物置：捨てるカードを選ぶ（何枚でも）→ 同じ枚数を引く'; },
  zange: function (n) { return '🕯️懺悔室：追放するカードを <b>4枚まで</b> 選ぶ'; },
  jikeidan: function () { return '🗡️自警団：捨てる <b>貨幣</b> を1枚選ぶ'; },
  tetsuuchi: function () { return '⚒️鉄打ち場：捨てる銅貨を選ぶ（捨てたら🃏+1・しなくてもOK）'; },
  renkin: function () { return '⚗️錬金室：追放するカードを選ぶ（追放したら💰+2・しなくてもOK）'; },
  entaku: function () { return '🪑円卓の間：みんなに <b>見せる</b> カードを1枚選ぶ（手札に残る）'; },
  jujutsuDisc: function () { return '🔮呪術師：捨てるカードを1枚選ぶ'; },
  chozei: function () { return '📜徴税官：山札の上に置く <b>領地カード</b> を1枚選ぶ'; },
  ryogae: function () { return '⚖️両替商：追放する貨幣を選ぶ（そのコスト＋💰2・しなくてもOK）'; },
  wanashi: function (n) { return '🪤罠師：捨てるカードを <b>' + n.min + '枚</b> 選ぶ'; },
  tatenaoshi: function () { return '🏗️建て直し：追放するカードを1枚選ぶ'; },
  ekken: function () { return '👑謁見の間：使うアクションカードを選ぶ（⚡は減らない・しなくてもOK）'; },
  kinmyaku: function () { return '⛏️金脈さがし：追放する貨幣を選ぶ（しなくてもOK）'; },
  meikou: function () { return '🏺名工：山札の上に置くカードを1枚選ぶ'; }
};
var WHY_SUP = { bazaar: '🧺バザール（しなくてもOK）', daikugoya: '🪚大工小屋', tatenaoshi: '🏗️建て直し', kinmyaku: '⛏️金脈さがし', meikou: '🏺名工', daienkai: '🍗大宴会' };
function promptText(g, nd) {
  if (nd.k === 'hand') return (WHY_HAND[nd.why] || function () { return 'カードを選ぶ'; })(nd);
  if (nd.k === 'supply') return (WHY_SUP[nd.why] || '') + '：<b>💰' + nd.max + ' 以下</b>の' + (nd.filter === 'treasure' ? '貨幣' : 'カード') + 'を' + (nd.dest === 'hand' ? '<b>手札に</b>' : '') + 'もらう（光っている山をタップ）';
  return '';
}
function canBuyList(g) {
  var extra = g.bought ? 0 : (g.hand || []).reduce(function (s, c) { return s + (D[c].coin || 0); }, 0);
  var d = g.discount || 0; return { now: g.coins + d, max: g.coins + extra + d };
}
function renderGame(v) {
  var g = v.g, nd = g.need, mine = myNeed(g);
  if (ui.gameNo !== v.gameNo) { ui.gameNo = v.gameNo; ui.seenEv = 0; ui.k = -1; ui.endShown = -1; $('log').innerHTML = ''; }
  if (nd && nd.id !== ui.k) { ui.k = nd.id; ui.sel = []; ui.focus = -1; ui.fate = nd.cards ? nd.cards.map(function () { return 'keep'; }) : []; ui.order = 0; closeSheets(); }
  if (!nd) closeSheets();
  // 覚醒の演出（ゲーム開始時）
  if (g.ultra && g.wait > 0 && ui.awakenFor !== v.gameNo) { ui.awakenFor = v.gameNo; awaken(g.ultra); }
  // 上のバー
  var cur = g.turn, curName = pname(g, cur);
  $('phLabel').innerHTML = g.wait ? (g.ultra ? '😎 アストラウルトラが作戦を考え中… ' + Math.round((g.uprog || 0) * 100) + '%' : 'まもなく開始…') :
    g.over ? '🏁 ゲーム終了' : 'ターン' + Math.max(1, g.P[cur].turns) + '｜' + esc(curName) + (cur === g.me ? 'の番！' : 'の番');
  // プレイヤー
  $('players').innerHTML = g.P.map(function (P, p) {
    var o = g.owners[p], cls = 'pr' + (p === cur && !g.over ? ' cur' : '') + (p === g.me ? ' me' : '') + (o.kind === 'cpu' && o.lv === 'ultra' ? ' ultra' : '') + (o.connected ? '' : ' off');
    return '<div class="' + cls + '" data-p="' + p + '"><div class="pn"><span class="fc">' + pface(g, p) + '</span>' + esc(p === g.me ? 'あなた' : o.name) + (g.thinking === p ? '<span class="think">…</span>' : '') + '</div>' +
      '<div class="pst"><b class="vp">★' + P.vp + '</b><span title="手札">✋' + P.nh + '</span><span title="山札">🂠' + P.nd + '</span><span class="dtop" title="捨て札の一番上">' + (P.top ? cemo(P.top) : '·') + '</span></div></div>';
  }).join('');
  // 横画面：上のバーに相手の状態（顔・★・手札・山札）
  $('oppBar').innerHTML = g.P.map(function (P, p) {
    if (p === g.me && g.me >= 0) return '';
    var o = g.owners[p], cls = 'op' + (p === cur && !g.over ? ' cur' : '') + (o.kind === 'cpu' && o.lv === 'ultra' ? ' ultra' : '') + (o.connected ? '' : ' off');
    return '<button class="' + cls + '" data-p="' + p + '"><span class="fc">' + pface(g, p) + '</span><span class="on"><b>' + esc(o.name) + (g.thinking === p ? '<i class="think">…</i>' : '') + '</b><span><em>★' + P.vp + '</em> ✋' + P.nh + ' 🂠' + P.nd + '</span></span></button>';
  }).join('');
  // 供給
  renderSupply(g, mine);
  // 場とカウンター
  var Pc = g.P[cur];
  if (isLand()) {
    $('playArea').innerHTML = (Pc.play.length ? '<div class="pcards">' + Pc.play.map(function (c) { return cardHtml(c, 'sm'); }).join('') + '</div>' : '') + (Pc.aside.length ? '<span class="aside">脇：' + minisOf(Pc.aside) + '</span>' : '');
    var Pm = g.me >= 0 ? g.P[g.me] : null;
    $('counters').innerHTML = '<div class="tok"><span class="tk ta" title="アクション"><b>' + (g.phase === 'action' ? g.actions : 0) + '</b><small>アクション</small></span><span class="tk tb" title="購入"><b>' + g.buys + '</b><small>購入</small></span><span class="tk tc" title="コイン"><b>' + g.coins + '</b><small>コイン</small></span></div>' +
      (Pm ? '<div class="mypiles"><button class="pl mydeck" data-p="' + g.me + '">' + cardHtml(null, 'xs') + '<b>' + Pm.nd + '</b><small>山札</small></button><button class="pl mydisc" data-p="' + g.me + '">' + (Pm.top ? cardHtml(Pm.top, 'xs') : '<span class="cd xs emptyd"></span>') + '<b>' + (Pm.ndisc || 0) + '</b><small>捨て札</small></button>' +
        '<button class="pl" id="trashBtn">' + '<span class="cd xs trashC">🗑️</span><b>' + g.trash.length + '</b><small>追放</small></button></div><div class="mevp" data-p="' + g.me + '">' + pface(g, g.me) + ' あなた <b>★' + Pm.vp + '</b></div>' : '');
  } else {
    $('playArea').innerHTML = (Pc.play.length ? minisOf(Pc.play) : '<span class="none">場：まだ何も出ていません</span>') + (Pc.aside.length ? '<span class="aside">脇：' + minisOf(Pc.aside) + '</span>' : '');
    $('counters').innerHTML = '<span title="アクション">⚡' + (g.phase === 'action' ? g.actions : 0) + '</span><span title="購入">🛒' + g.buys + '</span><span class="coin" title="お金">💰' + g.coins + '</span>';
  }
  // ログ
  renderLog(g);
  // CPU のセリフ
  if (g.say && g.say.id !== ui.sayId) { ui.sayId = g.say.id; var o2 = g.owners[g.say.p]; if (o2) bubble(o2.e + ' ' + g.say.text, o2.lv === 'ultra'); }
  // 案内とボタン
  renderPrompt(g, nd, mine);
  renderHand(g, nd, mine);
  renderSheets(g, nd, mine);
  if (g.over && ui.endShown !== v.gameNo) { ui.endShown = v.gameNo; popMsg('🏁 ゲーム終了！', 'info'); }
}
function renderSupply(g, mine) {
  var nd = g.need, ks = L.sortK(g.kingdom), base = ['copper', 'silver', 'gold', 'shoryo', 'hakuryo', 'oukan', 'curse'];
  var b = mine && nd.k === 'buy' && g.buys > 0 ? canBuyList(g) : null;
  function tile(c, big) {
    var n = g.supply[c], cls = n ? '' : 'empty', cost = D[c].cost;
    if (b && n && cost <= b.max) cls += cost <= b.now ? ' can' : ' can2';
    if (mine && nd.k === 'supply' && n && cost <= nd.max && L.matches(c, nd.filter)) cls += ' can';
    return pileHtml(c, n, cls);
  }
  $('supK').innerHTML = ks.map(function (c) { return tile(c, true); }).join('');
  if (isLand()) base = ['gold', 'oukan', 'silver', 'hakuryo', 'copper', 'shoryo', 'curse'];   // 横画面：左の列に 財宝｜勝利点 の2列
  $('supB').innerHTML = base.map(function (c) { return tile(c); }).join('') + (isLand() ? '' : '<button class="pile trashP" id="trashBtn" style="--rc:#6b6b74"><span class="cb">追放</span><span class="art"><b class="m">🗑️</b></span><span class="n">' + g.trash.length + '</span></button>');
}
function evText(g, e) {
  var n = function (p) { return '<b>' + esc(pname(g, p)) + '</b>'; }, mine = e.mine, list = function (a) { return a.map(cb).join(''); };
  switch (e.k) {
    case 'turn': return { s: 'sys', t: '― ' + esc(pname(g, e.p)) + ' の番（' + e.n + '手番目）―' };
    case 'play': return { t: n(e.p) + '：' + cb(e.c) + ' を使った' + (e.via === 'ekken' ? '（' + e.n + '回目）' : e.via === 'kosho' ? '（小姓から）' : '') };
    case 'treasures': return { t: n(e.p) + '：' + list(e.cards) + ' を出した' };
    case 'gain': return { t: n(e.p) + (e.why === 'buy' ? ' が ' + cb(e.c) + ' を買った' : ' が ' + cb(e.c) + ' を' + (e.dest === 'hand' ? '手札に' : e.dest === 'deck' ? '山札の上に' : '') + 'もらった' + (e.fromTrash ? '（追放置き場から）' : '')), s: e.c === 'oukan' ? 'big' : e.c === 'curse' ? 'bad' : '' };
    case 'draw': return { t: n(e.p) + ' は ' + e.n + '枚引いた' + (mine ? '：' + list(mine.cards) : ''), s: 'dim' };
    case 'shuffle': return { t: n(e.p) + ' の捨て札を切って 新しい山札に', s: 'dim' };
    case 'trash': return { t: n(e.p) + ' は ' + list(e.cards) + ' を追放', s: 'bad' };
    case 'discard': return { t: n(e.p) + ' は ' + e.n + '枚捨てた' + (e.open ? '：' + list(e.open) : mine ? '：' + list(mine.cards) : e.top ? '（いちばん上 ' + cb(e.top) + '）' : '') };
    case 'topdeck': return { t: n(e.p) + ' は 1枚を山札の上に置いた' + (e.c ? '：' + cb(e.c) : mine ? '：' + list(mine.cards) : '') };
    case 'revealHand': return { t: n(e.p) + ' の手札（領地なし）：' + list(e.cards) };
    case 'show': return { t: n(e.p) + (e.why === 'jikeidan' ? ' の手札（貨幣なし）：' : ' が手札から見せた：') + list(e.cards) };
    case 'reveal': return { t: n(e.p) + ' の山札の上：' + (e.cards.length ? list(e.cards) : 'なし') };
    case 'hanebashi': return { t: n(e.p) + ' は ' + cb('hanebashi') + ' を見せて攻撃をふせいだ', s: 'good' };
    case 'aside': return { t: n(e.p) + ' は ' + cb(e.c) + ' を脇によけた' };
    case 'kosho': return { t: n(e.p) + ' の山札の上 ' + cb(e.c) + ' を捨て札に' };
    case 'monomiDone': return { t: n(e.p) + '：物見やぐらで 追放' + e.nt + '・捨て札' + e.nd + '・戻す' + e.nk };
    case 'deckToDisc': return { t: n(e.p) + ' は 山札' + e.n + '枚を まとめて捨て札に' };
    case 'putBack': return { t: n(e.p) + ' の ' + cb(e.c) + ' は山札に戻った' };
    case 'nogain': return { t: n(e.p) + ' は もらえるカードがなかった', s: 'dim' };
    case 'over': return { s: 'sys', t: '🏁 ゲーム終了！' };
  }
  return null;
}
function renderLog(g) {
  var box = $('log'), add = '', newOnes = [];
  g.ev.forEach(function (e) { if (e.id > ui.seenEv) { newOnes.push(e); var x = evText(g, e); if (x) add += '<div class="ln ' + (x.s || '') + '">' + x.t + '</div>'; } });
  if (newOnes.length) {
    var first = ui.seenEv === 0; ui.seenEv = newOnes[newOnes.length - 1].id;
    box.insertAdjacentHTML('beforeend', add);
    while (box.children.length > 160) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
    if (!first) newOnes.forEach(function (e) { evFx(g, e); });
  }
}
function evFx(g, e) {
  if (e.k === 'turn' && e.p === g.me) { sfx.turn(); popMsg('あなたの番！', 'good'); vibrate(30); }
  else if (e.k === 'gain' && e.c === 'oukan') { sfx.win(); if (e.p !== g.me) popMsg(pname(g, e.p) + ' が 🏰王冠領！', 'info'); }
  else if (e.k === 'gain' && e.c === 'curse' && e.p === g.me) { sfx.bust(); popMsg('🕸️ 呪いをもらった…', 'bad'); }
  else if (e.k === 'play' && L.isA(e.c, 'attack') && e.p !== g.me) { sfx.bust(); document.querySelectorAll('.pr[data-p="' + e.p + '"],.op[data-p="' + e.p + '"]').forEach(function (pr) { pr.classList.remove('hitfx'); void pr.offsetWidth; pr.classList.add('hitfx'); }); }
  else if (e.k === 'play' || e.k === 'gain') sfx.card();
  else if (e.k === 'shuffle') sfx.dice();
  else if (e.k === 'hanebashi') sfx.safe();
  if (e.k === 'play' && g.owners[e.p] && g.owners[e.p].lv === 'ultra' && L.isA(e.c, 'attack') && Math.random() < 0.5) cutin('ASTRA ULTRA', cname(e.c) + '！', g.owners[e.p].e);
}
function popMsg(t, cls) { var el = $('pop'); el.textContent = t; el.className = cls || 'info'; void el.offsetWidth; el.classList.add('go'); }
var bubT;
function bubble(t, ultra) { var b = $('bubble'); b.textContent = t; b.className = 'bubble' + (ultra ? ' ultra' : ''); void b.offsetWidth; b.classList.add('on'); clearTimeout(bubT); bubT = setTimeout(function () { b.classList.remove('on'); }, 3200); }
function btn(id, label, cls, dis) { return '<button class="pbtn ' + (cls || '') + '" data-b="' + id + '"' + (dis ? ' disabled' : '') + '>' + label + '</button>'; }
function renderPrompt(g, nd, mine) {
  var t = '', b = '';
  if (g.wait) t = g.ultra ? '😎 アストラウルトラが この王国の作戦を自己対戦で研究中…' : '準備中…';
  else if (g.over) t = '🏁 結果発表まで少し待ってね';
  else if (!mine) {
    var w = nd ? nd.p : g.turn;
    t = nd && nd.p !== g.turn ? esc(pname(g, w)) + ' が選んでいます…' : esc(pname(g, w)) + ' の番です' + (g.thinking === w ? '（考え中…）' : '');
  } else if (nd.k === 'action') {
    var acts = g.hand.filter(function (c) { return L.isA(c, 'action'); }).length;
    if (ui.focus >= 0 && g.hand[ui.focus]) { var c = g.hand[ui.focus]; t = cb(c) + '<span class="sm">' + cardText(c).replace(/<hr>/g, ' ') + '</span>'; b = btn('cancel', 'やめる', 'ghost') + btn('play', '▶ 使う', 'main'); }
    else if (isLand()) { t = acts && g.actions > 0 ? '<b>アクション</b>　上にスワイプしてカードを使う' : '<b>アクション</b>　' + (acts ? 'アクションが残っていません' : 'アクションカードがありません'); b = btn('endAction', 'アクション終了', acts ? '' : 'main'); }
    else { t = '<b>A アクション</b>：使うカードをタップ（⚡' + g.actions + '）' + (acts ? '' : '<br><span class="sm">アクションカードがありません</span>'); b = btn('endAction', 'アクション終了 ▶', acts ? '' : 'main'); }
  } else if (nd.k === 'buy') {
    var tr = !g.bought && g.hand.some(function (c) { return L.isA(c, 'treasure'); });
    if (isLand()) { t = '<b>購入</b>　' + (tr ? '上にスワイプして財宝カードを使う・' : '') + '光っている山をタップして買う'; b = (tr ? btn('all', '財宝を<br>すべて使用', 'sub') : '') + btn('endTurn', '購入フェイズ<br>終了', tr ? '' : 'main'); }
    else {
    t = '<b>B 購入</b>：💰' + g.coins + '・🛒' + g.buys + '　光っている山をタップ' + (tr ? '<br><span class="sm">貨幣はタップで1枚ずつ出せます</span>' : '');
    b = (tr ? btn('all', 'すべての財宝を出す', 'sub') : '') + btn('endTurn', 'ターン終了', tr ? '' : 'main');
    }
  } else if (nd.k === 'hand') {
    t = promptText(g, nd) + '<span class="sm">選んだ数：' + ui.sel.length + (nd.min === nd.max ? ' / ' + nd.max : '（' + nd.min + '〜' + nd.max + '枚）') + '</span>';
    var okN = ui.sel.length >= nd.min && ui.sel.length <= nd.max;
    b = btn('handOk', ui.sel.length || nd.min ? '決定' : '選ばない', 'main', !okN);
  } else if (nd.k === 'supply') t = promptText(g, nd);
  else t = isLand() ? '👉 パネルで選んでください' : '👇 下のパネルで選んでください';
  $('prompt').innerHTML = '<div class="pt">' + t + '</div>' + (b ? '<div class="pb">' + b + '</div>' : '');
  $('prompt').classList.toggle('mine', !!mine);
}
function renderHand(g, nd, mine) {
  var h = g.hand || [], box = $('hand');
  if (g.me < 0) { box.innerHTML = '<div class="none">観戦中</div>'; return; }
  box.innerHTML = h.map(function (c, i) {
    var cls = '';
    if (mine) {
      if (nd.k === 'action' && L.isA(c, 'action') && g.actions > 0) cls = 'can';
      else if (nd.k === 'buy' && !g.bought && L.isA(c, 'treasure')) cls = 'can';
      else if (nd.k === 'hand') cls = L.matches(c, nd.filter) ? 'can' : 'no';
    }
    if (ui.sel.indexOf(i) >= 0) cls += ' sel'; if (ui.focus === i) cls += ' foc';
    return cardHtml(c, cls, ' data-i="' + i + '"');
  }).join('') || '<div class="none">手札なし</div>';
  box.style.setProperty('--n', Math.max(5, h.length));
  fanHand();
  $('handInfo').textContent = '手札 ' + h.length + '枚・山札 ' + g.P[g.me].nd + '枚';
}
// 横画面かどうか（スマホの横向き・PCの広い画面）
function isLand() { return document.body.classList.contains('land'); }
// 横画面：手札を扇形に重ねて並べる
function fanHand() {
  var box = $('hand'), cs = box.querySelectorAll('.cd'), n = cs.length, land = isLand();
  if (!land || !n) { box.style.removeProperty('--ov'); cs.forEach(function (el) { el.style.removeProperty('--r'); el.style.removeProperty('--y'); el.style.zIndex = ''; }); return; }
  var W = cs[0].offsetWidth, cw = box.clientWidth - W * 0.5, ov = n > 1 ? Math.max(W * 0.12, (n * W - cw) / (n - 1)) : 0;
  ov = Math.min(ov, W * 0.82); box.style.setProperty('--ov', ov.toFixed(1) + 'px');
  var step = Math.min(4, 26 / n), s = parseFloat(getComputedStyle(document.body).getPropertyValue('--s')) || 1;
  cs.forEach(function (el, i) { var t = i - (n - 1) / 2; el.style.setProperty('--r', (t * step).toFixed(2) + 'deg'); el.style.setProperty('--y', (t * t * 1.1 * s * Math.min(1, 7 / n)).toFixed(1) + 'px'); el.style.zIndex = i + 1; });
}
// ---- 選択パネル（はい/いいえ・カードを選ぶ・物見やぐら） ----
function closeSheets() { if (ui.cardSheet && !ui.sheetCtx) return; ui.cardSheet = false; ui.sheetCtx = null; overlay('choiceSheet', false); }   // 説明だけのシートは開いたまま
var YN = {
  hanebashi: function (nd, g) { return { q: cb('hanebashi') + ' を見せて、' + esc(pname(g, nd.by)) + ' の ' + cb(nd.src) + ' をふせぐ？', y: '見せる🌉', n: '見せない' }; },
  kosho: function (nd) { return { q: '🧒小姓：山札の上の ' + cb(nd.c) + ' をそのまま使う？（⚡は減りません）', y: '使う', n: '使わない', c: nd.c }; },
  shahon: function (nd) { return { q: '📚写本室：' + cb(nd.c) + ' を引いた。脇によける？（よけると 代わりに次を引く）', y: 'よける', n: '手札に入れる', c: nd.c }; },
  jujutsu: function (nd, g) { return { q: '🔮' + esc(pname(g, nd.by)) + ' の呪術師：呪いを1枚もらう？ それとも手札を1枚捨てる？', y: '手札を1枚捨てる', n: '呪いをもらう' }; },
  ekkenBack: function (nd) { return { q: '👑謁見の間：使った ' + cb(nd.c) + ' を山札の上に戻す？', y: '戻す', n: '戻さない', c: nd.c }; }
};
function renderSheets(g, nd, mine) {
  if (!mine || ['yn', 'pick', 'monomi'].indexOf(nd.k) < 0) { if ($('choiceSheet').classList.contains('active') && !ui.cardSheet) overlay('choiceSheet', false); return; }
  var h = '';
  if (nd.k === 'yn') {
    var y = (YN[nd.why] || function () { return { q: 'どうする？', y: 'はい', n: 'いいえ' }; })(nd, g);
    h = '<div class="chHead">' + (y.c ? cardHtml(y.c) : '') + '<div class="q">' + y.q + '</div></div>' + (y.c ? '<div class="sm2">' + cardText(y.c) + '</div>' : '') +
      '<div class="row">' + btn('no', y.n) + btn('yes', y.y, 'main') + '</div>';
  } else if (nd.k === 'pick') {
    var q = { hayauma: '🐎早馬：捨て札から 山札の上に置くカードを選ぶ（しなくてもOK）', yatou: '🏴野盗：追放する貨幣を選ぶ（残りは捨て札）', kaitou: '🦹怪盗：' + esc(pname(g, nd.who)) + ' の、追放する貨幣を選ぶ', kaitouGain: '🦹怪盗：追放した中から もらうカードを選ぶ（いくつでも）' }[nd.why] || '選んでください';
    h = '<div class="q">' + q + '</div><div class="pickCards">' + nd.cards.map(function (c, i) {
      var ok = !nd.only || nd.only.indexOf(i) >= 0;
      return cardHtml(c, (ok ? 'can' : 'no') + (ui.sel.indexOf(i) >= 0 ? ' sel' : ''), ' data-pk="' + i + '"');
    }).join('') + '</div><div class="sm2">選んだ数：' + ui.sel.length + '（' + nd.min + '〜' + nd.max + '）</div><div class="row">' + btn('pickOk', ui.sel.length ? '決定' : '選ばない', 'main', ui.sel.length < nd.min || ui.sel.length > nd.max) + '</div>';
  } else if (nd.k === 'monomi') {
    var F = [['trash', '追放'], ['discard', '捨て札'], ['keep', '戻す']];
    h = '<div class="q">🔭物見やぐら：山札の上のカードを それぞれ どうする？</div><div class="monomi">' + nd.cards.map(function (c, i) {
      return '<div class="sRow">' + cardHtml(c) + '<div class="seg">' + F.map(function (f) { return '<button data-sf="' + i + ':' + f[0] + '" class="' + (ui.fate[i] === f[0] ? 'on' : '') + '">' + f[1] + '</button>'; }).join('') + '</div></div>';
    }).join('') + '</div>';
    var keeps = ui.fate.map(function (f, i) { return f === 'keep' ? i : -1; }).filter(function (i) { return i >= 0; });
    if (keeps.length === 2) h += '<div class="sm2">いちばん上にするのは：</div><div class="seg">' + keeps.map(function (i, j) { return '<button data-so="' + j + '" class="' + (ui.order === j ? 'on' : '') + '">' + cemo(nd.cards[i]) + cname(nd.cards[i]) + '</button>'; }).join('') + '</div>';
    h += '<div class="row" style="margin-top:8px">' + btn('monomiOk', '決定', 'main') + '</div>';
  }
  ui.cardSheet = false; ui.sheetCtx = null;
  $('choiceBox').innerHTML = h; overlay('choiceSheet', true);
}
// ---- カードの詳しい説明（供給・手札のカードをタップ） ----
function openCard(c, ctx) {
  var g = lastView && lastView.g, n = g && g.supply ? g.supply[c] : null, h = '';
  h = '<div class="chHead">' + cardHtml(c, 'big') + '<div><h4>' + cemo(c) + ' ' + cname(c) + '</h4><div class="sm2">コスト 💰' + D[c].cost + '・' + ctypes(c) + (n != null ? '・残り ' + n + '枚' : '') + (D[c].ed === 1 ? '・初版' : '') + '</div></div></div><div class="ctxt">' + cardText(c) + '</div>';
  var b = '';
  if (ctx === 'buy') { var cb2 = canBuyList(g), cost = Math.max(0, D[c].cost - (g.discount || 0)); b = btn('buyGo', (cost > cb2.now ? '財宝を出して ' : '') + '買う（💰' + cost + '）', 'main'); }
  else if (ctx === 'gain') b = btn('gainGo', 'これをもらう', 'main');
  h += '<div class="row" style="margin-top:10px">' + btn('closeCard', 'とじる') + b + '</div>';
  ui.cardSheet = c; ui.sheetCtx = ctx || null; $('choiceBox').innerHTML = h; overlay('choiceSheet', true);
}
// ================= 結果 =================
function renderEnd(v) {
  var g = v.g, r = g.result; if (!r) return;
  var order = r.scores.map(function (s, p) { return p; }).sort(function (a, b) { return r.scores[b] - r.scores[a] || g.P[a].turns - g.P[b].turns; });
  var md = ['🥇', '🥈', '🥉', '4️⃣'];
  $('endWhy').innerHTML = (r.why === 'oukan' ? '🏰 王冠領の山がなくなりました' : '🧺 供給の山が3つ空になりました' + (r.empty ? '（' + r.empty.map(function (c) { return cemo(c) + cname(c); }).join('・') + '）' : '')) + (r.tieBreak ? '<br>同点は 手番の少ない人の勝ち' : '');
  $('rankList').innerHTML = order.map(function (p, i) {
    var o = g.owners[p], win = r.winners.indexOf(p) >= 0, deck = g.decks ? g.decks[p] : g.P[p].own;
    return '<div class="rk' + (win ? ' first' : '') + '"><div class="rkTop"><span class="md">' + (win ? '👑' : md[i]) + '</span><span class="nm">' + pface(g, p) + ' ' + esc(pname(g, p)) + (o.kind === 'cpu' ? '<small>' + LV[o.lv] + '</small>' : '') + '</span><span class="sc">★' + r.scores[p] + '<small>' + g.P[p].turns + '手番・' + g.P[p].total + '枚</small></span></div><div class="deck">' + countsHtml(deck) + '</div></div>';
  }).join('');
  var meWin = g.me >= 0 && r.winners.indexOf(g.me) >= 0;
  $('endTitle').textContent = g.me < 0 ? '🏆 けっか' : meWin ? (r.winners.length > 1 ? '🤝 いっしょに勝ち！' : '🎉 あなたの勝ち！') : '🏆 けっか';
  $('endKingdom').innerHTML = '王国：' + L.sortK(g.kingdom).map(function (c) { return cemo(c) + cname(c); }).join('・');
  if (ui.endFx !== v.gameNo) { ui.endFx = v.gameNo; if (meWin) { confetti(80); sfx.win(); } }
}
