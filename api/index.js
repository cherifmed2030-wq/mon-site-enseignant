const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const XLSX = require('xlsx');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = require('node-fetch');
const { MongoClient } = require('mongodb'); // Utilise le driver officiel MongoDB

const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(fileUpload());

// --- Configuration et constantes ---
const MONGO_URL = process.env.MONGO_URL;
const WORD_TEMPLATE_URL = process.env.WORD_TEMPLATE_URL;
let geminiModel;

if (!MONGO_URL) {
    console.error('FATAL: La variable d\'environnement MONGO_URL n\'est pas définie.');
}

if (process.env.GEMINI_API_KEY) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
    console.log('✅ SDK Google Gemini initialisé.');
} else {
    console.warn('⚠️ GEMINI_API_KEY non défini.');
}

// --- Vos dernières configurations (dates et utilisateurs) ---
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
const validUsers = {
    "Zine": "Zine", "Abas": "Abas", "Tonga": "Tonga", "Morched": "Morched",
    "Youssef": "Youssef", "Med Ali": "Med Ali", "Sami": "Sami", "AutreProf": "AutreProf",
    "Mohamed": "Mohamed", "جابر": "جابر", "سعيد": "سعيد", "ماجد": "ماجد", "kamel": "kamel"
};

// --- Logique de Connexion à MongoDB pour Vercel ---
let cachedDb = null;
async function connectToDatabase() {
    if (cachedDb) {
        return cachedDb;
    }
    if (!MONGO_URL) {
        throw new Error('La variable MONGO_URL est manquante.');
    }
    const client = new MongoClient(MONGO_URL);
    await client.connect();
    const db = client.db(); // Le nom de la DB est dans l'URL
    cachedDb = db;
    return db;
}

// --- Fonctions utilitaires ---
function formatDateFrenchNode(date) { if (!date || isNaN(date.getTime())) { return "Date invalide"; } const days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"]; const months = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]; const dayName = days[date.getUTCDay()]; const dayNum = String(date.getUTCDate()).padStart(2, '0'); const monthName = months[date.getUTCMonth()]; const yearNum = date.getUTCFullYear(); return `${dayName} ${dayNum} ${monthName} ${yearNum}`; }
function getDateForDayNameNode(weekStartDate, dayName) { if (!weekStartDate || isNaN(weekStartDate.getTime())) return null; const dayOrder = { "Dimanche": 0, "Lundi": 1, "Mardi": 2, "Mercredi": 3, "Jeudi": 4 }; const offset = dayOrder[dayName]; if (offset === undefined) return null; const specificDate = new Date(Date.UTC(weekStartDate.getUTCFullYear(), weekStartDate.getUTCMonth(), weekStartDate.getUTCDate())); specificDate.setUTCDate(specificDate.getUTCDate() + offset); return specificDate; }
const findKey = (obj, target) => obj ? Object.keys(obj).find(k => k.trim().toLowerCase() === target.toLowerCase()) : undefined;


// --- Routes de l'API ---

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (validUsers[username] && validUsers[username] === password) {
        res.status(200).json({ success: true, username: username });
    } else {
        res.status(401).json({ success: false, message: 'Identifiants invalides' });
    }
});

app.get('/api/plans/:week', async (req, res) => {
    const { week } = req.params;
    const weekNumber = parseInt(week, 10);
    if (isNaN(weekNumber)) return res.status(400).json({ message: 'Semaine invalide.' });

    try {
        const db = await connectToDatabase();
        const planDocument = await db.collection('plans').findOne({ week: weekNumber });
        if (planDocument) {
            res.status(200).json({ planData: planDocument.data || [], classNotes: planDocument.classNotes || {} });
        } else {
            res.status(200).json({ planData: [], classNotes: {} });
        }
    } catch (error) {
        console.error('Erreur MongoDB /plans/:week:', error);
        res.status(500).json({ message: 'Erreur serveur.' });
    }
});

app.post('/api/save-plan', async (req, res) => {
    const { week, data } = req.body;
    const weekNumber = parseInt(week, 10);
    if (isNaN(weekNumber) || !Array.isArray(data)) return res.status(400).json({ message: 'Données invalides.' });
    try {
        const db = await connectToDatabase();
        await db.collection('plans').updateOne(
            { week: weekNumber },
            { $set: { data: data } },
            { upsert: true }
        );
        res.status(200).json({ message: `Plan S${weekNumber} enregistré.` });
    } catch (error) {
        console.error('Erreur MongoDB /save-plan:', error);
        res.status(500).json({ message: 'Erreur serveur.' });
    }
});

app.post('/api/save-notes', async (req, res) => {
    const { week, classe, notes } = req.body;
    const weekNumber = parseInt(week, 10);
    if (isNaN(weekNumber) || !classe) return res.status(400).json({ message: 'Données invalides.' });
    try {
        const db = await connectToDatabase();
        await db.collection('plans').updateOne(
            { week: weekNumber },
            { $set: { [`classNotes.${classe}`]: notes } },
            { upsert: true }
        );
        res.status(200).json({ message: 'Notes enregistrées.' });
    } catch (error) {
        console.error('Erreur MongoDB /save-notes:', error);
        res.status(500).json({ message: 'Erreur serveur.' });
    }
});

app.post('/api/save-row', async (req, res) => {
    const { week, data: rowData } = req.body;
    const weekNumber = parseInt(week, 10);
    if (isNaN(weekNumber) || typeof rowData !== 'object') return res.status(400).json({ message: 'Données ligne invalides.' });

    try {
        const db = await connectToDatabase();
        const updateFields = {};
        const now = new Date();
        for (const key in rowData) {
            updateFields[`data.$[elem].${key}`] = rowData[key];
        }
        updateFields['data.$[elem].updatedAt'] = now;

        const arrayFilters = [ { "elem.Enseignant": rowData[findKey(rowData, 'Enseignant')], "elem.Classe": rowData[findKey(rowData, 'Classe')], "elem.Jour": rowData[findKey(rowData, 'Jour')], "elem.Période": rowData[findKey(rowData, 'Période')], "elem.Matière": rowData[findKey(rowData, 'Matière')] } ];
        
        const result = await db.collection('plans').updateOne(
            { week: weekNumber },
            { $set: updateFields },
            { arrayFilters: arrayFilters }
        );

        if (result.modifiedCount > 0 || result.matchedCount > 0) {
            res.status(200).json({ message: 'Ligne enregistrée.', updatedData: { updatedAt: now } });
        } else {
            res.status(404).json({ message: 'Ligne non trouvée pour la mise à jour.' });
        }
    } catch (error) {
        console.error('Erreur MongoDB /save-row:', error);
        res.status(500).json({ message: 'Erreur serveur.' });
    }
});

app.get('/api/all-classes', async (req, res) => {
    try {
        const db = await connectToDatabase();
        const classes = await db.collection('plans').distinct('data.Classe', { 'data.Classe': { $ne: null, $ne: "" } });
        res.status(200).json(classes.sort());
    } catch (error) {
        console.error('Erreur MongoDB /api/all-classes:', error);
        res.status(500).json({ message: 'Erreur serveur.' });
    }
});

// Le reste des routes (génération de fichiers) suit le même modèle
// ... (Copiez ici le reste des routes comme generate-word, generate-excel, etc., de votre fichier original)
// ... Elles devraient fonctionner si les données sont bien dans MongoDB.

// Exporter l'app pour Vercel
module.exports = app;
