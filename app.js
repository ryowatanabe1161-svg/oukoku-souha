/* 王国争覇：流れ・ボタン操作・タイトル（最後に読み込む） */
'use strict';
window.__ll = { bgm: function () { return BGM.state(); }, view: null, autoplay: false,
  act: function (v) { act(v); }, awaken: function (c) { awaken(c); }, cutin: cutin,
  role: function () { return host ? 'host' : client ? 'client' : 'none'; }, hostRoom: function () { return host ? host.room : null; }, refresh: function () { if (host) hostBroadcast(); } };

// ---- 操作（ホストも参加者も同じ入口）。v は判断の答え（logic.js の act に渡す形） ----
function act(val) {
  var v = lastView; if (!v || v.phase !== 'game' || !v.g) return;
  unlockAudio();
  var m = { t: 'act', a: 'need', v: val, g: v.gameNo, k: v.g.k };
  if (host) { var err = hostAction(1, m); if (err) toast(err); return; }
  var key = m.k + ':' + JSON.stringify(val);
  if (pending === key) return;
  if (send(m)) { pending = key; }
}
function rerender() { if (lastView) render(lastView); }
// ---- 手札 ----
$('hand').addEventListener('click', function (e) {
  var el = e.target.closest('.cd[data-i]'); if (!el) return;
  if (Date.now() - swipedAt < 400) return;   // スワイプの直後のクリックは無視
  handTap(+el.dataset.i);
});
function handTap(i) {
  var g = lastView.g, c = g.hand[i], nd = g.need;
  if (!myNeed(g)) return openCard(c);
  if (nd.k === 'action') {
    if (!L.isA(c, 'action') || g.actions < 1) return openCard(c);
    if (ui.focus === i) { ui.focus = -1; act({ a: 'play', i: i }); } else { ui.focus = i; rerender(); }
  } else if (nd.k === 'buy') {
    if (!g.bought && L.isA(c, 'treasure')) act({ a: 'treasure', i: i }); else openCard(c);
  } else if (nd.k === 'hand') {
    if (!L.matches(c, nd.filter)) return openCard(c);
    var j = ui.sel.indexOf(i);
    if (j >= 0) ui.sel.splice(j, 1); else if (nd.max === 1) ui.sel = [i]; else if (ui.sel.length < nd.max) ui.sel.push(i); else toast(nd.max + '枚までです');
    rerender();
  } else openCard(c);
}
// 上にスワイプ（ドラッグ）して使う：アクションは確認なしで使う・財宝は出す・選ぶ場面では選ぶ
function handSwipe(i) {
  var g = lastView && lastView.g; if (!g || !myNeed(g)) return false;
  var c = g.hand[i], nd = g.need;
  if (nd.k === 'action' && L.isA(c, 'action') && g.actions > 0) { ui.focus = -1; act({ a: 'play', i: i }); return true; }
  if (nd.k === 'buy' && !g.bought && L.isA(c, 'treasure')) { act({ a: 'treasure', i: i }); return true; }
  if (nd.k === 'hand' && L.matches(c, nd.filter)) { if (ui.sel.indexOf(i) < 0) handTap(i); return true; }
  return false;
}
var drag = null, swipedAt = 0;
$('hand').addEventListener('pointerdown', function (e) {
  var el = e.target.closest('.cd[data-i]'); if (!el || (e.pointerType === 'mouse' && e.button !== 0)) return;
  drag = { el: el, i: +el.dataset.i, x0: e.clientX, y0: e.clientY, id: e.pointerId, moved: false, base: getComputedStyle(el).transform };
});
document.addEventListener('pointermove', function (e) {
  if (!drag || e.pointerId !== drag.id) return;
  var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
  if (!drag.moved) {
    if (Math.abs(dy) < 10 || Math.abs(dy) < Math.abs(dx)) { if (Math.abs(dx) > 14) drag = null; return; }   // 横の動きは手札のスクロールに任せる
    drag.moved = true; drag.el.classList.add('drag');
    try { drag.el.setPointerCapture(e.pointerId); } catch (er) { }
  }
  var up = Math.min(0, dy);
  drag.el.style.transform = 'translate(' + dx * 0.35 + 'px,' + up + 'px) rotate(0deg) scale(' + (1 + Math.min(0.12, -up / 600)) + ')';
  drag.el.classList.toggle('armed', up < -45);
});
function endDrag(e, cancel) {
  if (!drag || (e && e.pointerId !== drag.id)) return;
  var d = drag; drag = null;
  if (!d.moved) return;
  swipedAt = Date.now();
  var dy = e ? e.clientY - d.y0 : 0;
  d.el.classList.remove('drag', 'armed'); d.el.style.transform = '';
  if (!cancel && dy < -45) { if (!handSwipe(d.i)) toast('このカードは今は使えません'); }
}
document.addEventListener('pointerup', function (e) { endDrag(e, false); });
document.addEventListener('pointercancel', function (e) { endDrag(e, true); });
// ---- 案内のボタン ----
$('prompt').addEventListener('click', function (e) {
  var b = e.target.closest('button[data-b]'); if (!b || b.disabled) return;
  var g = lastView.g, k = b.dataset.b;
  if (k === 'play') { var i = ui.focus; ui.focus = -1; act({ a: 'play', i: i }); }
  else if (k === 'cancel') { ui.focus = -1; rerender(); }
  else if (k === 'endAction') act({ a: 'end' });
  else if (k === 'all') act({ a: 'all' });
  else if (k === 'endTurn') {
    var cbl = canBuyList(g), left = g.buys > 0 && !g.bought && cbl.max >= 3;
    if (left) confirmBox('ターンを終えますか？', 'まだ 💰' + cbl.max + ' ぶん 買い物ができます。', 'ターン終了', function () { act({ a: 'end' }); });
    else act({ a: 'end' });
  } else if (k === 'handOk') act({ sel: ui.sel.slice() });
});
// ---- 供給 ----
document.addEventListener('click', function (e) {
  if (e.target.closest('#trashBtn')) { var g0 = lastView.g; ui.cardSheet = 'trash'; ui.sheetCtx = null; $('choiceBox').innerHTML = '<h4 style="margin:0 0 6px">🗑️ 追放置き場（' + g0.trash.length + '枚）</h4><div class="deck">' + (g0.trash.length ? countsHtml(L.counts(g0.trash)) : 'まだ ありません') + '</div><div class="row" style="margin-top:10px">' + btn('closeCard', 'とじる') + '</div>'; overlay('choiceSheet', true); return; }
});
$('supply').addEventListener('click', function (e) {
  var t = e.target.closest('.pile[data-c]'); if (!t) return;
  var g = lastView.g, c = t.dataset.c, nd = g.need;
  if (myNeed(g) && nd.k === 'buy' && g.buys > 0 && g.supply[c] > 0 && D[c].cost <= canBuyList(g).max) return openCard(c, 'buy');
  if (myNeed(g) && nd.k === 'supply' && g.supply[c] > 0 && D[c].cost <= nd.max && L.matches(c, nd.filter)) return openCard(c, 'gain');
  openCard(c);
});
// ---- 選択パネル ----
$('choiceBox').addEventListener('click', function (e) {
  var g = lastView && lastView.g, nd = g && g.need, b = e.target.closest('button'), pk = e.target.closest('[data-pk]');
  if (pk && nd && nd.k === 'pick') {
    var i = +pk.dataset.pk; if (nd.only && nd.only.indexOf(i) < 0) return;
    var j = ui.sel.indexOf(i); if (j >= 0) ui.sel.splice(j, 1); else if (nd.max === 1) ui.sel = [i]; else if (ui.sel.length < nd.max) ui.sel.push(i);
    renderSheets(g, nd, myNeed(g)); return;
  }
  if (!b || b.disabled) return;
  if (b.dataset.sf) { var f = b.dataset.sf.split(':'); ui.fate[+f[0]] = f[1]; ui.order = 0; renderSheets(g, nd, true); return; }
  if (b.dataset.so) { ui.order = +b.dataset.so; renderSheets(g, nd, true); return; }
  var k = b.dataset.b;
  if (k === 'closeCard') { ui.cardSheet = false; overlay('choiceSheet', false); rerender(); }
  else if (k === 'buyGo') { var c = ui.cardSheet; ui.cardSheet = false; overlay('choiceSheet', false); act({ a: 'buy', c: c, auto: true }); }
  else if (k === 'gainGo') { var c2 = ui.cardSheet; ui.cardSheet = false; overlay('choiceSheet', false); act({ c: c2 }); }
  else if (k === 'yes' || k === 'no') act({ y: k === 'yes' });
  else if (k === 'pickOk') act({ sel: ui.sel.slice() });
  else if (k === 'monomiOk') {
    var keeps = ui.fate.map(function (x, i) { return x === 'keep' ? i : -1; }).filter(function (i) { return i >= 0; });
    if (keeps.length === 2 && ui.order === 1) keeps.reverse();
    act({ fate: ui.fate.slice(), order: keeps });
  }
});
$('choiceSheet').addEventListener('click', function (e) { if (e.target === this && ui.cardSheet) { ui.cardSheet = false; overlay('choiceSheet', false); rerender(); } });
function playerClick(e) {
  var pr = e.target.closest('[data-p]'); if (!pr || !lastView || !lastView.g) return;
  var g = lastView.g, p = +pr.dataset.p, P = g.P[p];
  ui.cardSheet = 'player'; ui.sheetCtx = null;
  $('choiceBox').innerHTML = '<h4 style="margin:0 0 4px">' + pface(g, p) + ' ' + esc(pname(g, p)) + '</h4><div class="sm2">★' + P.vp + '・持っているカード ' + P.total + '枚（手札' + P.nh + '・山札' + P.nd + '）・' + P.turns + '手番' + (g.owners[p].kind === 'cpu' ? '・' + LV[g.owners[p].lv] : '') + '</div>' +
    '<div class="deck">' + countsHtml(P.own) + '</div><p class="hint">持っているカードの内訳は、もらった・追放したカードが全員に見えるので公開しています（並び・手札の中身は秘密）。</p><div class="row">' + btn('closeCard', 'とじる') + '</div>';
  overlay('choiceSheet', true);
}
$('players').addEventListener('click', playerClick);
$('oppBar').addEventListener('click', playerClick);
$('counters').addEventListener('click', function (e) { if (!e.target.closest('#trashBtn')) playerClick(e); });
$('logBtnL').onclick = function () { $('logToggle').onclick(); };
$('logToggle').onclick = function () { ui.logOpen = !ui.logOpen; document.body.classList.toggle('logOpen', ui.logOpen); var l = $('log'); l.scrollTop = l.scrollHeight; };
// ---- ホストのロビー操作 ----
$('seatList').addEventListener('click', function (e) {
  var b = e.target.closest('button[data-sid]'); if (!b || !host) return;
  var R = host.room, seat = seatBySid(+b.dataset.sid);
  if (!seat || seat.kind !== 'remote' || R.phase !== 'lobby') return;
  var doRemove = function () {
    var c = host.conns[seat.clientId]; if (c) { try { c.send({ t: 'kicked' }); } catch (x) {} setTimeout(function () { try { c.close(); } catch (x) {} }, 300); delete host.conns[seat.clientId]; }
    R.seats.splice(R.seats.indexOf(seat), 1); hostBroadcast();
  };
  if (seat.connected) confirmBox(seat.name + 'を外しますか？', '部屋から退出させます。', '外す', doRemove); else doRemove();
});
$('cpuList').addEventListener('change', function (e) {
  var s = e.target.closest('select[data-c]'); if (!s || !host || host.room.phase !== 'lobby') return;
  var cpu = host.room.opts.cpu, i = +s.dataset.c;
  if (s.dataset.k === 'lv' && LV_KEYS.indexOf(s.value) >= 0) cpu[i].lv = s.value;
  if (s.dataset.k === 'ch' && CH[s.value]) { var j = cpu.map(function (c) { return c.ch; }).indexOf(s.value); if (j >= 0 && j !== i) cpu[j].ch = cpu[i].ch; cpu[i].ch = s.value; }   // 同じキャラは入れかえ
  hostBroadcast();
});
function segClick(id, fn) { $(id).addEventListener('click', function (e) { var b = e.target.closest('button[data-v]'); if (!b || b.disabled || !host || host.room.phase !== 'lobby') return; fn(b.dataset.v); hostBroadcast(); }); }
segClick('lvAllSeg', function (v) { host.room.opts.cpu.forEach(function (c) { c.lv = v; }); });
segClick('npSeg', function (v) { if (+v >= host.room.seats.length) host.room.opts.np = +v; });
segClick('kmodeSeg', function (v) { var o = host.room.opts; o.kmode = v; if (v === 'random' && o.kingdom.length !== 10) rollKingdom(); });
segClick('ed1Seg', function (v) {
  var o = host.room.opts; o.ed1 = v === '1';
  if (!o.ed1) { o.pick = o.pick.filter(function (c) { return D[c].ed === 2; }); var s = L.SETS.filter(function (x) { return x.id === o.set; })[0]; if (s && s.ed === 1) o.set = 'first'; }
  if (o.kmode === 'random') rollKingdom();
});
segClick('setList', function (v) { host.room.opts.set = v; });
segClick('hanebashiSeg', function (v) { host.room.opts.autoHanebashi = v === '1'; });
$('rollBtn').onclick = function () { if (host && host.room.phase === 'lobby') { rollKingdom(); sfx.dice(); hostBroadcast(); } };
$('customGrid').addEventListener('click', function (e) {
  var b = e.target.closest('button[data-c]'); if (!b || !host || host.room.phase !== 'lobby') return;
  var o = host.room.opts, c = b.dataset.c, i = o.pick.indexOf(c);
  if (i >= 0) o.pick.splice(i, 1); else if (o.pick.length < 10) o.pick.push(c); else toast('10種類まで選べます');
  hostBroadcast();
});
$('customGrid').addEventListener('contextmenu', function (e) { var b = e.target.closest('button[data-c]'); if (b) { e.preventDefault(); openCard(b.dataset.c); } });
$('kPreview').addEventListener('click', function (e) { var b = e.target.closest('[data-info]'); if (b) openCard(b.dataset.info); });
$('startBtn').onclick = function () { if (host) { unlockAudio(); hostStartGame(false); } };
$('againBtn').onclick = function () { if (host && host.room.phase === 'end') hostStartGame(true); };
$('toLobbyBtn').onclick = function () { if (host && host.room.phase === 'end') hostToLobby('ロビーに戻りました'); };
function copyUrl() {
  var u = $('inviteUrl').textContent;
  function legacy() { try { var ta = document.createElement('textarea'); ta.value = u; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'; document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, u.length); var ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e) { return false; } }
  var p = navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(u) : Promise.reject();
  p.then(function () { toast('招待URLをコピーしました'); }, function () { toast(legacy() ? '招待URLをコピーしました' : 'URLを長押ししてコピーしてください'); });
}
$('copyBtn').onclick = copyUrl;
$('shareBtn').onclick = function () {
  var data = { title: GAME_TITLE, text: 'いっしょに「' + GAME_TITLE + '」で遊ぼう！ 部屋コード ' + $('codeBig').textContent, url: $('inviteUrl').textContent };
  if (!navigator.share || (navigator.canShare && !navigator.canShare(data))) return copyUrl();
  try { navigator.share(data).catch(function (e) { if (!e || e.name !== 'AbortError') copyUrl(); }); } catch (e) { copyUrl(); }
};
// ---- 退出・メニュー ----
function leaveRoom() {
  if (host) {
    var solo = host.room.solo;
    confirmBox(solo ? 'ゲームをやめますか？' : '部屋を閉じますか？', solo ? 'タイトルに戻ります。' : '参加者全員の接続が切れ、ゲームは終了します。', solo ? 'やめる' : '部屋を閉じる', function () {
      Object.keys(host.conns).forEach(function (cid) { try { host.conns[cid].send({ t: 'closed' }); } catch (e) {} });
      store(LS_HOST, null);
      setTimeout(function () { try { if (host.peer) host.peer.destroy(); } catch (e) {} location.href = location.pathname + location.search.replace(/([?&])room=[^&]*/, '$1'); }, 300);
    });
  } else confirmBox('部屋を出ますか？', 'ゲーム中に出た場合も、同じニックネームで入り直せば元の席に戻れます。', '部屋を出る', function () { sstore(SS_CLIENT, null); leaveClient(true); });
}
$('leaveBtn1').onclick = $('leaveBtn2').onclick = leaveRoom;
$('menuBtn').onclick = function () { overlay('menuModal', true); };
function confirmAbort() {
  confirmBox('中断してロビーに戻りますか？', 'いまのゲームを終了して、全員をこの部屋のロビーに戻します。部屋コード・参加者・設定はそのままです。', '中断してロビーへ', function () {
    if (host && host.room.phase !== 'lobby') hostToLobby('⏸️ ホストがゲームを中断しました');
  });
}
$('menuAbort').onclick = function () { overlay('menuModal', false); confirmAbort(); };
$('menuReq').onclick = function () { overlay('menuModal', false); if (send({ t: 'lobbyReq' })) toast('ホストに「ロビーに戻りたい」と伝えました'); };
$('menuLeave').onclick = function () { overlay('menuModal', false); leaveRoom(); };
function openRules() { $('rulesList').innerHTML = rulesHtml(); overlay('rulesModal', true); }
$('rulesBtn1').onclick = $('rulesBtn2').onclick = openRules;
$('menuRules').onclick = function () { overlay('menuModal', false); openRules(); };
$('rulesClose').onclick = function () { overlay('rulesModal', false); };
function renderRef() {
  var g = lastView && lastView.g, ed1 = g ? g.kingdom.some(function (c) { return D[c].ed === 1; }) : true;
  var list = g ? ['copper', 'silver', 'gold', 'shoryo', 'hakuryo', 'oukan', 'curse'].concat(L.sortK(g.kingdom)) : ['copper', 'silver', 'gold', 'shoryo', 'hakuryo', 'oukan', 'curse'].concat(L.sortK(L.pool(true)));
  $('refNote').textContent = g ? 'このゲームで使うカード（残り枚数つき）' : '全カード（第2版の26種＋初版の6種）';
  $('refList').innerHTML = list.map(function (c) { return '<div class="refRow">' + cardHtml(c) + '<div class="tx"><h4>' + cemo(c) + cname(c) + '<small>💰' + D[c].cost + (g ? '・残り' + g.supply[c] : '') + (D[c].ed === 1 ? '・初版' : '') + '</small></h4><div class="sm2">' + ctypes(c) + '</div>' + cardText(c) + '</div></div>'; }).join('');
}
$('refBtn1').onclick = $('refBtn2').onclick = $('menuRef').onclick = function () { overlay('menuModal', false); renderRef(); overlay('refModal', true); };
$('refClose').onclick = function () { overlay('refModal', false); };
['rulesModal', 'menuModal', 'refModal'].forEach(function (id) { $(id).addEventListener('click', function (e) { if (e.target === this) overlay(id, false); }); });
$('menuClose').onclick = function () { overlay('menuModal', false); };
$('lobbyReqBar').addEventListener('click', function (e) {
  var b = e.target.closest('button[data-lr]'); if (!b || !host) return;
  if (b.dataset.lr === 'no') { host.room.lobbyReq = null; hostBroadcast(); } else confirmAbort();
});
// ---------------- タイトル ----------------
function renderTitle() {
  if (!$('nameIn').value) $('nameIn').value = load(LS_NAME) || '';
  var inv = normCode(Q.get('room'));
  $('inviteJoinBox').style.display = inv.length === 4 ? '' : 'none';
  $('invCode').textContent = inv;
  if (inv.length === 4) $('codeIn').value = inv;
  var saved = load(LS_HOST, true), ok = saved && saved.room && Date.now() - saved.saved < 12 * 3600 * 1000;
  $('resumeBtn').style.display = ok ? '' : 'none';
  if (ok) $('resumeBtn').textContent = saved.room.solo ? '前回のひとり用ゲームを再開する' : '前回の部屋（' + saved.room.code + '）を再開する';
  var joined = sload(SS_CLIENT);
  $('rejoinBtn').style.display = joined ? '' : 'none';
  if (joined) $('rejoinBtn').textContent = '部屋 ' + joined.code + ' に戻る（' + joined.name + '）';
}
function getName(optional) {
  var n = cleanName($('nameIn').value);
  if (!n) { if (optional) return 'あなた'; toast('ニックネームを入力してください'); $('nameIn').focus(); return null; }
  store(LS_NAME, n); return n;
}
$('createBtn').onclick = function () { var n = getName(); if (n) { unlockAudio(); store(LS_HOST, null); startHost(n, null, false); } };
$('soloBtn').onclick = function () { var n = getName(true); unlockAudio(); store(LS_HOST, null); startHost(n, null, true); };
$('resumeBtn').onclick = function () {
  var saved = load(LS_HOST, true); if (!saved) return; unlockAudio();
  startHost(saved.room.seats[0].name, saved, saved.room.solo); host.resuming = true;
};
function join(code) {
  var n = getName(); if (!n) return;
  code = normCode(code);
  if (code.length !== 4) { toast('4文字の部屋コードを入力してください'); return; }
  unlockAudio(); startClient(code, n);
}
$('joinBtn').onclick = function () { join($('codeIn').value); };
$('joinInvitedBtn').onclick = function () { join(Q.get('room')); };
$('rejoinBtn').onclick = function () { var j = sload(SS_CLIENT); if (j) { $('nameIn').value = j.name; unlockAudio(); startClient(j.code, j.name); } };
$('codeIn').addEventListener('input', function () { this.value = normCode(this.value); });
if (location.protocol === 'file:') setTimeout(function () { toast('ファイルを直接開いています。招待URLは公開URL（https）でのみ使えます。'); }, 500);
// ---- ページ全体の引っぱり（バウンス・プルで閉じる・プルで再読み込み）とピンチを止める ----
var touch0 = null;
document.addEventListener('touchstart', function (e) { if (e.touches.length === 1) touch0 = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
document.addEventListener('touchmove', function (e) {
  if (!e.cancelable) return;
  if (e.touches.length > 1) { e.preventDefault(); return; }
  if (!touch0) return;
  var t = e.touches[0], dx = t.clientX - touch0.x, dy = t.clientY - touch0.y, ax = Math.abs(dx), ay = Math.abs(dy);
  if (!ax && !ay) return;
  for (var el = e.target; el && el.nodeType === 1 && el !== document.body; el = el.parentElement) {
    var cs = getComputedStyle(el);
    var canV = ay >= ax * 0.5 && /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1 && ((dy > 0 && el.scrollTop > 0) || (dy < 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1));
    var canH = ax >= ay * 0.5 && /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1 && ((dx > 0 && el.scrollLeft > 0) || (dx < 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1));
    if (canV || canH) return;
  }
  e.preventDefault();
}, { passive: false });
document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
// ---- 画面の向き：横長（スマホの横向き・PCの広い画面）は横画面のゲーム盤 ----
var rotHintDone = false;
function applyMode() {
  var w = window.innerWidth, h = window.innerHeight, land = w > h * 1.15 && w >= 560;
  if (Q.has('portrait')) land = false; if (Q.has('land')) land = true;
  var was = document.body.classList.contains('land');
  document.body.classList.toggle('land', land);
  document.body.style.setProperty('--s', Math.max(0.82, Math.min(2.1, h / 390, w / 760)).toFixed(3));
  document.body.style.setProperty('--sv', Math.max(0.82, Math.min(2.1, h / 390, w / 600)).toFixed(3));
  if (was !== land) { ui.focus = -1; rerender(); } else fanHand();
  maybeRotHint();
}
function maybeRotHint() {   // スマホを縦で遊んでいるときに一度だけ「横向きがおすすめ」
  if (rotHintDone || document.body.classList.contains('land') || window.innerWidth > 520 || !lastView || lastView.phase !== 'game') return;
  rotHintDone = true; var r = $('rotHint'); r.classList.remove('on'); void r.offsetWidth; r.classList.add('on');
}
window.addEventListener('resize', applyMode);
window.addEventListener('orientationchange', function () { setTimeout(applyMode, 120); });
applyMode();
// タイトルのカード
$('titleFan').innerHTML = cardHtml('shukuba') + cardHtml('gold') + '<span class="who">🐻<br>🐰</span>' + cardHtml('oukan') + cardHtml('jujutsu');
// テスト用：自動で選ぶ（window.__ll.autoplay = true）。見えている情報だけで単純に判断
function autoAnswer(g) {
  var nd = g.need, h = g.hand;
  switch (nd.k) {
    case 'action': { var i = h.findIndex(function (c) { return L.isA(c, 'action'); }); return i >= 0 && g.actions > 0 ? { a: 'play', i: i } : { a: 'end' }; }
    case 'buy': {
      if (!g.bought && h.some(function (c) { return L.isA(c, 'treasure'); })) return { a: 'all' };
      var pr = (window.__ll.buyList || ['oukan', 'gold', 'tetsuuchi', 'jikeidan', 'jujutsu', 'silver']).filter(function (c) { return g.supply[c] > 0 && D[c].cost <= g.coins && (window.__ll.buyAny || D[c].cost >= 3); });
      return pr.length && g.buys > 0 ? { a: 'buy', c: pr[0] } : { a: 'end' };
    }
    case 'hand': { var s = []; h.forEach(function (c, i) { if (s.length < nd.min && L.matches(c, nd.filter)) s.push(i); }); return { sel: s }; }
    case 'supply': { var o = Object.keys(g.supply).filter(function (c) { return g.supply[c] > 0 && D[c].cost <= nd.max && L.matches(c, nd.filter); }).sort(function (a, b) { return D[b].cost - D[a].cost; }); return { c: o[0] }; }
    case 'yn': return { y: (nd.why === 'hanebashi' && !window.__ll.noHanebashi) || nd.why === 'kosho' };
    case 'pick': return { sel: (nd.only || nd.cards.map(function (c, i) { return i; })).slice(0, nd.min) };
    case 'monomi': return { fate: nd.cards.map(function (c) { return c === 'curse' || c === 'shoryo' || c === 'copper' ? 'trash' : 'keep'; }), order: nd.cards.map(function (c, i) { return i; }).filter(function (i) { return ['curse', 'shoryo', 'copper'].indexOf(nd.cards[i]) < 0; }) };
  }
  return {};
}
setInterval(function () {
  var v = lastView; if (!window.__ll.autoplay || !v || v.phase !== 'game' || !v.g || pending) return;
  if (!myNeed(v.g)) return;
  var nd = v.g.need, hold = window.__ll.hold;   // テスト用：hold に入っている判断は止めて、画面を撮れるようにする
  if (hold && (hold.indexOf(nd.k + ':' + (nd.why || '')) >= 0 || hold.indexOf(nd.k) >= 0)) return;
  act(autoAnswer(v.g));
}, TURBO ? 60 : 400);
renderTitle();

// ---- ひろばの「みんなの部屋」：同じメンバーで自動入室＋ホストは「つぎのゲーム」 ----
if (PARTY) {
  FuuParty.init({ game: 'oukoku-souha',
    isHost: function () { return !!host && !host.room.solo; },
    inGame: function () { var R = host && host.room; return !!R && ['lobby', 'end', 'over', 'result'].indexOf(R.phase) < 0 && !(R.G && (R.G.over || R.G.phase === 'end' || R.G.phase === 'over')); },
    broadcast: function (m) { if (host) Object.keys(host.conns).forEach(function (cid) { try { host.conns[cid].send(m); } catch (e) {} }); } });
  FuuParty.status = function () { return host ? { host: 1, n: Object.keys(host.conns).filter(function (k) { return host.conns[k].open; }).length } : { host: 0, joined: !!(client && client.everJoined) }; };
  $('nameIn').value = cleanName(PARTY.name) || 'ななし';
  setTimeout(function () {
    if (PARTY.host) { store(LS_HOST, null); startHost(cleanName(PARTY.name) || 'ホスト', null, false); }
    else startClient(PARTY.code, cleanName(PARTY.name) || 'ななし');
  }, 50);
}
