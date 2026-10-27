# KINGDOMS OF NUMBERS · Online

Kingdoms of Numbers (balok angka → meriam & mortar) kini bisa **1 vs 1 online realtime dengan kode ruangan**, memakai sistem yang sama dengan *Kingdom Duel Online*: WebRTC langsung antar-perangkat + Vercel + Upstash Redis. Mode **Mulai Perang (Lokal)** 2 pemain 1 perangkat tetap ada.

## Cara kerja (kenapa terasa tanpa lag)
- **Kerajaanmu dijalankan di perangkatmu sendiri**: gerak, ambil/masukkan balok, target, reload, tembakan → respons instan, tidak menunggu jaringan.
- **Kerajaan lawan disalin** 20×/dtk (snapshot posisi+kecepatan, balok, senjata) lewat DataChannel tak-andal; posisi lawan diprediksi (dead reckoning) dan dihaluskan.
- **Tembakan** = kejadian andal; kedua layar menjalankan lintasan yang sama dan dimajukan sebesar latensi satu arah, sehingga benturan serempak.
- **Damage diputuskan pihak yang diserang** (HP tembok/kastilnya sendiri) lalu disiarkan. **Host** memutuskan hasil akhir (kastil hancur / waktu habis / sudden death) dan menyiarkan jam, jadi kedua layar selalu sepakat.
- Badge tengah-atas: `LANGSUNG · xx ms` (P2P) atau `RELAY` (cadangan lewat Vercel+Redis, lebih lambat). P2P gagal ±9 dtk → otomatis relay.
- Host = Kerajaan Biru, tamu = Kerajaan Merah. Keyboard: WASD **atau** panah, E **atau** / ambil-masukkan, Q **atau** . jatuhkan; HP: joystick+tombol kiri.
- **Room Master**: satu penonton (`Main Online → Masuk sebagai Room Master`, atau tautan `?r=KODE&role=master`).
- Online tanpa jeda. Esc 2× / tombol **Keluar** = keluar ruangan. **Main Lagi** = rematch di ruangan yang sama (host memulai).

## Deploy ke Vercel
1. Upload folder ini ke GitHub → Vercel **Add New → Project** (preset **Other**, tanpa build; `vercel.json` sudah benar).
2. **Storage → Upstash Redis** → hubungkan ke proyek (mengisi `KV_REST_API_URL`/`KV_REST_API_TOKEN` atau `UPSTASH_REDIS_REST_*`) → **Redeploy**.
3. *(Sangat disarankan untuk jaringan seluler)* tambahkan TURN: `METERED_APP_NAME` + `METERED_API_KEY` (+ `METERED_REGION`) atau `ICE_SERVERS` — lihat `.env.example`. Cek `/api/room?action=ice` memuat entri `turn:`.
4. Buka URL → **Main Online** → **Buat Ruangan** → kirim kode/tautan.

Three.js dimuat dari CDN (cdnjs, cadangan jsDelivr/unpkg), seperti file aslinya.

## Lokal & tes
```bash
node dev-server.js     # http://localhost:3000 (memori, tanpa Redis)
npm test               # tes API pensinyalan
node test/e2e.js       # host+tamu+Room Master sungguhan, jalur WebRTC & relay (THREE tiruan, tanpa WebGL)
```
## Batasan
- Host dipercaya untuk hasil akhir; tiap perangkat dipercaya untuk kerajaannya (cukup untuk duel antar-teman, bukan anti-cheat).
- Tidak ada sambung-ulang di tengah ronde; putus → layar "Koneksi Terputus" (hasil tetap terlihat bila ronde sudah selesai).
- Tab yang disembunyikan menghentikan animasi browser (kerajaannya ikut berhenti); biarkan tab game tetap terbuka.
- Latensi nyata tetap = jarak jaringan kedua pemain; tidak mungkin benar-benar nol.
