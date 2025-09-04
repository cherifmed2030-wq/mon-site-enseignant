const express = require('express');
console.log(`DEBUG: La variable DATABASE_CONNECTION_URL est : ${process.env.DATABASE_CONNECTION_URL}`);
const cors = require('cors');
const fileUpload = require('express-fileupload');
const XLSX = require('xlsx');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fetch = require('node-fetch');
const { createPool } = require('@vercel/postgres');

const pool = createPool({
  connectionString: process.env.DATABASE_CONNECTION_URL || process.env.POSTGRES_URL,
});
const sql = pool.sql;
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

// ===== MODIFIÉ : Nouvelles dates des semaines (côté serveur) =====
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

// ===== MODIFIÉ : Nouveaux utilisateurs valides pour la connexion =====
const validUsers = {
    "Zine": "Zine", "Abas": "Abas", "Tonga": "Tonga", "Morched": "Morched",
    "Youssif": "Youssif", "Med Ali": "Med Ali", "Sami": "Sami", "AutreProf": "AutreProf",
    "Mohamed": "Mohamed", // Admin
    "جابر": "جابر",     // Nouveau prof arabe
    "سعيد": "سعيد",     // Nouveau prof arabe
    "ماجد": "ماجد",     // Nouveau prof arabe
    "kamel": "kamel"      // Nouveau prof anglais
};

// --- Fonctions utilitaires ---
function formatDateFrenchNode(date) { if (!date || isNaN(date.getTime())) { return "Date invalide"; } const days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"]; const months = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]; const dayName = days[date.getUTCDay()]; const dayNum = String(date.getUTCDate()).padStart(2, '0'); const monthName = months[date.getUTCMonth()]; const yearNum = date.getUTCFullYear(); return `${dayName} ${dayNum} ${monthName} ${yearNum}`; }
function getDateForDayNameNode(weekStartDate, dayName) { if (!weekStartDate || isNaN(weekStartDate.getTime())) return null; const dayOrder = { "Dimanche": 0, "Lundi": 1, "Mardi": 2, "Mercredi": 3, "Jeudi": 4 }; const offset = dayOrder[dayName]; if (offset === undefined) return null; const specificDate = new Date(Date.UTC(weekStartDate.getUTCFullYear(), weekStartDate.getUTCMonth(), weekStartDate.getUTCDate())); specificDate.setUTCDate(specificDate.getUTCDate() + offset); return specificDate; }

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

app.post('/api/save-notes', async (req, res) => {
    const { week, classe, notes } = req.body;
    const weekNumber = parseInt(week, 10);
    if (isNaN(weekNumber) || !classe) return res.status(400).json({ message: 'Données invalides.' });

    try {
        await sql`
            INSERT INTO weekly_plans (week, data, class_notes)
            VALUES (${weekNumber}, '[]', '{}')
            ON CONFLICT (week) DO NOTHING;
        `;
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


// ... (Les autres routes comme generate-word, generate-excel etc. ne changent pas et restent ici)
// Je copie ici la route /api/generate-word pour l'exemple, les autres suivent le même modèle
app.post('/api/generate-word', async (req, res) => {
    try { const { week, classe, data, notes } = req.body; const weekNumber = Number(week); if (!Number.isInteger(weekNumber) || weekNumber <= 0 || weekNumber > 53) return res.status(400).json({ message: 'Semaine invalide.' }); if (!classe || typeof classe !== 'string') return res.status(400).json({ message: 'Classe invalide.' }); if (!Array.isArray(data)) return res.status(400).json({ message: '"data" doit être array.' }); const finalNotes = (typeof notes === 'string') ? notes : ""; 
        let templateBuffer; try { const response = await fetch(WORD_TEMPLATE_URL); if (!response.ok) throw new Error(`Échec modèle Word (${response.status})`); templateBuffer = Buffer.from(await response.arrayBuffer()); } catch (e) { console.error(`[GEN-WORD] ERREUR modèle:`, e); return res.status(500).json({ message: `Erreur récup modèle Word.` }); }
        const zip = new PizZip(templateBuffer); let doc; try { doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => "" }); } catch (e) { console.error(`[GEN-WORD] Erreur init Docxtemplater:`, e); return res.status(500).json({ message: 'Erreur init générateur.' }); }
        const groupedByDay = {}; const dayOrder = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi"]; const datesNode = specificWeekDateRangesNode[weekNumber];
        let weekStartDateNode = null; if (datesNode?.start) { try { weekStartDateNode = new Date(datesNode.start + 'T00:00:00Z'); if (isNaN(weekStartDateNode.getTime())) throw new Error('Date Invalide'); } catch (e) { weekStartDateNode = null; } }
        if (!weekStartDateNode) { return res.status(500).json({ message: `Config Erreur: Dates serveur manquantes pour S${weekNumber}.` }); }
        const sampleRow = data[0] || {}; const findHeaderKey = (target) => Object.keys(sampleRow).find(k => k?.trim().toLowerCase() === target.toLowerCase()) || target; const jourKey = findHeaderKey('Jour'), periodeKey = findHeaderKey('Période'), matiereKey = findHeaderKey('Matière'), leconKey = findHeaderKey('Leçon'), travauxKey = findHeaderKey('Travaux de classe'), supportKey = findHeaderKey('Support'), devoirsKey = findHeaderKey('Devoirs');
        data.forEach(item => { if (!item || typeof item !== 'object') return; const day = item[jourKey]; if (day && dayOrder.includes(day)) { if (!groupedByDay[day]) groupedByDay[day] = []; groupedByDay[day].push(item); } });
        const joursData = dayOrder.map(dayName => { if (groupedByDay[dayName]) { const dateOfDay = getDateForDayNameNode(weekStartDateNode, dayName); const formattedDate = dateOfDay ? formatDateFrenchNode(dateOfDay) : dayName; const sortedEntries = groupedByDay[dayName].sort((a, b) => { const pA = parseInt(a[periodeKey], 10), pB = parseInt(b[periodeKey], 10); if (!isNaN(pA) && !isNaN(pB)) return pA - pB; return String(a[periodeKey] ?? "").localeCompare(String(b[periodeKey] ?? "")); }); const matieres = sortedEntries.map(item => ({ matiere: item[matiereKey] ?? "", Lecon: item[leconKey] ?? "", travailDeClasse: item[travauxKey] ?? "", Support: item[supportKey] ?? "", devoirs: item[devoirsKey] ?? "" })); return { jourDateComplete: formattedDate, matieres: matieres }; } return null; }).filter(Boolean);
        let plageSemaineText = `Semaine ${weekNumber}`; if (datesNode?.start && datesNode?.end) { try { const startD = new Date(datesNode.start + 'T00:00:00Z'), endD = new Date(datesNode.end + 'T00:00:00Z'); if (!isNaN(startD.getTime()) && !isNaN(endD.getTime())) { const startS = formatDateFrenchNode(startD).replace(/^./, c => c.toUpperCase()).replace(/ (\d{2}) /, ' le $1 '); const endS = formatDateFrenchNode(endD).replace(/^./, c => c.toUpperCase()); plageSemaineText = `du ${startS} à ${endS}`; } } catch (e) { console.error("[GEN-WORD] Erreur formatage plage:", e); } }
        const templateData = { semaine: weekNumber, classe: classe, jours: joursData, notes: finalNotes, plageSemaine: plageSemaineText }; try { doc.render(templateData); } catch (error) { console.error('[GEN-WORD] Erreur rendu:', error); return res.status(500).json({ message: `Erreur rendu: ${error.message}`}); }
        const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
        const safeClasseName = classe.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_'); const filename = `Plan_hebdomadaire_S${weekNumber}_${safeClasseName}.docx`; res.setHeader('Content-Disposition', `attachment; filename="${filename}"`); res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'); res.send(buf);
    } catch (error) { console.error('❌ Erreur serveur /generate-word:', error); if (!res.headersSent) res.status(500).json({ message: 'Erreur interne /generate-word.'}); }
});
// (Les autres routes de génération de fichiers vont ici...)


// Exporter l'app pour Vercel
module.exports = app;



