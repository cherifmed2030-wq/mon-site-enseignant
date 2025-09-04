const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const XLSX = require('xlsx');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = require('node-fetch');
const { createPool } = require('@vercel/postgres');

// --- Connexion Postgres ---
const connectionString =
  process.env.DATABASE_CONNECTION_URL ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL;

if (!connectionString) {
  console.error("❌ Aucune variable de connexion Postgres trouvée (DATABASE_CONNECTION_URL / POSTGRES_URL / DATABASE_URL)");
}

const pool = createPool({ connectionString });
const sql = pool.sql;

// --- App Express ---
const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(fileUpload());

// --- Configuration et constantes ---
const WORD_TEMPLATE_URL = process.env.WORD_TEMPLATE_URL;
let geminiModel;

if (process.env.GEMINI_API_KEY) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
  console.log('✅ SDK Google Gemini initialisé.');
} else {
  console.warn('⚠️ GEMINI_API_KEY non défini.');
}

// ===== Dates des semaines =====
const specificWeekDateRangesNode = {
  1:{start:'2025-08-31',end:'2025-09-04'}, 2:{start:'2025-09-07',end:'2025-09-11'},
  3:{start:'2025-09-14',end:'2025-09-18'}, 4:{start:'2025-09-21',end:'2025-09-25'},
  5:{start:'2025-09-28',end:'2025-10-02'}, 6:{start:'2025-10-05',end:'2025-10-09'},
  7:{start:'2025-10-12',end:'2025-10-16'}, 8:{start:'2025-10-19',end:'2025-10-23'},
  9:{start:'2025-10-26',end:'2025-10-30'},10:{start:'2025-11-02',end:'2025-11-06'},
 11:{start:'2025-11-09',end:'2025-11-13'},12:{start:'2025-11-16',end:'2025-11-20'},
 13:{start:'2025-11-23',end:'2025-11-27'},14:{start:'2025-11-30',end:'2025-12-04'},
 15:{start:'2025-12-07',end:'2025-12-11'},16:{start:'2025-12-14',end:'2025-12-18'},
 17:{start:'2025-12-21',end:'2025-12-25'},18:{start:'2025-12-28',end:'2026-01-01'},
 19:{start:'2026-01-04',end:'2026-01-08'},20:{start:'2026-01-11',end:'2026-01-15'},
 21:{start:'2026-01-18',end:'2026-01-22'},22:{start:'2026-01-25',end:'2026-01-29'},
 23:{start:'2026-02-01',end:'2026-02-05'},24:{start:'2026-02-08',end:'2026-02-12'},
 25:{start:'2026-02-15',end:'2026-02-19'},26:{start:'2026-02-22',end:'2026-02-26'},
 27:{start:'2026-03-01',end:'2026-03-05'},28:{start:'2026-03-08',end:'2026-03-12'},
 29:{start:'2026-03-15',end:'2026-03-19'},30:{start:'2026-03-22',end:'2026-03-26'},
 31:{start:'2026-03-29',end:'2026-04-02'},32:{start:'2026-04-05',end:'2026-04-09'},
 33:{start:'2026-04-12',end:'2026-04-16'},34:{start:'2026-04-19',end:'2026-04-23'},
 35:{start:'2026-04-26',end:'2026-04-30'},36:{start:'2026-05-03',end:'2026-05-07'},
 37:{start:'2026-05-10',end:'2026-05-14'},38:{start:'2026-05-17',end:'2026-05-21'},
 39:{start:'2026-05-24',end:'2026-05-28'},40:{start:'2026-05-31',end:'2026-06-04'},
 41:{start:'2026-06-07',end:'2026-06-11'},42:{start:'2026-06-14',end:'2026-06-18'},
 43:{start:'2026-06-21',end:'2026-06-25'},44:{start:'2026-06-28',end:'2026-07-02'},
 45:{start:'2026-07-05',end:'2026-07-09'},46:{start:'2026-07-12',end:'2026-07-16'},
 47:{start:'2026-07-19',end:'2026-07-23'},48:{start:'2026-07-26',end:'2026-07-30'}
};

// ===== Utilisateurs valides =====
const validUsers = {
  "Zine": "Zine", "Abas": "Abas", "Tonga": "Tonga", "Morched": "Morched",
  "Youssif": "Youssif", "Med Ali": "Med Ali", "Sami": "Sami", "AutreProf": "AutreProf",
  "Mohamed": "Mohamed",
  "جابر": "جابر", "سعيد": "سعيد", "ماجد": "ماجد", "kamel": "kamel"
};

// --- Fonctions utilitaires ---
function formatDateFrenchNode(date) {
  if (!date || isNaN(date.getTime())) return "Date invalide";
  const days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  const months = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  const dayName = days[date.getUTCDay()];
  const dayNum = String(date.getUTCDate()).padStart(2, '0');
  const monthName = months[date.getUTCMonth()];
  const yearNum = date.getUTCFullYear();
  return `${dayName} ${dayNum} ${monthName} ${yearNum}`;
}

function getDateForDayNameNode(weekStartDate, dayName) {
  if (!weekStartDate || isNaN(weekStartDate.getTime())) return null;
  const dayOrder = { "Dimanche": 0, "Lundi": 1, "Mardi": 2, "Mercredi": 3, "Jeudi": 4 };
  const offset = dayOrder[dayName];
  if (offset === undefined) return null;
  const specificDate = new Date(Date.UTC(
    weekStartDate.getUTCFullYear(),
    weekStartDate.getUTCMonth(),
    weekStartDate.getUTCDate()
  ));
  specificDate.setUTCDate(specificDate.getUTCDate() + offset);
  return specificDate;
}

// --- Routes de test ---
app.get('/api/test-db', async (req, res) => {
  try {
    const { rows } = await sql`SELECT NOW() as now;`;
    res.status(200).json({ message: "✅ Connexion OK", time: rows[0].now });
  } catch (error) {
    console.error("❌ Test DB error:", error);
    res.status(500).json({ message: "Erreur connexion DB", error: error.message });
  }
});

// --- Ici, remets toutes tes routes API existantes (login, save-plan, save-row, save-notes, all-classes, generate-word, etc.)

// Exporter l'app pour Vercel
module.exports = app;
