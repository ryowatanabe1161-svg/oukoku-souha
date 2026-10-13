/* 王国争覇：共通の定数・小道具・汎用UI（ほかのスクリプトより先に読み込む）
 * 構成：WebRTC（PeerJS）による P2P。ホストのブラウザが唯一の正（authoritative）で、山札・手札・進行・CPUの思考はホストだけが持ちます。
 * 参加者の端末には「その人が見てよい情報」だけが送られます（他人の手札・山札の中身と並びは送らない）。
 */
'use strict';
var $ = function (id) { return document.getElementById(id); };
var L = window.KS, AI = window.KS_AI, D = L.D;
var Q = new URLSearchParams(location.search);
var CFG = window.KS_CONFIG || {};
var ICE = (CFG.iceServers && CFG.iceServers.length) ? CFG.iceServers : [{ urls: 'stun:stun.l.google.com:19302' }];
if (Q.get('ice')) ICE = Q.get('ice').split(',').map(function (u) { return { urls: u }; });   // テスト・独自環境用
var PEER_OPTS = Object.assign({ debug: 1, config: { iceServers: ICE } }, CFG.peer || {});
var ID_PREFIX = 'oukoku-v1-', CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
var TURBO = Q.has('turbo');
var T = TURBO ? { cpu: [40, 80], off: 1200, roundEnd: 1500, awaken: 2500, k: 0.12 } : { cpu: [450, 800], off: 12000, roundEnd: 3500, awaken: 7500, k: 1 };
var MAX_HUMANS = 4, HB_MS = 3000, LOST_MS = 10000;
var LV = { weak: '弱い', normal: '普通', strong: '強い', ultra: 'アストラウルトラ😎' };
var LV_KEYS = ['weak', 'normal', 'strong', 'ultra'];
var CH = {}; window.KS_CHARS.forEach(function (c) { CH[c.id] = c; });
var CH_KEYS = window.KS_CHARS.map(function (c) { return c.id; });
var GAME_TITLE = '王国争覇';
var LS_ID = 'ks-client-id', LS_NAME = 'ks-name', LS_HOST = 'ks-host-room', SS_CLIENT = 'ks-joined', LS_SOUND = 'ks-sound-off';
var host = null, client = null, lastView = null, pending = '';
function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {} }
function load(k, json) { try { var v = localStorage.getItem(k); return json ? JSON.parse(v) : v; } catch (e) { return null; } }
function sstore(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function sload(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } }
function rid(n) { var s = ''; for (var i = 0; i < n; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]; return s; }
var myId = load(LS_ID) || (function () { var v = rid(16); store(LS_ID, v); return v; })();
var soundOff = load(LS_SOUND) === '1';
function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function rand(a) { return a[0] + Math.random() * (a[1] - a[0]); }
function cleanName(n) { return String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 8); }
var PARTY = window.FuuParty && window.FuuParty.info;   // ひろばの「みんなの部屋」から来たとき
function genCode() { if (PARTY && PARTY.host) return PARTY.code; var c = ''; for (var i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return c; }
function normCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/I/g, '1').slice(0, 4); }
function inviteUrl(code) { var u = location.origin + location.pathname + '?room=' + code; if (Q.get('ice')) u += '&ice=' + encodeURIComponent(Q.get('ice')); return u; }
function fill(t, o) { return t.replace(/\{(\w+)\}/g, function (_, k) { return o[k] != null ? o[k] : ''; }); }

// ---------- カードの見た目（CSS＋絵文字。すべてオリジナル） ----------
var TYPE_N = { action: 'アクション', attack: '攻撃', reaction: '防御', treasure: '貨幣', victory: '領地', curse: '呪い' };
var TYPE_C = { action: '#8b6a45', attack: '#b23a2e', reaction: '#2c6db3', treasure: '#c08a12', victory: '#2f8a4a', curse: '#7a3a9e' };
function cname(c) { return D[c] ? D[c].n : '?'; }
function cemo(c) { return D[c] ? D[c].e : '❔'; }
function ccol(c) { var t = D[c].t; return TYPE_C[t.indexOf('attack') >= 0 ? 'attack' : t.indexOf('reaction') >= 0 ? 'reaction' : t.indexOf('victory') >= 0 ? 'victory' : t[0]]; }
function ccls(c) { var t = D[c].t; return 'k-' + (t.indexOf('treasure') >= 0 ? 'tr' : t.indexOf('victory') >= 0 ? 'vp' : t.indexOf('curse') >= 0 ? 'cu' : 'ac'); }
function ctypes(c) { return D[c].t.map(function (t) { return TYPE_N[t]; }).join('・'); }
function plusStr(c) {
  var d = D[c], p = d.plus || {}, a = [];
  if (d.coin) a.push('💰' + d.coin);
  if (c === 'yakusou') a.push('★？');
  else if (d.vp) a.push('★' + (d.vp < 0 ? '−' + (-d.vp) : d.vp));
  if (p.c) a.push('🃏+' + p.c); if (p.a) a.push('⚡+' + p.a); if (p.b) a.push('🛒+' + p.b); if (p.m) a.push('💰+' + p.m);
  return a.join(' ');
}
function cardText(c) {
  var d = D[c], p = d.plus || {}, li = [];
  if (p.c) li.push('<b>🃏 +' + p.c + '</b> カードを引く'); if (p.a) li.push('<b>⚡ +' + p.a + '</b> アクション'); if (p.b) li.push('<b>🛒 +' + p.b + '</b> 購入'); if (p.m) li.push('<b>💰 +' + p.m + '</b>');
  return (li.length ? '<div class="pls">' + li.join('<br>') + '</div>' : '') + (d.tx ? '<div class="ctx">' + d.tx + '</div>' : '');
}
function artOf(c) { return window.KS_ART ? window.KS_ART.artHtml(c) : '<div class="art sc-day"><b class="m">' + D[c].e + '</b></div>'; }
function cardHtml(c, cls, attrs) {
  if (!c) return '<div class="cd back' + (cls ? ' ' + cls : '') + '"' + (attrs || '') + '><span class="crest">👑</span></div>';
  var d = D[c], ps = plusStr(c), more = d.tx && !d.t.every(function (t) { return t === 'treasure' || t === 'victory' || t === 'curse'; });
  return '<div class="cd ' + ccls(c) + (cls ? ' ' + cls : '') + '" style="--rc:' + ccol(c) + '"' + (attrs || '') + '><span class="cb">' + d.n + '</span>' + artOf(c) + '<span class="cf"><span class="co">' + d.cost + '</span><span class="ps">' + (ps || '') + (more ? '<i>＋</i>' : '') + '</span></span></div>';
}
function pileHtml(c, n, cls) {   // 供給の山（名前の帯・絵・左下コスト・右下の残り枚数）
  return '<button class="pile ' + ccls(c) + (cls ? ' ' + cls : '') + '" data-c="' + c + '" style="--rc:' + ccol(c) + '"><span class="cb">' + D[c].n + '</span>' + artOf(c) + '<span class="co">' + D[c].cost + '</span><span class="n">' + n + '</span></button>';
}
function miniHtml(c, n, cls) { return '<span class="mini ' + ccls(c) + (cls ? ' ' + cls : '') + '" style="--rc:' + ccol(c) + '">' + cemo(c) + '<b>' + cname(c) + '</b>' + (n > 1 ? '<small>×' + n + '</small>' : '') + '</span>'; }
function minisOf(list) {   // 同じカードはまとめる（並びはそのまま）
  var out = [], last = null;
  list.forEach(function (c) { if (last && last.c === c) last.n++; else { last = { c: c, n: 1 }; out.push(last); } });
  return out.map(function (x) { return miniHtml(x.c, x.n); }).join('');
}
function countsHtml(cnt) {
  var ks = L.sortK(Object.keys(cnt));
  return ks.map(function (c) { return miniHtml(c, cnt[c]); }).join('');
}

// ---------- 汎用UI ----------
function show(id) { ['title', 'lobby', 'game', 'end'].forEach(function (s) { $(s).classList.toggle('active', s === id); }); document.body.classList.toggle('in-game', id === 'game'); }
function overlay(id, on) { $(id).classList.toggle('active', on); }
var toastT;
function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 3000); }
function banner(msg) { var b = $('banner'); b.textContent = msg || ''; b.classList.toggle('show', !!msg); }
function confirmBox(title, text, yes, cb) {
  $('cfTitle').textContent = title; $('cfText').textContent = text; $('cfYes').textContent = yes; $('cfNo').style.display = '';
  overlay('confirmModal', true);
  $('cfYes').onclick = function () { overlay('confirmModal', false); cb(); };
  $('cfNo').onclick = function () { overlay('confirmModal', false); };
}
function alertBox(msg) { confirmBox('お知らせ', msg, 'OK', function () {}); $('cfNo').style.display = 'none'; }
function connecting(on, title, text, onCancel) {
  overlay('connecting', on);
  if (on) { $('connTitle').textContent = title || '接続中…'; $('connText').textContent = text || ''; $('connCancel').onclick = onCancel || function () { location.href = location.pathname; }; }
}
// あそびかた（自分の言葉で書いた説明）
function rulesHtml() {
  var li = [
    '<b>目的</b>：自分だけのデッキ（山札）をきたえて、ゲームの終わりに <b>勝利点★</b> がいちばん多い人の勝ち。★は 領地カード（🏡小領地★1・🏞️伯爵領★3・🏰王冠領★6 など）にしかなく、呪い🕸️は★−1。',
    '<b>はじめ</b>：全員 <b>銅貨7枚＋小領地3枚</b> の10枚をよく切って自分の山札にし、5枚引きます。テーブルの「供給」には、基本カードと、このゲームで使う <b>王国カード10種類</b>（各10枚）が並びます。',
    '<b>供給の枚数</b>：銅貨は 60−7×人数、銀貨40、金貨30。小領地・伯爵領・王冠領は 2人なら各8枚・3〜4人なら各12枚（領地の王国カード🌿も同じ）。呪いは 2人10・3人20・4人30枚。',
    '<b>自分の番は A→B→C の3つ</b>。<br><b>A アクション</b>：⚡1回ぶん、手札のアクションカードを1枚使えます。カードの効果で⚡が増えれば続けて使えます（使わなくてもOK）。',
    '<b>B 購入</b>：手札の貨幣を出して💰を数え、🛒1回ぶん、💰以下のコストのカードを供給から1枚買って <b>捨て札</b> に置きます。🛒が増えれば 合計💰の中で何枚でも。<b>買ったあとは貨幣を出せません</b>。💰0 のカード（銅貨・呪い）もタダで買えます。',
    '<b>C 片付け</b>：場のカードと手札を全部 捨て札にして、山札から5枚引きます（使わなかった⚡・🛒・💰は消えます）。',
    '<b>山札がなくなったら</b>：カードを引く・見るときに山札が足りなければ、その時に捨て札をよく切って新しい山札にします（足りている間は切りません）。',
    '<b>ことば</b>：「もらう」＝供給から取る（💰いらない・買ったことにはならない）。「追放」＝ゲームから取りのぞく（追放置き場へ）。「捨て札」の中身は、いちばん上のカードしか見えません。',
    '<b>攻撃と防御</b>：攻撃カード（🗡️自警団・🔮呪術師 など）は ほかの人に いやなことをします。そのとき手札に 防御カード🌉跳ね橋 があれば、見せるだけでその攻撃をふせげます（設定で自動にできます）。',
    '<b>ゲームの終わり</b>：<b>王冠領の山がなくなる</b> か、<b>供給の山が3つ</b> 空になったら、その人の番が終わったところで終了。持っているカード全部の★を数えます。同点なら <b>手番の少ない人</b> の勝ち、それも同じなら いっしょに勝ち。',
    '<b>続けて遊ぶとき</b>：前のゲームで1人だけ勝った人は、次のゲームで最後の手番になります（その次の人から始める）。',
    '<b>王国の選び方</b>：ロビーで「おすすめ」「ランダム」「自分で選ぶ」から。おすすめの組み合わせは、原作のルールブックにある組み合わせと同じカードです（名前はこのアプリのもの）。',
    '<b>オリジナルの効果</b>：🏘️宿場町・⚒️鉄打ち場・⚗️錬金室・🎭謝肉祭・🧺バザール・🪑円卓の間・🔮呪術師・🗡️自警団・👑謁見の間・⚖️両替商 は、このゲームだけの効果です。',
    '空いた席はCPU（ふーさん🐻・ミミ🐰・ロボミ🤖・ニャコ😺・ポチ太🐶・コンタ🦊）。強さは 弱い／普通／強い／アストラウルトラ😎。CPUは <b>見えている情報だけ</b> で考えます（山札の並びや他人の手札はのぞきません）。アストラウルトラは、ゲームの最初にその王国で作戦どうしを何百回も自己対戦させて、いちばん勝てる作戦を選びます。'
  ];
  return li.map(function (t) { return '<li>' + t + '</li>'; }).join('');
}
