const express = require("express");
const cors = require("cors");
const qrcode = require("qrcode");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs");

const app = express();
const PORT = 3333; // Gunakan port 3001 untuk Aset, dan misal 3002 untuk Poliklinik nanti

app.use(cors());
app.use(express.json());

// State Management
let sock;
let currentStatus = "disconnected"; // disconnected, qr_ready, connected
let qrCodeData = null;
let botUser = null;

const sessionFolder = "auth_info_baileys"; // Nama folder sesi

async function connectToWhatsApp() {
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`Menggunakan WA v${version.join(".")}, isLatest: ${isLatest}`);
  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

  sock = makeWASocket({
    version,
    auth: state,
    // printQRInTerminal: true,
    logger: pino({ level: "silent" }), // Matikan log bawaan agar terminal lebih bersih
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentStatus = "qr_ready";
      // Convert QR string ke Base64 Data URL untuk ditampilkan di HTML
      qrCodeData = await qrcode.toDataURL(qr);
      console.log("QR Code siap di-scan!");
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("Koneksi terputus. Alasan:", lastDisconnect.error?.message);

      if (shouldReconnect) {
        console.log("Mencoba menghubungkan kembali...");
        connectToWhatsApp();
      } else {
        console.log("Sesi logout. Silakan scan QR baru.");
        currentStatus = "disconnected";
        qrCodeData = null;
        botUser = null;

        // Hapus folder sesi jika logout agar bisa scan ulang bersih
        if (fs.existsSync(sessionFolder)) {
          fs.rmSync(sessionFolder, { recursive: true, force: true });
        }
        // Mulai ulang proses untuk generate QR baru
        setTimeout(connectToWhatsApp, 2000);
      }
    } else if (connection === "open") {
      console.log("Berhasil terhubung ke WhatsApp!");
      currentStatus = "connected";
      qrCodeData = null; // Hapus QR karena sudah terhubung
      botUser = sock.user;
    }
  });

  // Contoh listener untuk pesan masuk (Bisa kamu kembangkan sendiri nanti)
  sock.ev.on("messages.upsert", async (m) => {
    // Logika balasan bot Aset/Poliklinik di sini
  });
}

// ==========================================
// API ENDPOINTS UNTUK DASHBOARD
// ==========================================

// 1. Endpoint Cek Status
app.get("/api/status", (req, res) => {
  res.json({
    service: "WhatsApp Bot Monitoring System",
    status: currentStatus,
    user: botUser ? botUser.id.split(":")[0] : null, // Ambil nomor HP saja
  });
});

// 2. Endpoint Ambil QR Code
app.get("/api/qr", (req, res) => {
  if (currentStatus === "connected") {
    return res.status(400).json({
      success: false,
      message: "Bot sudah terhubung, tidak perlu QR.",
    });
  }

  if (currentStatus === "qr_ready" && qrCodeData) {
    return res.json({ success: true, qr: qrCodeData });
  }

  res.status(202).json({
    success: false,
    message: "QR Code sedang disiapkan, coba lagi dalam beberapa detik.",
  });
});

// 4. Endpoint Kirim Pesan (Teks & Dokumen)
app.post("/api/send-message", async (req, res) => {
  // Pastikan bot sudah jalan dan konek
  if (currentStatus !== "connected" || !sock) {
    return res
      .status(400)
      .json({ success: false, message: "Bot belum terhubung ke WhatsApp." });
  }

  // Ambil data dari body request
  const { number, type, text, file_url, file_name } = req.body;

  if (!number) {
    return res
      .status(400)
      .json({ success: false, message: "Nomor tujuan wajib diisi." });
  }

  // Format nomor HP menjadi format JID WhatsApp (628xxx@s.whatsapp.net) atau JID Grup
  let formattedNumber = number.toString();
  
  // Jika bukan grup (tidak mengandung @g.us), format sebagai nomor personal
  if (!formattedNumber.endsWith("@g.us")) {
    formattedNumber = formattedNumber.replace(/[^0-9]/g, "");
    if (formattedNumber.startsWith("0")) {
      formattedNumber = "62" + formattedNumber.substring(1);
    }
    if (!formattedNumber.endsWith("@s.whatsapp.net")) {
      formattedNumber += "@s.whatsapp.net";
    }
  }

  try {
    // Cek apakah nomor tujuan terdaftar di WA (Hanya untuk personal, skip untuk grup)
    if (formattedNumber.endsWith("@s.whatsapp.net")) {
      const [result] = await sock.onWhatsApp(formattedNumber);
      if (!result || !result.exists) {
        return res
          .status(404)
          .json({
            success: false,
            message: "Nomor tidak terdaftar di WhatsApp.",
          });
      }
    }

    let sendResult;

    // Logika pengiriman berdasarkan tipe
    if (type === "document" && file_url) {
      // Kirim Dokumen (PDF) beserta caption
      sendResult = await sock.sendMessage(formattedNumber, {
        document: { url: file_url }, // URL file PDF (bisa dari localhost PHP kamu)
        mimetype: "application/pdf",
        fileName: file_name || "dokumen.pdf",
        caption: text || "", // Caption teks di bawah file
      });
    } else {
      // Kirim Pesan Teks Biasa
      sendResult = await sock.sendMessage(formattedNumber, {
        text: text || "",
      });
    }

    res.json({
      success: true,
      message: "Pesan berhasil dikirim.",
      data: sendResult,
    });
  } catch (error) {
    console.error("Error sending message:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Gagal mengirim pesan.",
        error: error.message,
      });
  }
});

// 3. Endpoint Logout (Memutus Koneksi dari Dashboard)
app.post("/api/logout", async (req, res) => {
  if (currentStatus === "connected" && sock) {
    await sock.logout();
    res.json({ success: true, message: "Berhasil logout." });
  } else {
    res.status(400).json({ success: false, message: "Bot belum terhubung." });
  }
});

// 5. Endpoint Ambil Daftar Grup
app.get("/api/groups", async (req, res) => {
  if (currentStatus !== "connected" || !sock) {
    return res.status(400).json({ 
      success: false, 
      message: "Bot belum terhubung ke WhatsApp." 
    });
  }

  try {
    // Menarik semua metadata grup di mana bot bergabung
    const groups = await sock.groupFetchAllParticipating();

    // Memformat objek menjadi array yang bersih
    const formattedGroups = Object.values(groups).map((group) => ({
      id: group.id,             // ID Grup (berakhiran @g.us)
      name: group.subject,      // Nama Grup
      // isAnnounce: group.announce // true jika grup dibatasi hanya admin yang bisa chat
    }));

    res.json({
      success: true,
      message: "Berhasil mengambil daftar grup.",
      data: formattedGroups,
    });
  } catch (error) {
    console.error("Error fetching groups:", error);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil daftar grup.",
      error: error.message,
    });
  }
});

const HOST = '0.0.0.0'
// Jalankan server Express dan fungsi WhatsApp
app.listen(PORT,HOST, () => {
  console.log(`Service Bot berjalan di http://${HOST}:${PORT}`);
  connectToWhatsApp();
});
