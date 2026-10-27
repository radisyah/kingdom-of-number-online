'use strict';
/* Tes ujung-ke-ujung: 2 browser sungguhan (host + tamu + Room Master) lewat WebRTC dan lewat jalur relay (Redis/memori).
   Memakai THREE tiruan (test/three-stub.js) sehingga berjalan tanpa WebGL/CDN.
   Jalankan:  node test/e2e.js   (butuh: npm i playwright && npx playwright install chromium) */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
const { start } = require('../dev-server.js');
const STUB = fs.readFileSync(path.join(__dirname, 'three-stub.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const T = async (name, fn) => { try { await fn(); pass++; console.log('  ✔', name); } catch (e) { fail++; console.log('  ✘', name, '\n     ', (e.stack || e).toString().split('\n').slice(0, 4).join('\n      ')); process.exitCode = 1; } };
const waitFor = (page, fn, arg, timeout = 15000) => page.waitForFunction(fn, arg, { timeout, polling: 50 });

async function mk(browser, base, opts) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 600 } });
  if (opts.noRTC) await ctx.addInitScript(() => { window.RTCPeerConnection = undefined; });
  await ctx.route('**/*', (r) => {
    const u = r.request().url();
    if (/three\.min\.js/.test(u)) return r.fulfill({ contentType: 'text/javascript', body: STUB });
    if (u.startsWith(base)) return r.continue();
    return r.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.log('  [pageerror]', opts.label, e.message); process.exitCode = 1; });
  await page.goto(base + (opts.url || '/'));
  return { ctx, page };
}
async function lobby(browser, base, hostOpts, guestOpts) {
  const H = await mk(browser, base, Object.assign({ label: 'host' }, hostOpts || {}));
  await H.page.click('#onBtn');
  await H.page.fill('#on-name', 'Andi');
  await H.page.click('#on-create');
  await waitFor(H.page, () => document.querySelector('#on-code-show').textContent.length === 5 && document.querySelector('#on-code-show').textContent !== '-----');
  const code = await H.page.textContent('#on-code-show');
  const G = await mk(browser, base, Object.assign({ label: 'guest', url: '/?r=' + code }, guestOpts || {}));
  assert.strictEqual(await G.page.inputValue('#on-code'), code);
  await G.page.fill('#on-name', 'Budi');
  await G.page.click('#on-join');
  return { H, G, code };
}
const ev = (p, fn, a) => p.evaluate(fn, a);

async function suite(browser, base, label, opts) {
  console.log('\n[' + label + ']');
  const { H, G, code } = await lobby(browser, base, opts, opts);
  const hp = H.page, gp = G.page;
  await T('kedua perangkat masuk ronde (hitung mundur → bermain), peran & nama benar', async () => {
    await waitFor(hp, () => KON.Net.started && KON.ON.on);
    await waitFor(gp, () => KON.Net.started && KON.ON.on);
    assert.strictEqual(await ev(hp, () => KON.ON.L), 0); assert.strictEqual(await ev(gp, () => KON.ON.L), 1);
    assert.deepStrictEqual(await ev(gp, () => KON.ON.names), ['Andi', 'Budi']);
    assert.strictEqual(await ev(hp, () => document.querySelectorAll('#hud .nm')[1].textContent), 'Budi');
    assert.strictEqual(await ev(hp, () => KON.ON.epoch), await ev(gp, () => KON.ON.epoch));
  });
  await T('mode koneksi sesuai (' + label + ')', async () => {
    const want = opts && opts.noRTC ? 'relay' : 'p2p';
    await waitFor(hp, (w) => KON.Net.ses && KON.Net.ses.mode === w, want, 20000);
    await waitFor(gp, (w) => KON.Net.ses && KON.Net.ses.mode === w, want, 20000);
  });
  await waitFor(hp, () => document.querySelector('#cd').className === 'hide' || document.querySelector('#cd').className === '' ? true : false, null, 12000).catch(() => { });
  await waitFor(hp, () => KON.Match.left <= 599.5, null, 15000); await waitFor(gp, () => KON.Match.left <= 599.5, null, 15000);

  await T('gerak lokal instan: tamu menekan D → pemain merah bergerak; host melihatnya (prediksi)', async () => {
    const x0 = await ev(gp, () => KON.players[1].x);
    await gp.keyboard.down('ArrowLeft'); await sleep(500); await gp.keyboard.up('ArrowLeft');
    const x1 = await ev(gp, () => KON.players[1].x); assert(x1 < x0 - 1, 'bergerak lokal');
    await sleep(400);
    const hx = await ev(hp, () => KON.players[1].x);
    assert(Math.abs(hx - x1) < 1.2, 'boneka di host mengikuti: ' + hx + ' vs ' + x1);
    assert.strictEqual(await ev(hp, () => KON.players[1].ring.visible), false);
  });
  await T('ambil balok: tamu menekan E dekat balok → host melihat balok dibawa', async () => {
    await ev(gp, () => { const p = KON.players[1], b = p.items.find((i) => i.kind === 'block' && i.n === 9); p.x = b.x - 1.0; p.z = b.z; p.obj.position.x = p.x; p.obj.position.z = p.z; });
    await sleep(100);
    await gp.keyboard.press('KeyE');       // skema P1 juga aktif di perangkat tamu
    assert.strictEqual(await ev(gp, () => KON.players[1].carry && KON.players[1].carry.n), 9);
    await waitFor(hp, () => KON.players[1].carry && KON.players[1].carry.n === 9 && KON.players[1].items.find((i) => i.kind === 'block' && i.n === 9).state === 'carried', null, 3000);
  });
  await T('masukkan balok ke senjata → total di host sama (9 lalu 9 lagi mustahil; pakai 9+3=12 meriam 1)', async () => {
    const put = async (n, w) => {
      await ev(gp, ([n, w]) => {
        const p = KON.players[1], b = p.items.find((i) => i.kind === 'block' && i.n === n), W = p.items.find((i) => i.kind === 'weapon' && i.w === w);
        if (!p.carry) { p.x = b.x - 1; p.z = b.z; p.act('interact'); }
        p.x = W.fx; p.z = W.fz; p.obj.position.x = p.x; p.obj.position.z = p.z; p.findTarget(); p.act('interact');
      }, [n, w]);
    };
    await put(9, 0);
    await waitFor(hp, () => { const W = KON.players[1].items.find((i) => i.kind === 'weapon' && i.w === 0); return W.loaded.length === 1 && KON.Ledger.total(W) === 9; }, null, 3000);
    assert.strictEqual(await ev(gp, () => KON.Ledger.total(KON.players[1].items.find((i) => i.kind === 'weapon' && i.w === 0))), 9);
  });
  let fireHpBefore;
  await T('aktivasi meriam tamu: tembakan terlihat di host, damage diputuskan HOST (pihak diserang), HP tersinkron ke tamu', async () => {
    fireHpBefore = await ev(hp, () => KON.HP.get(0, 'wall'));
    await ev(gp, () => {
      const p = KON.players[1], b = p.items.find((i) => i.kind === 'block' && i.n === 3), W = p.items.find((i) => i.kind === 'weapon' && i.w === 0);
      p.x = b.x - 1; p.z = b.z; p.obj.position.x = p.x; p.obj.position.z = p.z; p.findTarget(); p.act('interact');
      p.x = W.fx; p.z = W.fz; p.obj.position.x = p.x; p.obj.position.z = p.z; p.findTarget(); p.act('interact');
    });
    await waitFor(hp, () => KON.projs.length > 0, null, 3000);
    await waitFor(hp, () => KON.HP.get(0, 'wall') < 1800, null, 8000);
    const h = await ev(hp, () => KON.HP.get(0, 'wall')); assert.strictEqual(h, fireHpBefore - 100);
    await waitFor(gp, () => KON.HP.get(0, 'wall') === 1700, null, 3000);
    assert.strictEqual(await ev(gp, () => KON.HP.get(1, 'wall')), 1800, 'HP tamu sendiri tidak berubah');
  });
  await T('balok cooldown + target baru di kerajaan tamu terlihat di host', async () => {
    await waitFor(hp, () => { const b = KON.players[1].items.filter((i) => i.kind === 'block' && (i.n === 9 || i.n === 3)); return b.every((x) => x.state === 'cooldown' || x.state === 'ground'); }, null, 3000);
    const pg = await ev(gp, () => KON.players[1].items.filter((i) => i.kind === 'weapon').map((w) => w.price));
    await waitFor(hp, (e) => KON.players[1].items.filter((i) => i.kind === 'weapon').map((w) => w.price).join() === e.join(), pg, 3000);
  });
  await T('mortar host: rentetan 4 peluru muncul di layar tamu', async () => {
    await ev(hp, () => { const p = KON.players[0], W = p.items.find((i) => i.kind === 'weapon' && i.w === 2); W.price = 7; p.items.filter((i) => i.kind === 'block' && [3, 4].includes(i.n)).forEach((b) => { b.state = 'ground'; }); });
    await ev(hp, () => {
      const p = KON.players[0], W = p.items.find((i) => i.kind === 'weapon' && i.w === 2);
      for (const n of [3, 4]) { const b = p.items.find((i) => i.kind === 'block' && i.n === n); p.x = b.x + 1; p.z = b.z; p.obj.position.x = p.x; p.obj.position.z = p.z; p.findTarget(); p.act('interact'); p.x = W.fx; p.z = W.fz; p.obj.position.x = p.x; p.obj.position.z = p.z; p.findTarget(); p.act('interact'); }
    });
    await waitFor(gp, () => KON.projs.some((p) => p.mt), null, 4000);
    await waitFor(gp, () => KON.players[0].items.find((i) => i.kind === 'weapon' && i.w === 2).shots >= 1, null, 2000);
  });
  await T('HP tembok tamu 0 → kastil terbuka; kastil tamu terkena → host memutuskan akhir, kedua layar menang/kalah sama', async () => {
    await ev(gp, () => { KON.HP.set(1, 'wall', 0); KON.HP.refresh(); KON.ON.hpDirty = true; });
    await waitFor(hp, () => KON.Wall.isDown(1), null, 3000);
    await ev(gp, () => KON.damageCastle(1, 1200));
    await waitFor(hp, () => KON.Match.over, null, 4000); await waitFor(gp, () => KON.Match.over, null, 4000);
    assert.strictEqual(await ev(hp, () => KON.Match.winner), 0); assert.strictEqual(await ev(gp, () => KON.Match.winner), 0);
    assert.strictEqual(await ev(gp, () => KON.Match.reason), 'castle');
    assert(await ev(hp, () => KON.Castle.isDown(1)));
  });
  await T('rematch: tamu minta, host mulai → kedua dunia reset, ronde baru', async () => {
    const e0 = await ev(hp, () => KON.ON.epoch);
    await waitFor(gp, () => !document.querySelector('#rep').classList.contains('hide'), null, 5000);
    await gp.click('#rep');
    await waitFor(hp, (e) => KON.ON.epoch === e + 1 && !KON.Match.over, e0, 5000);
    await waitFor(gp, (e) => KON.ON.epoch === e + 1 && !KON.Match.over, e0, 5000);
    for (const pg of [hp, gp]) {
      assert.strictEqual(await ev(pg, () => [KON.HP.get(0, 'wall'), KON.HP.get(0, 'castle'), KON.HP.get(1, 'wall'), KON.HP.get(1, 'castle')].join()), '1800,1200,1800,1200');
      assert.strictEqual(await ev(pg, () => KON.players.every((p) => p.items.filter((i) => i.kind === 'block').every((b) => b.state === 'ground') && !p.carry)), true);
      assert.strictEqual(await ev(pg, () => KON.Castle.isDown(1) || KON.Wall.isDown(1)), false);
      assert.strictEqual(await ev(pg, () => KON.projs.length), 0);
    }
    await waitFor(hp, () => KON.Match.left < 600 && KON.Match.left > 590, null, 15000);
  });
  await T('waktu habis & HP berbeda: host memutuskan pemenang (HP kastil lebih tinggi)', async () => {
    await waitFor(gp, () => KON.Net.started);
    await ev(gp, () => { KON.HP.set(1, 'wall', 0); KON.HP.refresh(); KON.damageCastle(1, 100); });   // kastil tamu 1100
    await waitFor(hp, () => KON.HP.get(1, 'castle') === 1100, null, 3000);
    await ev(hp, () => { KON.Match.left = 0.05; });
    await waitFor(hp, () => KON.Match.over, null, 4000); await waitFor(gp, () => KON.Match.over, null, 4000);
    assert.strictEqual(await ev(gp, () => KON.Match.winner), 0); assert.strictEqual(await ev(gp, () => KON.Match.reason), 'time');
  });
  await T('rematch dari host, lalu waktu habis HP sama → sudden death serentak', async () => {
    await hp.click('#rep');
    await waitFor(hp, () => !KON.Match.over && KON.Match.left > 590, null, 15000); await waitFor(gp, () => !KON.Match.over && KON.Match.left > 590, null, 15000);
    await ev(hp, () => { KON.Match.left = 0.05; });
    await waitFor(hp, () => KON.Match.sd, null, 4000); await waitFor(gp, () => KON.Match.sd, null, 4000);
    // sudden death: tamu terkena duluan → tamu kalah (host memutuskan)
    await ev(gp, () => { KON.HP.set(1, 'wall', 0); KON.HP.refresh(); KON.damageCastle(1, 150); });
    await waitFor(hp, () => KON.Match.over, null, 4000); await waitFor(gp, () => KON.Match.over, null, 4000);
    assert.strictEqual(await ev(hp, () => KON.Match.winner), 0); assert.strictEqual(await ev(gp, () => KON.Match.reason), 'sd');
  });
  await T('tamu keluar setelah hasil: host tetap melihat hasil, rematch dimatikan', async () => {
    await gp.evaluate(() => KON.Net.ses.leave());
    await waitFor(hp, () => KON.ON.peerGone === true, null, 8000);
    assert.strictEqual(await ev(hp, () => KON.Match.over), true);
  });
  await H.ctx.close(); await G.ctx.close();
}

(async () => {
  const srv = await start(0), base = 'http://localhost:' + srv.address().port;
  const browser = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--autoplay-policy=no-user-gesture-required'] });
  await suite(browser, base, 'P2P / WebRTC', {});
  await suite(browser, base, 'RELAY via Vercel+Redis (tanpa WebRTC)', { noRTC: true });

  console.log('\n[Room Master]');
  {
    const { H, G, code } = await lobby(browser, base);
    await waitFor(H.page, () => KON.Match.left <= 599, null, 15000); await waitFor(G.page, () => KON.Match.left <= 599, null, 15000);
    await ev(G.page, () => { const p = KON.players[1], b = p.items.find((i) => i.kind === 'block' && i.n === 5); p.x = b.x - 1; p.z = b.z; p.obj.position.x = p.x; p.obj.position.z = p.z; p.findTarget(); p.act('interact'); });
    const M = await mk(browser, base, { label: 'master', url: '/?r=' + code + '&role=master' });
    await T('Room Master bergabung di tengah pertandingan dan melihat kedua kerajaan', async () => {
      await waitFor(M.page, () => KON.Net.started && KON.ON.spec, null, 20000);
      await waitFor(M.page, () => KON.players[1].carry && KON.players[1].carry.n === 5, null, 5000);
      assert.strictEqual(await ev(M.page, () => KON.ON.L), -1);
      await waitFor(M.page, () => KON.Match.left < 599.9, null, 3000);
    });
    await T('master menerima tembakan & HP dari tamu (diteruskan host), tanpa menerapkan damage sendiri', async () => {
      await ev(H.page, () => { KON.ON.hpDirty = false; });
      await ev(G.page, () => { const p = KON.players[1]; p.items.filter((i) => i.kind === 'weapon').forEach((w) => { w.price = 5; }); const b = p.carry, W = p.items.find((i) => i.kind === 'weapon' && i.w === 0); p.x = W.fx; p.z = W.fz; p.obj.position.x = p.x; p.obj.position.z = p.z; p.findTarget(); p.act('interact'); });
      await waitFor(M.page, () => KON.projs.length > 0, null, 5000);
      await waitFor(M.page, () => KON.HP.get(0, 'wall') === 1700, null, 8000);
    });
    await T('tombol & input master tidak berpengaruh', async () => {
      await M.page.keyboard.press('KeyE'); await sleep(100);
      assert.strictEqual(await ev(M.page, () => KON.players.every((p) => !p.ring.visible)), true);
    });
    await H.ctx.close(); await G.ctx.close(); await M.ctx.close();
  }
  await browser.close(); srv.close();
  console.log('\n' + pass + ' lulus, ' + fail + ' gagal');
})();
