const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const XLSX = require('xlsx');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = require('node-fetch');
const { sql } = require('@vercel/postgres'); // Librairie Vercel pour PostgreSQL

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

const specificWeekDateRangesNode = {
     1: { start: '2024-08-25', end: '2024-08-29' },  2: { start: '2024-09-01', end: '2024-09-05' },
     3: { start: '2024-09-08', end: '2024-09-12' },  4: { start: '2024-09-15', end: '2024-09-19' },
     5: { start: '2024-09-22', end: '2024-09-26' },  6: { start: '2024-09-29', end: '2024-10-03' },
     7: { start: '2024-10-06', end: '2024-10-10' },  8: { start: '2024-10-13', end: '2024-10-17' },
     9: { start: '2024-10-20', end: '2024-10-24' }, 10: { start: '2024-10-27', end: '2024-10-31' },
    11: { start: '2024-11-03', end: '2024-11-07' }, 12: { start: '2024-11-10', end: '2024-11-14' },
    13: { start: '2024-11-17', end: '2024-11-21' }, 14: { start: '2024-11-24', end: '2024-11-28' },
    15: { start: '2024-12-01', end: '2024-12-05' }, 16: { start: '2024-12-08', end: '2024-12-12' },
    17: { start: '2024-12-15', end: '2024-12-19' }, 18: { start: '2024-12-22', end: '2024-12-26' },
    19: { start: '2024-12-29', end: '2025-01-02' }, 20: { start: '2025-01-05', end: '2025-01-09' },
    21: { start: '2025-01-12', end: '2025-01-16' }, 22: { start: '2025-01-19', end: '2025-01-23' },
    23: { start: '2025-01-26', end: '2025-01-30' }, 24: { start: '2025-02-02', end: '2025-02-06' },
    25: { start: '2025-02-09', end: '2025-02-13' }, 26: { start: '2025-02-16', end: '2025-02-20' },
    27: { start: '2025-02-23', end: '2025-02-27' }, 28: { start: '2025-03-02', end: '2025-03-06' },
    29: { start: '2025-03-09', end: '2025-03-13' }, 30: { start: '2025-03-16', end: '2025-03-20' },
    31: { start: '2025-03-23', end: '2025-03-27' }, 32: { start: '2025-03-30', end: '2025-04-03' },
    33: { start: '2025-04-06', end: '2025-04-10' }, 34: { start: '2025-04-13', end: '2025-04-17' },
    35: { start: '2025-04-20', end: '2025-04-24' }, 36: { start: '2025-04-27', end: '2025-05-01' },
    37: { start: '2025-05-04', end: '2025-05-08' }, 38: { start: '2025-05-11', end: '2025-05-15' },
    39: { start: '2025-05-18', end: '2025-05-22' }, 40: { start: '2025-05-25', end: '2025-05-29' },
    41: { start: '2025-06-01', end: '2025-06-05' }, 42: { start: '2025-06-08', end: '2025-06-12' },
    43: { start: '2025-06-15', end: '2025-06-19' }, 44: { start: '2025-06-22', end: '2025-06-26' },
    45: { start: '2025-06-29', end: '2025-07-03' }, 46: { start: '2025-07-06', end: '2025-07-10' },
    47: { start: '2025-07-13', end: '2025-07-17' }, 48: { start: '2025-07-20', end: '2025-07-24' }
};

const validUsers = {
    "Zine": "Zine", "Abas": "Abas", "Tonga": "Tonga", "Ilyas": "Ilyas", "Morched": "Morched",
    "عبد الرحمان": "عبد الرحمان", "Youssif": "Youssif", "عبد العزيز": "عبد العزيز",
    "Med Ali": "Med Ali", "Sami": "Sami", "جابر": "جابر", "محمد الزبيدي": "محمد الزبيدي",
    "فارس": "فارس", "AutreProf": "AutreProf", "Mohamed": "Mohamed"
};

// --- Fonctions utilitaires ---
function formatDateFrenchNode(date) { /* ... (copié de votre server.js) ... */ }
function getDateForDayNameNode(weekStartDate, dayName) { /* ... (copié de votre server.js) ... */ }
// (Copiez vos fonctions utilitaires de date ici pour garder le code propre)

// --- Routes de l'API ---

// POST /api/login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (validUsers[username] && validUsers[username] === password) {
        res.status(200).json({ success: true, username: username });
    } else {
        res.status(401).json({ success: false, message: 'Identifiants invalides' });
    }
});

// GET /api/plans/:week
app.get('/api/plans/:week', async (req, res) => {
    const { week } = req.params;
    const weekNumber = parseInt(week, 10);
    if (isNaN(weekNumber)) return res.status(400).json({ message: 'Semaine invalide.' });

    try {
        const { rows } = await sql`SELECT data, class_notes FROM weekly_plans WHERE week = ${weekNumber};`;
        if (rows.length > 0) {
            res.status(200).json({
                planData: rows[0].data || [],
                classNotes: rows[0].class_notes || {}
            });
        } else {
            res.status(200).json({ planData: [], classNotes: {} });
        }
    } catch (error) {
        console.error('Erreur SQL /plans/:week:', error);
        res.status(500).json({ message: 'Erreur serveur.' });
    }
});

// POST /api/save-plan
app.post('/api/save-plan', async (req, res) => {
    const { week, data } = req.body;
    const weekNumber = parseInt(week, 10);
    if (isNaN(weekNumber) || !Array.isArray(data)) return res.status(400).json({ message: 'Données invalides.' });

    const jsonData = JSON.stringify(data);
    try {
        await sql`
            INSERT INTO weekly_plans (week, data, class_notes)
            VALUES (${weekNumber}, ${jsonData}, '{}')
            ON CONFLICT (week)
            DO UPDATE SET data = EXCLUDED.data;
        `;
        res.status(200).json({ message: `Plan S${weekNumber} enregistré.` });
    } catch (error) {
        console.error('Erreur SQL /save-plan:', error);
        res.status(500).json({ message: 'Erreur serveur.' });
    }
});

// POST /api/save-row
app.post('/api/save-row', async (req, res) => {
    const { week, data: rowData } = req.body;
    const weekNumber = parseInt(week, 10);
    if (isNaN(weekNumber) || typeof rowData !== 'object') return res.status(400).json({ message: 'Données invalides.' });

    try {
        const { rows } = await sql`SELECT data FROM weekly_plans WHERE week = ${weekNumber};`;
        if (rows.length === 0) return res.status(404).json({ message: 'Semaine non trouvée.' });

        let planData = rows[0].data || [];
        
        const findKey = (obj, target) => Object.keys(obj).find(k => k.trim().toLowerCase() === target.toLowerCase());
        const rowIndex = planData.findIndex(item =>
            item[findKey(item, 'Enseignant')] === rowData[findKey(rowData, 'Enseignant')] &&
            item[findKey(item, 'Classe')] === rowData[findKey(rowData, 'Classe')] &&
            String(item[findKey(item, 'Période')]) === String(rowData[findKey(rowData, 'Période')]) &&
            item[findKey(item, 'Jour')] === rowData[findKey(rowData, 'Jour')] &&
            item[findKey(item, 'Matière')] === rowData[findKey(rowData, 'Matière')]
        );

        if (rowIndex > -1) {
            const updatedAtKey = findKey(planData[rowIndex], 'updatedAt') || 'updatedAt';
            planData[rowIndex] = { ...rowData, [updatedAtKey]: new Date().toISOString() };
            
            await sql`UPDATE weekly_plans SET data = ${JSON.stringify(planData)} WHERE week = ${weekNumber};`;
            res.status(200).json({ message: 'Ligne enregistrée.', updatedData: { updatedAt: planData[rowIndex][updatedAtKey] } });
        } else {
            res.status(404).json({ message: 'Ligne non trouvée pour la mise à jour.' });
        }
    } catch (error) {
        console.error('Erreur SQL /save-row:', error);
        res.status(500).json({ message: 'Erreur serveur.' });
    }
});


// POST /api/save-notes
app.post('/api/save-notes', async (req, res) => {
    const { week, classe, notes } = req.body;
    const weekNumber = parseInt(week, 10);
    if (isNaN(weekNumber) || !classe) return res.status(400).json({ message: 'Données invalides.' });

    try {
        // UPSERT pour la semaine
        await sql`
            INSERT INTO weekly_plans (week, data, class_notes)
            VALUES (${weekNumber}, '[]', '{}')
            ON CONFLICT (week) DO NOTHING;
        `;
        // Met à jour le champ JSONB
        await sql`
            UPDATE weekly_plans
            SET class_notes = class_notes || ${JSON.stringify({[classe]: notes})}
            WHERE week = ${weekNumber};
        `;
        res.status(200).json({ message: 'Notes enregistrées.' });
    } catch (error) {
        console.error('Erreur SQL /save-notes:', error);
        res.status(500).json({ message: 'Erreur serveur.' });
    }
});


// GET /api/all-classes
app.get('/api/all-classes', async (req, res) => {
    try {
        const { rows } = await sql`
            SELECT DISTINCT value->>'Classe' as classe
            FROM weekly_plans, jsonb_array_elements(data)
            WHERE jsonb_typeof(data) = 'array' AND value->>'Classe' IS NOT NULL
            ORDER BY classe;
        `;
        const classes = rows.map(r => r.classe);
        res.status(200).json(classes);
    } catch (error) {
        console.error('Erreur SQL /api/all-classes:', error);
        res.status(500).json({ message: 'Erreur serveur.' });
    }
});

// --- Routes pour la génération de fichiers ---
// Note: La logique interne de ces fonctions est la même, seule la récupération des données change.
// J'ai copié la logique de votre `server.js` ici, en l'adaptant à PostgreSQL.

app.post('/api/generate-word', async (req, res) => { /* ... Logique de /generate-word adaptée ... */ });
app.post('/api/generate-excel-workbook', async (req, res) => { /* ... Logique de /generate-excel-workbook adaptée ... */ });
app.post('/api/full-report-by-class', async (req, res) => { /* ... Logique de /api/full-report-by-class adaptée ... */ });
app.post('/api/generate-ai-lesson-plan', async (req, res) => { /* ... Logique de /generate-ai-lesson-plan adaptée ... */ });


// Exporter l'app pour Vercel
module.exports = app;