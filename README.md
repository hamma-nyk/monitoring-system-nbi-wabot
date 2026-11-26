# Monitoring Bot (WhatsApp Service)

Service REST API berbasis **Node.js**, **Express**, dan **Baileys** untuk integrasi notifikasi WhatsApp (pesan teks dan dokumen PDF) yang dapat dijalankan secara manual maupun sebagai **Windows Service** di background.

---

## Prasyarat

- **Node.js** (disarankan versi LTS terbaru) & **npm**
- **Sistem Operasi Windows** (jika ingin menjalankan sebagai Windows Service menggunakan `node-windows`)
- Akses **Administrator** pada terminal (khusus untuk instalasi/pengelolaan Windows Service)

---

## Instalasi

1. Masuk ke direktori project:
   ```powershell
   cd D:\PROJECT\monitoring-bot
   ```

2. Install seluruh dependency yang dibutuhkan:
   ```powershell
   npm install
   ```

---

## Kustomisasi Port & Path

Port dan path bersifat fleksibel dan dapat disesuaikan langsung dengan mengedit file konfigurasi terkait:

- **Custom Port & Host (`server.js`)**  
  Ubah nilai `PORT` (default `3333`) dan `HOST` (default `'0.0.0.0'`) di `server.js` sesuai kebutuhan:
  ```javascript
  const PORT = 3333;
  const HOST = '0.0.0.0';
  ```
- **Custom Path Service (`nodeService.js`)**  
  Jika folder project dipindahkan atau berada di lokasi lain, edit properti `script` (serta `name` / `description` jika ingin menjalankan lebih dari satu instance service) di `nodeService.js`:
  ```javascript
  const svc = new Service({
    name: 'MonitoringBOT',
    description: 'WhatsappBOT Service',
    script: 'D:\\PROJECT\\monitoring-bot\\server.js'
  })
  ```
- **Custom Folder Sesi (`server.js`)**  
  Nama/lokasi folder penyimpanan sesi WhatsApp dapat diubah pada variabel `sessionFolder` (default `'auth_info_baileys'`) di `server.js`.

---

## Menjalankan Service

Service ini berjalan secara default pada **`0.0.0.0:3333`** (dapat diubah pada variabel `PORT` dan `HOST` di `server.js`).

### Opsi 1: Menjalankan Secara Manual (Development / Testing)

Jalankan langsung menggunakan Node.js:
```powershell
node server.js
```
Jika berhasil, akan muncul output:
```text
Service Bot berjalan di http://0.0.0.0:3333
```

---

### Opsi 2: Menjalankan Sebagai Windows Service (Production / Background)

Project ini menggunakan `node-windows` melalui file `nodeService.js` untuk mendaftarkan aplikasi sebagai Windows Service dengan nama **`MonitoringBOT`**.

1. **Periksa Path Script di `nodeService.js`**  
   Pastikan properti `script` pada `nodeService.js` sesuai dengan lokasi absolut file `server.js` di komputer Anda:
   ```javascript
   const svc = new Service({
     name: 'MonitoringBOT',
     description: 'WhatsappBOT Service',
     script: 'D:\\PROJECT\\monitoring-bot\\server.js'
   })
   ```

2. **Buka Terminal sebagai Administrator**  
   Klik kanan pada **PowerShell** atau **Command Prompt (CMD)** lalu pilih **Run as Administrator**.

3. **Install dan Start Service**  
   Masuk ke folder project dan jalankan `nodeService.js`:
   ```powershell
   cd D:\PROJECT\monitoring-bot
   node nodeService.js
   ```
   Script ini akan membuat folder `daemon/`, mendaftarkan service `MonitoringBOT` ke Windows Services, dan langsung menjalankannya (`svc.start()`).

   > **Catatan:** Jika muncul prompt UAC/konfirmasi Windows saat proses instalasi, klik **Yes**.

---

## Mengelola Windows Service (`MonitoringBOT`)

Setelah terpasang sebagai Windows Service, Anda dapat mengelola service melalui **Services GUI** (`Win + R` -> ketik `services.msc` -> cari **MonitoringBOT**) atau melalui terminal **Administrator**:

- **Cek status service:**
  ```powershell
  Get-Service MonitoringBOT
  ```
- **Start service:**
  ```powershell
  Start-Service MonitoringBOT
  ```
  *(atau via CMD: `net start MonitoringBOT`)*

- **Stop service:**
  ```powershell
  Stop-Service MonitoringBOT
  ```
  *(atau via CMD: `net stop MonitoringBOT`)*

- **Restart service:**
  ```powershell
  Restart-Service MonitoringBOT
  ```

- **Hapus / Uninstall service:**
  ```powershell
  Stop-Service MonitoringBOT
  sc.exe delete MonitoringBOT
  ```

### Log Service

Ketika berjalan sebagai Windows Service, log output dan error tersimpan di dalam folder `daemon/`:
- `daemon/monitoringbot.out.log` — Log output standar (`console.log`)
- `daemon/monitoringbot.err.log` — Log error (`console.error`)
- `daemon/monitoringbot.wrapper.log` — Log wrapper `node-windows`

---

## Autentikasi WhatsApp (Scan QR)

1. Pastikan service sudah berjalan (`GET http://localhost:3333/api/status`).
2. Jika status masih `qr_ready`, ambil QR Code melalui endpoint `GET http://localhost:3333/api/qr` (mengembalikan Base64 Data URL gambar QR) lalu tampilkan di dashboard/browser untuk di-scan menggunakan WhatsApp.
3. Setelah terhubung, sesi login disimpan otomatis di folder `auth_info_baileys/` sehingga tidak perlu scan ulang saat service di-restart.
4. Jika sesi logout, folder `auth_info_baileys/` akan dihapus otomatis oleh `server.js` dan QR baru akan dibuat.

---

## Daftar Endpoint API

Base URL: `http://localhost:3333`

| Method | Endpoint | Deskripsi |
| :--- | :--- | :--- |
| `GET` | `/api/status` | Cek status koneksi bot (`disconnected`, `qr_ready`, `connected`) dan nomor WA yang terhubung. |
| `GET` | `/api/qr` | Mengambil QR Code dalam format Base64 Data URL (saat status `qr_ready`). |
| `POST` | `/api/send-message` | Mengirim pesan teks atau dokumen PDF ke nomor personal maupun grup (`@g.us`). |
| `GET` | `/api/groups` | Mengambil daftar semua grup WhatsApp yang diikuti oleh bot. |
| `POST` | `/api/logout` | Memutuskan koneksi WhatsApp dan menghapus sesi aktif. |

### Contoh Request `POST /api/send-message`

**Kirim Pesan Teks:**
```json
{
  "number": "081234567890",
  "text": "Halo, ini pesan monitoring."
}
```

**Kirim Dokumen PDF:**
```json
{
  "number": "081234567890",
  "type": "document",
  "file_url": "http://localhost/laporan.pdf",
  "file_name": "laporan.pdf",
  "text": "Berikut terlampir dokumen laporan."
}
```
*(Untuk mengirim ke grup, isi `number` dengan ID grup berakhiran `@g.us` yang didapat dari `/api/groups`.)*
