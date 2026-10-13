/* 王国争覇：カードのデータ（名前・絵・説明文はすべてオリジナル。デッキ構築の仕組みを参考に、一部のカードは独自の効果にしています）
 * t：種類（action=アクション, treasure=貨幣, victory=領地, curse=呪い, attack=攻撃, reaction=防御）
 * plus：c=🃏カードを引く a=⚡アクション b=🛒購入 m=💰お金   tx：そのほかの効果（自分の言葉で書いたもの）
 * ed：2=王国カード、0=基本カード
 */
(function (root) {
  'use strict';
  var D = {
    // ---- 基本カード ----
    copper: { cost: 0, t: ['treasure'], coin: 1, ed: 0, n: '銅貨', e: '🟤', tx: '💰1 を生む貨幣。' },
    silver: { cost: 3, t: ['treasure'], coin: 2, ed: 0, n: '銀貨', e: '⚪', tx: '💰2 を生む貨幣。' },
    gold: { cost: 6, t: ['treasure'], coin: 3, ed: 0, n: '金貨', e: '🟡', tx: '💰3 を生む貨幣。' },
    shoryo: { cost: 2, t: ['victory'], vp: 1, ed: 0, n: '小領地', e: '🏡', tx: 'ゲームの終わりに 勝利点1。' },
    hakuryo: { cost: 5, t: ['victory'], vp: 3, ed: 0, n: '伯爵領', e: '🏞️', tx: 'ゲームの終わりに 勝利点3。' },
    oukan: { cost: 8, t: ['victory'], vp: 6, ed: 0, n: '王冠領', e: '🏰', tx: 'ゲームの終わりに 勝利点6。この山がなくなるとゲームが終わる。' },
    curse: { cost: 0, t: ['curse'], vp: -1, ed: 0, n: '呪い', e: '🕸️', tx: 'ゲームの終わりに 勝利点−1。何の役にも立たない。' },
    // ---- 王国カード（26種） ----
    monooki: { cost: 2, t: ['action'], ed: 2, n: '物置', e: '📦', plus: { a: 1 }, tx: '手札から好きな枚数を選んで捨て札にし、捨てたのと同じ枚数を引く。' },
    zange: { cost: 2, t: ['action'], ed: 2, n: '懺悔室', e: '🕯️', tx: '手札から <b>4枚まで</b> 選んで追放する（0枚でもよい）。' },
    hanebashi: { cost: 2, t: ['action', 'reaction'], ed: 2, n: '跳ね橋', e: '🌉', plus: { c: 2 }, tx: '<hr><b>防御</b>：ほかの人が攻撃カードを使ったとき、手札のこれを見せれば、その攻撃の影響を受けない（これは手札に残る）。' },
    hayauma: { cost: 3, t: ['action'], ed: 2, n: '早馬', e: '🐎', plus: { c: 1, a: 1 }, tx: '自分の捨て札の中を見て、1枚を山札の上に置いてもよい。' },
    ginzaiku: { cost: 3, t: ['action'], ed: 2, n: '銀細工師', e: '💍', plus: { c: 1, a: 1 }, tx: 'このターン <b>最初に銀貨を出したとき</b>、さらに 💰+1。' },
    kosho: { cost: 3, t: ['action'], ed: 2, n: '小姓', e: '🧒', plus: { m: 2 }, tx: '山札のいちばん上を捨て札にする。それがアクションカードなら、そのまま使ってもよい（⚡アクションは減らない）。' },
    shukuba: { cost: 3, t: ['action'], ed: 2, n: '宿場町', e: '🏘️', plus: { a: 2 }, tx: '山札のいちばん上を見せる。アクションカードなら手札に入れ、そうでなければ捨て札にする。' },
    daikugoya: { cost: 3, t: ['action'], ed: 2, n: '大工小屋', e: '🪚', tx: '<b>💰4 以下</b>のカードを1枚、供給からもらう（捨て札へ）。' },
    chozei: { cost: 4, t: ['action', 'attack'], ed: 2, n: '徴税官', e: '📜', tx: '銀貨を1枚もらい、<b>山札の上</b>に置く。ほかの人はそれぞれ、手札の領地カードを1枚見せて山札の上に置く（なければ手札を全部見せる）。' },
    yakusou: { cost: 4, t: ['victory'], ed: 2, n: '薬草畑', e: '🌿', vp: 0, tx: 'ゲームの終わりに、あなたの持っているカード <b>10枚ごとに 勝利点1</b>（端数は切り捨て）。' },
    jikeidan: { cost: 4, t: ['action', 'attack'], ed: 2, n: '自警団', e: '🗡️', plus: { m: 2 }, tx: 'ほかの人はそれぞれ、手札の <b>貨幣を1枚</b> 捨て札にする（なければ手札を見せる）。' },
    ryogae: { cost: 4, t: ['action'], ed: 2, n: '両替商', e: '⚖️', tx: '手札の貨幣を1枚 追放してもよい。追放したら、<b>そのコスト＋💰2</b> を得る（銅貨なら💰2、銀貨なら💰5）。' },
    wanashi: { cost: 4, t: ['action'], ed: 2, n: '罠師', e: '🪤', plus: { c: 1, a: 1, m: 1 }, tx: '供給の <b>空になった山1つにつき</b>、手札を1枚 捨て札にする。' },
    tatenaoshi: { cost: 4, t: ['action'], ed: 2, n: '建て直し', e: '🏗️', tx: '手札を1枚 追放する。そのカードより <b>💰2 高いもの以下</b>のカードを1枚、供給からもらう。' },
    tetsuuchi: { cost: 4, t: ['action'], ed: 2, n: '鉄打ち場', e: '⚒️', plus: { c: 2 }, tx: '手札の銅貨を1枚 捨て札にしてもよい。捨てたら さらに 🃏+1。' },
    ekken: { cost: 4, t: ['action'], ed: 2, n: '謁見の間', e: '👑', tx: '手札のアクションカードを1枚 使う（⚡アクションは減らない）。そのあと、そのカードを <b>山札の上</b> に戻してもよい。' },
    yatou: { cost: 5, t: ['action', 'attack'], ed: 2, n: '野盗', e: '🏴', tx: '金貨を1枚もらう。ほかの人はそれぞれ山札の上から2枚をめくり、その中の <b>銅貨以外の貨幣</b>を1枚 追放し、残りは捨て札にする。' },
    entaku: { cost: 5, t: ['action'], ed: 2, n: '円卓の間', e: '🪑', plus: { c: 3, b: 1 }, tx: 'ほかの人はそれぞれ、手札を1枚 選んで <b>見せる</b>。' },
    shanikusai: { cost: 5, t: ['action'], ed: 2, n: '謝肉祭', e: '🎭', plus: { a: 1, m: 2 }, tx: 'このターン、買うカードのコストが <b>💰1 下がる</b>（0未満にはならない）。' },
    renkin: { cost: 5, t: ['action'], ed: 2, n: '錬金室', e: '⚗️', plus: { c: 1, a: 1 }, tx: '手札を1枚 追放してもよい。追放したら 💰+2。' },
    shahon: { cost: 5, t: ['action'], ed: 2, n: '写本室', e: '📚', tx: '手札が <b>7枚</b> になるまで1枚ずつ引く。引いたアクションカードは、手札に入れずに脇へよけてもよい（最後にまとめて捨て札に）。' },
    bazaar: { cost: 5, t: ['action'], ed: 2, n: 'バザール', e: '🧺', plus: { c: 1, a: 1 }, tx: '<b>💰2 以下</b>のカードを1枚、供給からもらってもよい（捨て札へ）。' },
    kinmyaku: { cost: 5, t: ['action'], ed: 2, n: '金脈さがし', e: '⛏️', tx: '手札の貨幣を1枚 追放してもよい。追放したら、それより <b>💰3 高いもの以下</b>の貨幣を1枚、<b>手札に</b>もらう。' },
    monomi: { cost: 5, t: ['action'], ed: 2, n: '物見やぐら', e: '🔭', plus: { c: 1, a: 1 }, tx: '山札の上から2枚を見る。それぞれ 追放・捨て札・山札に戻す のどれかを選ぶ（戻すなら順番も自由）。' },
    jujutsu: { cost: 5, t: ['action', 'attack'], ed: 2, n: '呪術師', e: '🔮', plus: { c: 2 }, tx: 'ほかの人はそれぞれ、<b>呪いを1枚もらう</b> か <b>手札を1枚 捨て札にする</b> かを選ぶ（手番の次の人から順に）。' },
    meikou: { cost: 6, t: ['action'], ed: 2, n: '名工', e: '🏺', tx: '<b>💰5 以下</b>のカードを1枚、<b>手札に</b>もらう。そのあと手札を1枚、山札の上に置く。' },
  };
  var ORDER = Object.keys(D);
  ORDER.forEach(function (k) { D[k].id = k; });
  var api = { D: D, ORDER: ORDER,
    K2: ORDER.filter(function (k) { return D[k].ed === 2; }),
    K1: ORDER.filter(function (k) { return D[k].ed === 1; }),
    BASE: ['copper', 'silver', 'gold', 'shoryo', 'hakuryo', 'oukan', 'curse'] };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KS_CARDS = api;
})(this);
