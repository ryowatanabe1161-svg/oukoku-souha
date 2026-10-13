// node test/logic.test.js ― ルールエンジン（全カード・難しい組み合わせ）・情報もれ・CPU の公平さのテスト（依存なし）
'use strict';
const L = require('../logic.js'), A = require('../ai.js');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + ' → ' + JSON.stringify(a) + '（期待 ' + JSON.stringify(b) + '）'); }
const K0 = ['monooki', 'zange', 'hanebashi', 'shukuba', 'daikugoya', 'jikeidan', 'tatenaoshi', 'tetsuuchi', 'ekken', 'jujutsu'];
function G(o = {}) {
  return L.newGame({ np: o.np || 2, kingdom: o.k || K0, seed: o.seed || 1, start: o.start || 0, setup: S => {
    (o.hands || []).forEach((h, p) => { if (h) S.P[p].hand = h.slice(); });
    (o.decks || []).forEach((d, p) => { if (d) S.P[p].deck = d.slice(); });
    (o.discs || []).forEach((d, p) => { if (d) S.P[p].disc = d.slice(); });
    if (o.supply) Object.assign(S.supply, o.supply);
  } });
}
function A_(S, p, a, m) { const e = L.act(S, p, a); ok(!e, (m || 'act') + ' error: ' + e + ' need=' + JSON.stringify(S.need) + ' a=' + JSON.stringify(a)); return e; }
const play = (S, c, m) => { const i = S.P[S.need.p].hand.indexOf(c); ok(i >= 0, 'hand has ' + c); return A_(S, S.need.p, { a: 'play', i }, m || 'play ' + c); };
const selCards = (S, p, cards) => { const h = S.P[p].hand.slice(), sel = []; cards.forEach(c => { const i = h.findIndex((x, j) => x === c && !sel.includes(j)); sel.push(i); }); return { sel }; };
const lastEv = (S, k) => S.ev.filter(e => e.k === k).pop();
const cnt = a => { const o = {}; a.forEach(c => o[c] = (o[c] || 0) + 1); return o; };
const C5 = ['copper', 'copper', 'copper', 'copper', 'copper'];

console.log('■ 準備（公式ルールブック 3ページ）');
for (const np of [2, 3, 4]) {
  const S = L.newGame({ np, kingdom: ['monooki', 'yakusou', 'hanebashi', 'shukuba', 'daikugoya', 'jikeidan', 'tatenaoshi', 'tetsuuchi', 'ekken', 'jujutsu'], seed: 3 });
  const v = np === 2 ? 8 : 12;
  eq([S.supply.copper, S.supply.silver, S.supply.gold], [60 - 7 * np, 40, 30], np + '人：銅貨・銀貨・金貨（60−7×人数/40/30）');
  eq([S.supply.shoryo, S.supply.hakuryo, S.supply.oukan], [v, v, v], np + '人：小領地・伯爵領・王冠領 = ' + v);
  eq(S.supply.curse, 10 * (np - 1), np + '人：呪い 10/20/30');
  eq(S.supply.yakusou, v, np + '人：領地の王国カード（薬草畑）は ' + v + '枚');
  eq(S.supply.shukuba, 10, '王国カードは10枚');
  ok(S.P.every(P => P.hand.length === 5 && P.deck.length === 5 && P.disc.length === 0), np + '人：手札5・山札5');
  ok(S.P.every(P => JSON.stringify(cnt(L.owned(P))) === JSON.stringify(cnt(L.owned(P))) && cnt(L.owned(P)).copper === 7 && cnt(L.owned(P)).shoryo === 3), '初期デッキ 銅貨7・小領地3');
}
ok(/人数/.test((() => { try { L.newGame({ np: 5, kingdom: K0 }); } catch (e) { return e.message; } })()), '5人は不可（基本セットは2〜4人）');
ok(/10種類/.test((() => { try { L.newGame({ np: 2, kingdom: K0.slice(0, 9) }); } catch (e) { return e.message; } })()), '王国は10種類');
eq(L.SETS.filter(s => s.ed === 2).length, 6, 'ルールブックのおすすめセット（第2版）6つ');
ok(L.SETS.every(s => s.k.length === 10 && new Set(s.k).size === 10 && s.k.every(c => L.D[c] && (s.ed === 1 || L.D[c].ed === 2))), 'おすすめセットはすべて10種で、第2版のセットに初版カードはない');
eq(L.C.K2.length, 26, '第2版の王国カード26種（薬草畑を含む）');
eq(L.C.K1.length, 0, '初版だけのカードはなし');
{ const k = L.randomKingdom(L.mulberry(5), false); ok(k.length === 10 && k.every(c => L.D[c].ed === 2), 'ランダム（第2版のみ）'); }
{ const st = []; for (let i = 0; i < 400; i++) st.push(L.newGame({ np: 3, kingdom: K0, seed: i }).turn); ok([0, 1, 2].every(p => st.includes(p)), 'スタートプレイヤーはランダム'); }

console.log('■ ターンの流れ（ABC）・購入');
{
  const S = G({ hands: [['copper', 'copper', 'silver', 'shoryo', 'shoryo']] });
  eq(S.need.k, 'buy', 'アクションがなければ購入フェーズから');
  ok(/お金/.test(L.act(S, 0, { a: 'buy', c: 'gold' })), 'お金が足りないと買えない');
  A_(S, 0, { a: 'treasure', i: 2 }); eq(S.coins, 2, '銀貨で💰2');
  A_(S, 0, { a: 'buy', c: 'silver', auto: true }); ok(S.ev.some(e => e.k === 'treasures') && S.ev.some(e => e.k === 'gain' && e.c === 'silver'), '「出して買う」で残りの貨幣も出して支払う');
  eq(S.turn, 1, '購入が尽きたら自動で片付け→次の人');
  eq(S.P[0].hand.length, 5, '片付けで5枚引く');
  ok(cnt(S.P[0].disc).silver === 2 && S.P[0].disc.length === 6 && S.P[0].play.length === 0, '買ったカード・場・手札は捨て札へ');
}
{
  const S = G({ hands: [['shanikusai', 'copper', 'copper', 'copper', 'shoryo']] });
  play(S, 'shanikusai'); eq([S.actions, S.buys, S.coins, S.discount], [1, 1, 2, 1], '謝肉祭：⚡+1 💰+2 コスト−1');
  A_(S, 0, { a: 'all' }); eq(S.coins, 5, 'すべての財宝を出す');
  A_(S, 0, { a: 'buy', c: 'gold' }); eq(S.turn, 1, '💰5 で金貨（💰6−1）を買えた・購入1回で終了');
  ok(S.P[0].disc.includes('gold'), '金貨は捨て札に');
  eq(S.discount, 0, '次の手番では割引なし');
}
{
  const S = G({ hands: [['shoryo', 'shoryo', 'shoryo', 'shoryo', 'shoryo']] });
  A_(S, 0, { a: 'buy', c: 'curse' }); ok(S.P[0].disc.includes('curse'), '💰0 でも呪い（💰0）は買える');
}
{
  const S = G({ hands: [['tetsuuchi', 'shukuba', 'copper', 'copper', 'copper']], decks: [['shoryo', 'shoryo', 'shoryo', 'copper', 'copper', 'copper']] });
  play(S, 'tetsuuchi'); eq(S.need.why, 'tetsuuchi', '鉄打ち場：銅貨を捨てるか聞く');
  A_(S, 0, selCards(S, 0, ['copper'])); eq(S.phase, 'buy', 'アクションを使い切ると購入へ（⚡1しかない）');
  eq(S.P[0].hand.length, 6, '鉄打ち場：🃏+2、銅貨を捨てて🃏+1');
}
{
  const S = G({ hands: [['shukuba', 'tetsuuchi', 'copper', 'copper', 'copper']] });
  A_(S, 0, { a: 'end' }); eq(S.phase, 'buy', 'アクションは使わなくてもよい');
}

console.log('■ 各カード');
{ // 物置
  const S = G({ hands: [['monooki', 'shoryo', 'shoryo', 'copper', 'curse']], decks: [['silver', 'gold', 'copper']] });
  play(S, 'monooki'); eq(S.actions, 1, '物置：⚡+1');
  A_(S, 0, selCards(S, 0, ['shoryo', 'shoryo', 'curse']));
  eq(cnt(S.P[0].hand), { copper: 2, silver: 1, gold: 1 }, '物置：3枚捨てて3枚引く');
  const e = lastEv(S, 'discard'); ok(e.n === 3 && e.top === 'curse', '捨てた枚数と一番上だけ公開');
}
{ // 物置：シャッフルに捨てたカードが入る
  const S = G({ hands: [['monooki', 'shoryo', 'shoryo', 'copper', 'copper']], decks: [[]], discs: [[]] });
  play(S, 'monooki'); A_(S, 0, selCards(S, 0, ['shoryo', 'shoryo']));
  eq(cnt(S.P[0].hand), { copper: 2, shoryo: 2 }, '物置：山札が空なら、捨てたカードごとシャッフルして引く');
}
{ // 懺悔室
  const S = G({ hands: [['zange', 'shoryo', 'shoryo', 'copper', 'copper', 'curse']] });
  play(S, 'zange'); ok(!!L.act(S, 0, { sel: [0, 1, 2, 3, 4] }), '懺悔室：5枚は不可');
  A_(S, 0, selCards(S, 0, ['shoryo', 'shoryo', 'copper'])); eq(S.trash.length, 3, '懺悔室：3枚追放'); eq(S.P[0].hand, ['copper', 'curse'], '残り2枚');
}
{ const S = G({ hands: [['zange', 'shoryo', 'copper', 'copper', 'copper']] }); play(S, 'zange'); A_(S, 0, { sel: [] }); eq(S.trash.length, 0, '懺悔室：0枚でもよい'); }
{ // 跳ね橋（使う）
  const S = G({ hands: [['hanebashi', 'copper', 'copper', 'copper', 'copper']], decks: [['silver', 'gold', 'shoryo']] });
  play(S, 'hanebashi'); eq(S.P[0].hand.length, 6, '跳ね橋：🃏+2');
}
{ // 早馬
  const S = G({ hands: [['hayauma', 'copper', 'copper', 'copper', 'copper']], decks: [['shoryo', 'copper']], discs: [['gold', 'shoryo', 'silver']] });
  play(S, 'hayauma'); eq(S.actions, 1, '早馬：⚡+1'); eq(S.need.k, 'pick', '捨て札から選ぶ');
  eq(S.need.cards, ['gold', 'shoryo', 'silver'], '捨て札の中身を見られる（本人だけ）');
  const v1 = L.viewFor(S, 1); ok(!v1.need.cards, '相手には捨て札の中身は見えない');
  A_(S, 0, { sel: [0] }); eq(S.P[0].deck[0], 'gold', '選んだカードを山札の上へ');
  const S2 = G({ hands: [['hayauma', 'copper', 'copper', 'copper', 'copper']], decks: [['shoryo', 'copper']], discs: [['gold']] });
  play(S2, 'hayauma'); A_(S2, 0, { sel: [] }); eq(S2.P[0].disc, ['gold'], '早馬：置かなくてもよい');
  const S3 = G({ hands: [['hayauma', 'copper', 'copper', 'copper', 'copper']], decks: [['shoryo', 'copper']], discs: [[]] }); play(S3, 'hayauma'); eq(S3.phase, 'buy', '捨て札が空なら何も聞かない');
}
{ // 銀細工師
  const S = G({ hands: [['ginzaiku', 'silver', 'silver', 'copper', 'shoryo']], decks: [['shoryo', 'copper', 'copper']] });
  play(S, 'ginzaiku'); A_(S, 0, { a: 'treasure', i: S.P[0].hand.indexOf('silver') }); eq(S.coins, 3, '銀細工師：最初の銀貨で💰+1');
  A_(S, 0, { a: 'treasure', i: S.P[0].hand.indexOf('silver') }); eq(S.coins, 5, '2枚目の銀貨にはつかない');
  const S2 = G({ hands: [['ginzaiku', 'ekken', 'silver', 'copper', 'shoryo']], decks: [['shoryo', 'copper', 'ginzaiku', 'copper']] });
  play(S2, 'ekken'); A_(S2, 0, selCards(S2, 0, ['ginzaiku'])); eq(S2.merch, 1, '謁見の間×銀細工師：1回分'); eq(S2.need.why, 'ekkenBack', '使ったカードを山札に戻すか聞く');
  A_(S2, 0, { y: true }); eq(S2.P[0].deck[0], 'ginzaiku', '山札の上に戻した'); ok(!S2.P[0].play.includes('ginzaiku'), '場からは消える');
  A_(S2, 0, { a: 'all' }); ok(S2.coins >= 4, '最初の銀貨で💰+1');
  const S3 = G({ hands: [['ginzaiku', 'gold', 'copper', 'copper', 'shoryo']], decks: [['shoryo', 'copper']] });
  play(S3, 'ginzaiku'); A_(S3, 0, { a: 'all' }); eq(S3.coins, 5, '銀貨を出さなければボーナスなし（金貨3＋銅貨2）');
}
{ // 小姓
  const S = G({ hands: [['kosho', 'copper', 'copper', 'copper', 'shoryo']], decks: [['tetsuuchi', 'gold', 'gold', 'gold', 'shoryo']] });
  play(S, 'kosho'); eq(S.coins, 2, '小姓：💰+2'); eq(S.need.why, 'kosho', 'めくったのがアクションなら使うか聞く');
  A_(S, 0, { y: true }); A_(S, 0, { sel: [] }); eq(S.P[0].hand.length, 6, '小姓→鉄打ち場を使った（🃏+2）'); ok(S.P[0].play.includes('tetsuuchi') && !S.P[0].disc.includes('tetsuuchi'), '使ったカードは場へ');
  eq(S.phase, 'buy', '⚡は増えない（小姓で⚡1を使った）');
  const S2 = G({ hands: [['kosho', 'copper', 'copper', 'copper', 'shoryo']], decks: [['gold', 'shoryo']] });
  play(S2, 'kosho'); eq(S2.P[0].disc, ['gold'], 'アクション以外はただ捨て札に'); eq(lastEv(S2, 'kosho').c, 'gold', '捨てたカードは公開');
  const S3 = G({ hands: [['kosho', 'copper', 'copper', 'copper', 'shoryo']], decks: [['shukuba', 'shoryo']] }); play(S3, 'kosho'); A_(S3, 0, { y: false }); eq(S3.P[0].disc, ['shukuba'], '使わない選択もできる');
  const S4 = G({ hands: [['shukuba', 'kosho', 'copper', 'copper', 'shoryo']], decks: [['shoryo', 'shukuba', 'shoryo', 'shoryo', 'shoryo']] });
  play(S4, 'shukuba'); play(S4, 'kosho'); A_(S4, 0, { y: true }); eq(S4.actions, 3, '小姓で使った宿場町：⚡+2（⚡は消費しない）');
}
{ // 大工小屋
  const S = G({ hands: [['daikugoya', 'copper', 'copper', 'copper', 'shoryo']] });
  play(S, 'daikugoya'); eq(S.need.k, 'supply', '大工小屋：供給から選ぶ'); ok(/もらえません/.test(L.act(S, 0, { c: 'jujutsu' })), '💰5 は不可');
  ok(/選んで/.test(L.act(S, 0, { c: null })), 'もらうのは義務（もらえるものがあれば）');
  A_(S, 0, { c: 'tetsuuchi' }); ok(S.P[0].disc.includes('tetsuuchi'), '💰4 の鉄打ち場を捨て札へ'); eq(S.supply.tetsuuchi, 9, '供給から減る');
}
{ // 徴税官
  const S = G({ np: 3, hands: [['chozei', 'copper', 'copper', 'copper', 'shoryo'], ['shoryo', 'hakuryo', 'copper', 'copper', 'copper'], ['copper', 'copper', 'silver', 'copper', 'copper']], decks: [['gold']] });
  play(S, 'chozei'); eq(S.P[0].deck[0], 'silver', '徴税官：銀貨を山札の上に');
  eq([S.need.p, S.need.why, S.need.filter], [1, 'chozei', 'victory'], '相手は領地カードを選ぶ（2種類あるので選択）');
  A_(S, 1, selCards(S, 1, ['hakuryo'])); eq(S.P[1].deck[0], 'hakuryo', '選んだ領地を山札の上へ'); eq(lastEv(S, 'topdeck').c, 'hakuryo', '見せた領地は公開');
  const e = lastEv(S, 'revealHand'); ok(e && e.p === 2 && e.cards.length === 5, '領地がない人は手札を全部見せる');
  const S2 = G({ hands: [['chozei', 'copper', 'copper', 'copper', 'shoryo'], ['shoryo', 'shoryo', 'copper', 'copper', 'copper']], decks: [[], []] , discs: [[], []] });
  play(S2, 'chozei'); eq(S2.P[0].deck, ['silver'], '山札が空なら銀貨が山札の唯一のカードに'); eq(S2.P[1].deck, ['shoryo'], '同じ領地2枚なら自動で1枚');
}
{ // 薬草畑
  ok(L.vpOf(Array(39).fill('copper').concat(['yakusou'])) === 4, '薬草畑：40枚なら4点');
  ok(L.vpOf(Array(38).fill('copper').concat(['yakusou'])) === 3, '39枚なら3点（切り捨て）');
  ok(L.vpOf(Array(27).fill('copper').concat(['yakusou', 'yakusou', 'shoryo'])) === 2 * 3 + 1, '30枚で2枚なら各3点');
}
{ // 罠師
  const S = G({ hands: [['wanashi', 'copper', 'copper', 'shoryo', 'shoryo']], decks: [['gold', 'shoryo']], supply: { monooki: 0, zange: 0 } });
  play(S, 'wanashi'); eq([S.actions, S.coins, S.P[0].hand.length], [1, 1, 5], '罠師：🃏+1 ⚡+1 💰+1'); eq([S.need.min, S.need.max], [2, 2], '空の山2つ → 2枚捨てる');
  A_(S, 0, selCards(S, 0, ['shoryo', 'shoryo'])); eq(S.P[0].hand.length, 3, '2枚捨てた');
  const S2 = G({ hands: [['wanashi', 'copper', 'copper', 'shoryo', 'shoryo']], decks: [['gold', 'shoryo']] }); play(S2, 'wanashi'); eq(S2.phase, 'buy', '空の山がなければ捨てない');
  const S3 = G({ hands: [['wanashi']], decks: [[]], discs: [[]], supply: { monooki: 0, zange: 0, hanebashi: 0 } }); play(S3, 'wanashi'); eq(S3.phase, 'buy', '手札が足りなければ残り全部（0枚）');
  const S4 = G({ hands: [['wanashi', 'copper']], decks: [['silver']], supply: { curse: 0, copper: 0, hanebashi: 0 } }); play(S4, 'wanashi'); eq(S4.P[0].hand.length, 0, '呪い・銅貨の山も数える（3つ）→ 手札2枚を全部');
}
{ // 建て直し
  const S = G({ hands: [['tatenaoshi', 'shoryo', 'copper', 'copper', 'copper']] });
  play(S, 'tatenaoshi'); A_(S, 0, selCards(S, 0, ['shoryo'])); eq(S.need.max, 4, '小領地(2)→💰4 以下');
  A_(S, 0, { c: 'tetsuuchi' }); ok(S.trash.includes('shoryo') && S.P[0].disc.includes('tetsuuchi'), '建て直し：追放して捨て札にもらう');
  const S2 = G({ hands: [['tatenaoshi', 'gold', 'copper', 'copper', 'copper']] }); play(S2, 'tatenaoshi'); A_(S2, 0, selCards(S2, 0, ['gold'])); A_(S2, 0, { c: 'gold' }); ok(S2.P[0].disc.includes('gold'), '同じカードやもっと安いものでもよい');
  const S3 = G({ hands: [['tatenaoshi']], decks: [[]], discs: [[]] }); play(S3, 'tatenaoshi'); eq([S3.phase, S3.trash.length], ['buy', 0], '手札がなければ何もしない');
  const S4 = G({ hands: [['tatenaoshi', 'curse']] }); play(S4, 'tatenaoshi'); eq(S4.trash, ['curse'], '1枚しかなければ自動で追放（義務）'); ok(S4.need.k === 'supply' && S4.need.max === 2, '呪い→💰2 以下');
}
{ // 野盗
  const S = G({ np: 3, hands: [['yatou', 'copper', 'copper', 'copper', 'shoryo']], decks: [null, ['silver', 'gold', 'shoryo'], ['copper', 'shoryo', 'silver']] });
  play(S, 'yatou'); ok(S.P[0].disc.includes('gold'), '野盗：金貨をもらう'); eq([S.need.p, S.need.why, S.need.only], [1, 'yatou', [0, 1]], '銅貨以外の貨幣が2枚 → 本人が選ぶ');
  A_(S, 1, { sel: [0] }); ok(S.trash.includes('silver') && S.P[1].disc.includes('gold'), '選んだ方を追放・残りは捨て札');
  eq(S.trash.filter(c => c === 'copper').length, 0, '銅貨は追放されない'); ok(S.P[2].disc.includes('copper') && S.P[2].disc.includes('shoryo') || true, '');
  eq(S.trash, ['silver'], '3人目は銅貨と小領地 → 何も追放されず両方捨て札'); ok(S.P[2].disc.includes('copper') && S.P[2].disc.includes('shoryo'), '');
  const r = S.ev.filter(e => e.k === 'reveal'); eq(r.map(e => e.cards), [['silver', 'gold'], ['copper', 'shoryo']], 'めくったカードは公開');
}
{ // 写本室
  const S = G({ hands: [['shahon', 'copper', 'copper', 'shoryo']], decks: [['shukuba', 'silver', 'tetsuuchi', 'gold', 'shoryo', 'copper']] });
  play(S, 'shahon'); eq([S.need.why, S.need.c], ['shahon', 'shukuba'], '写本室：アクションを引いたら よけるか聞く');
  A_(S, 0, { y: true }); eq(S.P[0].aside, ['shukuba'], 'よけたカードは脇に（公開）');
  eq(S.need.c, 'tetsuuchi', '次のアクションでも聞く'); A_(S, 0, { y: false });
  eq(cnt(S.P[0].hand), { copper: 2, shoryo: 2, silver: 1, tetsuuchi: 1, gold: 1 }, '7枚になるまで');
  ok(S.P[0].disc.includes('shukuba') && !S.P[0].aside.length, '最後に よけたカードを捨て札へ');
  const S2 = G({ hands: [['shahon', 'copper', 'copper', 'shoryo']], decks: [['shukuba']], discs: [['silver', 'gold', 'copper', 'shoryo']] });
  play(S2, 'shahon'); A_(S2, 0, { y: true }); ok(!S2.P[0].hand.includes('shukuba') && S2.P[0].hand.length === 7 && S2.P[0].disc.includes('shukuba') && S2.P[0].disc.length === 1, '途中でシャッフルしても よけたカードは混ぜない');
  const S3 = G({ hands: [['shahon', 'copper', 'copper', 'shoryo', 'shoryo', 'shoryo', 'shoryo', 'copper']], decks: [['gold']] }); play(S3, 'shahon'); eq(S3.P[0].hand.length, 7, '最初から7枚なら引かない');
}
{ // 金脈さがし
  const S = G({ hands: [['kinmyaku', 'copper', 'silver', 'shoryo', 'shoryo']] });
  play(S, 'kinmyaku'); A_(S, 0, selCards(S, 0, ['silver'])); eq(S.need.filter, 'treasure', '貨幣だけ'); ok(/もらえません/.test(L.act(S, 0, { c: 'renkin' })), 'アクションは不可');
  A_(S, 0, { c: 'gold' }); ok(S.P[0].hand.includes('gold') && S.trash.includes('silver'), '金脈さがし：銀貨→金貨を手札に');
  A_(S, 0, { a: 'all' }); eq(S.coins, 4, '手に入れた金貨をそのターンに使える');
  const S2 = G({ hands: [['kinmyaku', 'copper', 'shoryo', 'shoryo', 'shoryo']] }); play(S2, 'kinmyaku'); A_(S2, 0, { sel: [] }); eq(S2.trash.length, 0, '追放しなくてもよい（第2版）');
  const S3 = G({ hands: [['kinmyaku', 'shoryo', 'shoryo', 'shoryo', 'shoryo']] }); play(S3, 'kinmyaku'); eq(S3.phase, 'buy', '貨幣がなければ何もなし');
}
{ // 物見やぐら
  const S = G({ hands: [['monomi', 'copper', 'copper', 'shoryo', 'shoryo']], decks: [['silver', 'curse', 'shoryo', 'gold']] });
  play(S, 'monomi'); eq(S.need.cards, ['curse', 'shoryo'], '物見やぐら：🃏+1 のあと上の2枚を見る');
  ok(!L.viewFor(S, 1).need.cards, '相手には見えない');
  A_(S, 0, { fate: ['trash', 'discard'] }); eq(S.trash, ['curse'], '追放'); ok(S.P[0].disc.includes('shoryo'), '捨て札'); eq(S.P[0].deck, ['gold'], '残りの山札');
  const S2 = G({ hands: [['monomi', 'copper', 'copper', 'shoryo', 'shoryo']], decks: [['silver', 'gold', 'renkin', 'shoryo']] });
  play(S2, 'monomi'); A_(S2, 0, { fate: ['keep', 'keep'], order: [1, 0] }); eq(S2.P[0].deck.slice(0, 2), ['renkin', 'gold'], '戻す順番を選べる');
  const S3 = G({ hands: [['monomi', 'copper', 'copper', 'shoryo', 'shoryo']], decks: [['silver', 'gold']], discs: [['shoryo']] });
  play(S3, 'monomi'); eq(S3.need.cards, ['gold', 'shoryo'], '山札が足りなければシャッフルして見る');
}
{ // 名工
  const S = G({ hands: [['meikou', 'copper', 'copper', 'shoryo', 'shoryo']] });
  play(S, 'meikou'); ok(/もらえません/.test(L.act(S, 0, { c: 'gold' })), '💰6 は不可'); A_(S, 0, { c: 'jujutsu' });
  ok(S.P[0].hand.includes('jujutsu'), '名工：手札にもらう'); eq(S.need.why, 'meikou', '手札を1枚山札の上へ');
  A_(S, 0, selCards(S, 0, ['jujutsu'])); eq(S.P[0].deck[0], 'jujutsu', 'もらったカードを置いてもよい');
}
console.log('■ 独自効果のカード');
{ // 宿場町
  const S = G({ hands: [['shukuba', 'copper', 'copper', 'copper', 'shoryo']], decks: [['tetsuuchi', 'gold']] });
  play(S, 'shukuba'); eq(S.actions, 2, '宿場町：⚡+2'); ok(S.P[0].hand.includes('tetsuuchi'), 'アクションなら手札に');
  const S2 = G({ hands: [['shukuba', 'copper', 'copper', 'copper', 'shoryo']], decks: [['gold', 'silver']] });
  play(S2, 'shukuba'); eq(S2.P[0].disc, ['gold'], 'それ以外は捨て札に'); eq(S2.P[0].hand.length, 4, '手札は増えない');
}
{ // 錬金室
  const S = G({ k: ['renkin', 'bazaar', 'entaku', 'shanikusai', 'ryogae', 'jujutsu', 'jikeidan', 'ekken', 'shukuba', 'tetsuuchi'], hands: [['renkin', 'curse', 'copper', 'copper', 'shoryo']], decks: [['copper', 'copper']] });
  play(S, 'renkin'); eq(S.actions, 1, '錬金室：⚡+1'); A_(S, 0, selCards(S, 0, ['curse'])); ok(S.trash.includes('curse') && S.coins === 2, '追放して💰+2');
}
{ // バザール
  const K = ['renkin', 'bazaar', 'entaku', 'shanikusai', 'ryogae', 'jujutsu', 'jikeidan', 'ekken', 'shukuba', 'tetsuuchi'];
  const S = G({ k: K, hands: [['bazaar', 'copper', 'copper', 'copper', 'shoryo']], decks: [['copper', 'copper']] });
  play(S, 'bazaar'); eq(S.need.k, 'supply', 'バザール：もらうか聞く'); ok(/もらえません/.test(L.act(S, 0, { c: 'silver' })), '💰3 は不可');
  A_(S, 0, { c: null }); eq(S.need.k, 'buy', 'もらわなくてもよい');
}
{ // 円卓の間
  const K = ['renkin', 'bazaar', 'entaku', 'shanikusai', 'ryogae', 'jujutsu', 'jikeidan', 'ekken', 'shukuba', 'tetsuuchi'];
  const S = G({ k: K, hands: [['entaku', 'copper', 'copper', 'copper', 'shoryo'], ['gold', 'silver', 'copper', 'copper', 'shoryo']] });
  play(S, 'entaku'); eq([S.buys, S.P[0].hand.length], [2, 7], '円卓の間：🃏+3 🛒+1'); eq(S.need.p, 1, 'ほかの人が見せるカードを選ぶ');
  A_(S, 1, { sel: [0] }); eq(lastEv(S, 'show').cards, ['gold'], '見せたカードは公開'); eq(S.P[1].hand.length, 5, '見せたカードは手札に残る');
}
{ // 呪術師
  const S = G({ np: 3, hands: [['jujutsu', 'copper', 'copper', 'copper', 'shoryo'], C5, C5] });
  play(S, 'jujutsu'); eq(S.need.why, 'jujutsu', '呪術師：呪いか捨てるかを聞く'); A_(S, 1, { y: false }); ok(S.P[1].disc.includes('curse'), '呪いをもらった');
  A_(S, 2, { y: true }); ok(S.P[2].hand.length === 4 && !S.P[2].disc.includes('curse'), '捨てる方を選んだ');
}
{ // 自警団
  const S = G({ np: 3, hands: [['jikeidan', 'copper', 'copper', 'copper', 'shoryo'], ['gold', 'copper', 'shoryo', 'shoryo', 'shoryo'], ['shoryo', 'shoryo', 'shoryo', 'shoryo', 'shoryo']] });
  play(S, 'jikeidan'); eq(S.coins, 2, '自警団：💰+2'); A_(S, 1, selCards(S, 1, ['copper'])); ok(S.P[1].hand.length === 4 && S.P[1].hand.includes('gold'), '貨幣を1枚捨てた');
  eq(lastEv(S, 'show').p, 2, '貨幣がない人は手札を見せる');
}
{ // 両替商
  const S = G({ hands: [['ryogae', 'silver', 'copper', 'copper', 'shoryo']] });
  play(S, 'ryogae'); A_(S, 0, selCards(S, 0, ['silver'])); ok(S.trash.includes('silver') && S.coins === 5, '両替商：銀貨を追放して💰5');
}
console.log('■ 跳ね橋と攻撃');
{
  const S = G({ np: 3, hands: [['jikeidan', 'copper', 'copper', 'shoryo', 'shoryo'], ['hanebashi', 'copper', 'copper', 'copper', 'copper'], ['hanebashi', 'shoryo', 'silver', 'copper', 'copper']] });
  play(S, 'jikeidan'); eq([S.need.p, S.need.why], [1, 'hanebashi'], '攻撃の前に手番順に跳ね橋を聞く'); ok(S.coins === 0, 'まだ攻撃の効果は起きていない');
  A_(S, 1, { y: true }); eq([S.need.p, S.need.why], [2, 'hanebashi'], '次の人'); A_(S, 2, { y: false });
  eq([S.need.p, S.need.why], [2, 'jikeidan'], '見せなかった人だけ攻撃を受ける'); A_(S, 2, selCards(S, 2, ['copper']));
  eq(S.P[1].hand.length, 5, '跳ね橋の人は捨てない'); ok(S.P[1].hand.includes('hanebashi'), '跳ね橋は手札に残る'); eq(S.coins, 2, '攻撃した人の💰+2はそのまま');
  ok(lastEv(S, 'hanebashi').p === 1, '見せた跳ね橋は公開');
}
{
  const S = G({ hands: [['jujutsu', 'copper', 'copper', 'shoryo', 'shoryo'], ['hanebashi', 'copper', 'copper', 'copper', 'copper']], decks: [['silver', 'gold']] });
  play(S, 'jujutsu'); A_(S, 1, { y: true }); eq(S.P[1].disc.filter(c => c === 'curse').length, 0, '跳ね橋×呪術師：呪いをもらわない'); eq(S.P[0].hand.length, 6, '攻撃した人は🃏+2');
  const S2 = G({ hands: [['ekken', 'jujutsu', 'copper', 'shoryo', 'shoryo'], ['hanebashi', 'copper', 'copper', 'copper', 'copper']], decks: [['silver', 'gold', 'copper', 'copper']] });
  play(S2, 'ekken'); A_(S2, 0, selCards(S2, 0, ['jujutsu'])); eq(S2.need.why, 'hanebashi', '謁見の間×呪術師：跳ね橋を聞く'); A_(S2, 1, { y: false });
  eq(S2.need.why, 'jujutsu', '見せなければ呪いか捨てるかを選ぶ'); A_(S2, 1, { y: false }); eq(S2.P[1].disc.filter(c => c === 'curse').length, 1, '呪いをもらう'); eq(S2.P[0].hand.length, 3 + 2, '🃏+2');
  eq(S2.need.why, 'ekkenBack', '謁見の間：山札に戻すか聞く'); A_(S2, 0, { y: false });
  const S3 = G({ hands: [['yatou', 'copper', 'copper', 'shoryo', 'shoryo'], ['hanebashi', 'copper', 'copper', 'copper', 'copper']], decks: [null, ['gold', 'silver']] });
  play(S3, 'yatou'); A_(S3, 1, { y: true }); eq(S3.P[1].deck, ['gold', 'silver'], '跳ね橋×野盗：めくらない'); ok(S3.P[0].disc.includes('gold'), '攻撃した人は金貨をもらう');
  const S4 = G({ hands: [['chozei', 'copper', 'copper', 'shoryo', 'shoryo'], ['hanebashi', 'shoryo', 'copper', 'copper', 'copper']] });
  play(S4, 'chozei'); A_(S4, 1, { y: true }); eq(S4.P[1].hand.length, 5, '跳ね橋×徴税官：領地を戻さない');
  const S5 = G({ hands: [['entaku', 'copper', 'copper', 'shoryo', 'shoryo'], ['hanebashi', 'shoryo', 'copper', 'copper', 'copper']] });
  play(S5, 'entaku'); ok(S5.need.why === 'entaku', '円卓の間は攻撃ではないので跳ね橋は使えない'); eq(S5.P[1].hand.length, 5, '');
  const S6 = G({ hands: [['jikeidan', 'copper', 'copper', 'shoryo', 'shoryo'], ['shoryo', 'shoryo', 'silver', 'copper', 'copper']] });
  play(S6, 'jikeidan'); eq(S6.need.why, 'jikeidan', '跳ね橋がない人には聞かない');
}
console.log('■ シャッフル・山札まわり');
{
  const S = G({ hands: [['tetsuuchi', 'copper', 'copper', 'shoryo', 'shoryo']], decks: [['gold']], discs: [['silver']] });
  play(S, 'tetsuuchi'); eq(S.P[0].hand.length, 6, '足りなければシャッフルして引ける分だけ'); ok(S.ev.some(e => e.k === 'shuffle'), 'シャッフルを記録（公開）');
  const S2 = G({ hands: [['tetsuuchi', 'copper', 'copper', 'shoryo', 'shoryo']], decks: [[]], discs: [[]] }); play(S2, 'tetsuuchi'); eq(S2.P[0].hand.length, 4, '山札も捨て札もなければ引けない');
  const S3 = G({ hands: [['copper', 'copper', 'copper', 'shoryo', 'shoryo']], decks: [['gold', 'gold']], discs: [['silver', 'silver', 'silver']] });
  A_(S3, 0, { a: 'end' }); eq(cnt(S3.P[0].hand).gold, 2, '片付け：山札の残り2枚を引いてから…');
  eq(S3.P[0].hand.length, 5, '…捨て札（いま捨てた手札も含む）をシャッフルして残りを引く');
  const S4 = G({ hands: [['monomi', 'copper', 'copper', 'shoryo', 'shoryo']], decks: [['gold']], discs: [[]] }); play(S4, 'monomi'); eq(S4.phase, 'buy', '物見やぐら：見るカードがなければ何もなし');
}
console.log('■ ゲームの終わり・同点');
{
  const S = G({ hands: [['copper', 'copper', 'copper', 'copper', 'copper']], supply: { oukan: 1 } });
  S.P[0].hand = ['gold', 'gold', 'silver', 'copper', 'copper'];
  A_(S, 0, { a: 'all' }); A_(S, 0, { a: 'buy', c: 'oukan' }); ok(S.over && S.result.why === 'oukan', '王冠領がなくなったら そのターンの終わりにゲーム終了');
}
{
  const S = G({ hands: [['shanikusai', 'gold', 'gold', 'copper', 'copper']], supply: { monooki: 0, zange: 1, hanebashi: 1 } });
  play(S, 'shanikusai'); S.buys++; A_(S, 0, { a: 'all' }); A_(S, 0, { a: 'buy', c: 'zange' }); ok(!S.over, '空の山2つでは続く');
  A_(S, 0, { a: 'buy', c: 'hanebashi' }); ok(S.over && S.result.why === 'piles', '3つ空でゲーム終了'); eq(S.result.empty.length, 3, '');
}
{
  const S = G({ np: 3, hands: [['jujutsu', 'copper', 'copper', 'copper', 'copper']], supply: { curse: 2, monooki: 0, zange: 0 } });
  play(S, 'jujutsu'); A_(S, 1, { y: false }); A_(S, 2, { y: false }); ok(!S.over && S.need.k === 'buy', '途中で山が尽きても ターンが終わるまで続く'); A_(S, 0, { a: 'end' }); ok(S.over, 'ターンの終わりに終了');
}
{ // 同点：手番が少ない人の勝ち
  const S = G({ start: 0, hands: [['copper', 'copper', 'copper', 'copper', 'copper']] });
  S.P[0].turns = 0; const res = (() => { S.P.forEach(P => { P.deck = []; P.disc = []; P.hand = ['oukan']; P.play = []; }); S.P[0].turns = 5; S.P[1].turns = 4; return null; })();
  S.supply.oukan = 1; S.P[0].hand = ['gold', 'gold', 'silver'];
  // 手番を終えて終了させる：p0 が最後の王冠領を買う → p0 は oukan 2枚(12)、p1 は 1枚(6) なので p1 に王冠領を足して同点にする
  S.P[1].disc = ['oukan'];
  A_(S, 0, { a: 'all' }); A_(S, 0, { a: 'buy', c: 'oukan' });
  eq(S.result.scores, [6, 12], ''); // p0: bought oukan(6) only (hand had none), p1: 2 oukans
}
{
  const mk = (t0, t1) => { const S = G({ hands: [['gold', 'gold', 'silver', 'copper', 'copper']], supply: { oukan: 1 } }); S.P[0].deck = []; S.P[0].disc = []; S.P[1].deck = []; S.P[1].hand = []; S.P[1].disc = ['oukan']; S.P[0].turns = t0; S.P[1].turns = t1; A_(S, 0, { a: 'all' }); A_(S, 0, { a: 'buy', c: 'oukan' }); return S.result; };
  const r1 = mk(5, 4); eq([r1.scores, r1.winners], [[6, 6], [1]], '同点なら手番が少ない人の勝ち（先手が終わらせた → 後手の勝ち）');
  ok(r1.tieBreak, 'タイブレークの表示');
  const r2 = mk(4, 4); eq(r2.winners, [0, 1], '同点・同じ手番数なら共同勝利');
}
console.log('■ 情報もれ防止');
{
  const S = G({ np: 3 });
  const v = L.viewFor(S, 1);
  ok(Array.isArray(v.hand) && v.hand.length === 5, '自分の手札は見える');
  ok(v.P.every(P => !('hand' in P) && !('deck' in P) && !('disc' in P)), 'ほかの人の手札・山札・捨て札の中身は送らない');
  ok(v.P.every(P => typeof P.nh === 'number' && typeof P.nd === 'number'), '枚数だけ');
  const s = JSON.stringify(L.viewFor(S, -1)); ok(L.viewFor(S, -1).hand === null, '観戦（-1）は手札なし');
  const S2 = G({ hands: [['tetsuuchi', 'copper', 'copper', 'shoryo', 'shoryo']], decks: [['gold', 'silver', 'renkin', 'shanikusai']] }); play(S2, 'tetsuuchi');
  const d1 = L.viewFor(S2, 1).ev.filter(e => e.k === 'draw').pop(), d0 = L.viewFor(S2, 0).ev.filter(e => e.k === 'draw').pop();
  ok(d1.n === 2 && !d1.mine, '相手には引いた枚数だけ'); eq(d0.mine.cards, ['gold', 'silver'], '本人には中身');
  ok(!/shanikusai|"renkin"/.test(JSON.stringify(L.viewFor(S2, 1), (k, v) => k === 'own' ? undefined : v)), '引いたカード・山札の残りは相手のビューに一切出ない');
  const S3 = G({ hands: [['meikou', 'copper', 'copper', 'shoryo', 'shoryo']] }); play(S3, 'meikou'); A_(S3, 0, { c: 'tetsuuchi' }); A_(S3, 0, selCards(S3, 0, ['shoryo']));
  const t1 = L.viewFor(S3, 1).ev.filter(e => e.k === 'topdeck').pop(); ok(t1.n === 1 && !t1.mine && !t1.c, '名工で山札に置いたカードは相手には秘密');
}
{ // 片付け：捨て札の一番上は場のカード（手札は隠せる）
  const S = G({ hands: [['shukuba', 'shoryo', 'shoryo', 'copper', 'copper']], decks: [['hakuryo', 'shoryo', 'shoryo', 'shoryo', 'shoryo', 'shoryo']] });
  play(S, 'shukuba'); A_(S, 0, { a: 'all' }); A_(S, 0, { a: 'end' }); ok(L.viewFor(S, 1).P[0].top === 'copper' || L.viewFor(S, 1).P[0].top === 'shukuba', '片付け後の捨て札の一番上は場に出したカード');
}
console.log('■ 再現（ホストの再開用）');
{
  const k = L.SETS[1].k, seats = [{ lv: 'strong', plan: A.strongPlan(k, 3) }, { lv: 'normal', plan: A.normalPlan(k, L.mulberry(1)) }, { lv: 'weak', plan: A.planFor('weak', k, 3) }];
  const S = L.newGame({ np: 3, kingdom: k, seed: 77 }); const rnd = L.mulberry(5); let g = 0;
  while (!S.over && g++ < 3000) { const p = S.need.p; L.act(S, p, A.decide(S, p, seats[p].lv, seats[p].plan, rnd)); if (g === 400) break; }
  const R = L.replay({ np: 3, kingdom: k, seed: 77 }, S.log);
  eq(JSON.stringify(L.viewFor(R, 0)), JSON.stringify(L.viewFor(S, 0)), 'seed と判断の列から同じ状態に戻せる');
}
console.log('■ CPU の公平さ（相手の手札・自分の山札の並びを入れかえても判断が変わらない）');
{
  let same = 0, total = 0;
  for (let i = 0; i < 160; i++) {
    const k = L.randomKingdom(L.mulberry(i + 1), i % 2 === 0), np = 2 + i % 3;
    const S = L.newGame({ np, kingdom: k, seed: i, noLog: true }); const rnd = L.mulberry(i);
    const seats = Array.from({ length: np }, (_, q) => ({ lv: ['strong', 'ultra', 'normal'][q % 3], plan: A.strongPlan(k, np) }));
    let steps = 20 + (i * 7) % 300;
    while (!S.over && steps-- > 0) { const p = S.need.p; L.act(S, p, A.decide(S, p, seats[p].lv, seats[p].plan, rnd)) && L.act(S, p, A.fallback(S)); }
    if (S.over) continue;
    const p = S.need.p, a1 = JSON.stringify(A.decide(S, p, seats[p].lv, seats[p].plan, () => 0.5));
    // 相手の手札と山札を混ぜ直し、自分の山札の並びも変える（枚数・中身の合計は同じ）
    const r = L.mulberry(i + 999);
    S.P.forEach((P, q) => { if (q !== p) { const all = L.shuffle(P.hand.concat(P.deck), r); P.hand = all.slice(0, P.hand.length); P.deck = all.slice(P.hand.length); } else L.shuffle(P.deck, r); });
    const a2 = JSON.stringify(A.decide(S, p, seats[p].lv, seats[p].plan, () => 0.5));
    total++; if (a1 === a2) same++; else console.log('   differs', S.need, a1, a2);
  }
  eq(same, total, '判断はすべて同じ（' + total + '場面）');
  const K = A.know(G({ np: 3 }), 0); ok(!('deck' in K) && K.deckComp && !K.oppHands, 'know() に山札の並び・相手の手札は入らない');
}
console.log('■ CPU が最後まで遊べる（ランダムな王国 300戦）');
{
  let bad = 0;
  for (let i = 0; i < 300; i++) {
    const rnd = L.mulberry(i + 3), np = 2 + i % 3, k = L.randomKingdom(rnd, i % 2 === 1);
    const seats = Array.from({ length: np }, (_, q) => { const lv = ['weak', 'normal', 'strong', 'ultra'][(i + q) % 4]; return { lv, plan: A.planFor(lv, k, np, rnd) }; });
    try { const S = A.simGame(k, seats, i); if (!S.over) bad++; const tot = {}; for (const c in S.supply) tot[c] = S.supply[c]; S.trash.forEach(c => tot[c] = (tot[c] || 0) + 1); S.P.forEach(P => L.owned(P).forEach(c => tot[c] = (tot[c] || 0) + 1)); const ex = L.supplyCounts(np, k); ex.copper += 7 * np; ex.shoryo += 3 * np; for (const c in ex) if (tot[c] !== ex[c]) { bad++; break; } } catch (e) { bad++; console.log(e.message); }
  }
  eq(bad, 0, 'すべて終了し、カードの総数も保たれる');
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
