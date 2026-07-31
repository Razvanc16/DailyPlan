import express from "express";
import cors from "cors";
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { promises as fs } from "fs";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", 1); // Railway rulează în spatele unui proxy — necesar ca req.ip să fie corect
app.use(cors());
app.use(express.json());

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ---------------------------------------------------------------------------
// Rate limiting simplu, în memorie, per IP — protejează cheia Anthropic de abuz.
// (fără dependințe noi, doar un Map cu fereastră glisantă)
// ---------------------------------------------------------------------------
function makeRateLimiter({ windowMs, max, message }) {
  const hits = new Map(); // ip -> { count, reset }
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits) if (now > entry.reset) hits.delete(ip);
  }, windowMs).unref();

  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    const now = Date.now();
    let entry = hits.get(ip);
    if (!entry || now > entry.reset) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(ip, entry);
    }
    entry.count++;
    if (entry.count > max) {
      const retryAfterSec = Math.ceil((entry.reset - now) / 1000);
      res.set("Retry-After", String(retryAfterSec));
      return res.status(429).json({ error: message || `Prea multe cereri. Încearcă din nou peste ${retryAfterSec}s.` });
    }
    next();
  };
}

const chatLimiter = makeRateLimiter({ windowMs: 10 * 60 * 1000, max: 30, message: "Ai trimis prea multe mesaje. Așteaptă câteva minute." });
const heavyLimiter = makeRateLimiter({ windowMs: 10 * 60 * 1000, max: 12, message: "Prea multe cereri de generare. Așteaptă câteva minute." });
const authLimiter = makeRateLimiter({ windowMs: 15 * 60 * 1000, max: 20, message: "Prea multe încercări. Așteaptă câteva minute și încearcă din nou." });

// ---------------------------------------------------------------------------
// Conturi — stocare simplă pe fișiere JSON (fără dependință de bază de date).
// ATENȚIE: pe Railway, sistemul de fișiere e efemer dacă nu e atașat un volum
// persistent — la fiecare redeploy, `server/data/` se resetează și conturile
// se pierd. Pentru păstrare pe termen lung, atașează un Volume în Railway și
// montează-l la `server/data`.
// ---------------------------------------------------------------------------
const DATA_DIR = path.join(__dirname, "data");
const STORE_DIR = path.join(DATA_DIR, "store");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");

async function ensureFile(file, defaultContent) {
  try { await fs.access(file); } catch { await fs.writeFile(file, defaultContent); }
}
await fs.mkdir(STORE_DIR, { recursive: true });
await ensureFile(USERS_FILE, "[]");
await ensureFile(SESSIONS_FILE, "{}");

let users = JSON.parse(await fs.readFile(USERS_FILE, "utf8"));
let sessions = JSON.parse(await fs.readFile(SESSIONS_FILE, "utf8"));

async function persistUsers() { await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2)); }
async function persistSessions() { await fs.writeFile(SESSIONS_FILE, JSON.stringify(sessions, null, 2)); }

function emptyStore() {
  return { profile: "", habits: [], checks: {}, messages: [], checkinDoneDate: null };
}
async function readStore(userId) {
  try {
    return JSON.parse(await fs.readFile(path.join(STORE_DIR, `${userId}.json`), "utf8"));
  } catch {
    return emptyStore();
  }
}
async function writeStore(userId, data) {
  await fs.writeFile(path.join(STORE_DIR, `${userId}.json`), JSON.stringify(data, null, 2));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(check, "hex"), b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions[token] = { userId, createdAt: Date.now() };
  return token;
}
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const session = token && sessions[token];
  if (!session) return res.status(401).json({ error: "Neautentificat. Te rugăm să te loghezi din nou." });
  req.userId = session.userId;
  req.token = token;
  next();
}

app.post("/api/auth/register", authLimiter, async (req, res) => {
  const { email, password, migrate } = req.body || {};
  const emailNorm = (email || "").trim().toLowerCase();
  if (!emailNorm || !emailNorm.includes("@")) return res.status(400).json({ error: "Email invalid." });
  if (!password || password.length < 8) return res.status(400).json({ error: "Parola trebuie să aibă minim 8 caractere." });
  if (users.find(u => u.email === emailNorm)) return res.status(409).json({ error: "Există deja un cont cu acest email." });

  const { salt, hash } = hashPassword(password);
  const id = crypto.randomUUID();
  users.push({ id, email: emailNorm, salt, hash, createdAt: Date.now() });
  await persistUsers();

  const store = emptyStore();
  if (migrate && typeof migrate === "object") {
    if (typeof migrate.profile === "string") store.profile = migrate.profile;
    if (Array.isArray(migrate.habits)) store.habits = migrate.habits;
    if (migrate.checks && typeof migrate.checks === "object") store.checks = migrate.checks;
    if (Array.isArray(migrate.messages)) store.messages = migrate.messages;
  }
  await writeStore(id, store);

  const token = createSession(id);
  await persistSessions();
  res.json({ token, user: { id, email: emailNorm }, data: store });
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  const emailNorm = (email || "").trim().toLowerCase();
  const user = users.find(u => u.email === emailNorm);
  if (!user || !verifyPassword(password || "", user.salt, user.hash)) {
    return res.status(401).json({ error: "Email sau parolă greșite." });
  }
  const token = createSession(user.id);
  await persistSessions();
  const store = await readStore(user.id);
  res.json({ token, user: { id: user.id, email: user.email }, data: store });
});

app.post("/api/auth/logout", requireAuth, async (req, res) => {
  delete sessions[req.token];
  await persistSessions();
  res.json({ ok: true });
});

app.get("/api/me", requireAuth, async (req, res) => {
  const user = users.find(u => u.id === req.userId);
  if (!user) return res.status(401).json({ error: "Cont inexistent." });
  const store = await readStore(req.userId);
  res.json({ user: { id: user.id, email: user.email }, data: store });
});

app.put("/api/me/data", requireAuth, async (req, res) => {
  const current = await readStore(req.userId);
  const patch = req.body || {};
  const next = { ...current };
  if (typeof patch.profile === "string") next.profile = patch.profile;
  if (Array.isArray(patch.habits)) next.habits = patch.habits;
  if (patch.checks && typeof patch.checks === "object") next.checks = patch.checks;
  if (Array.isArray(patch.messages)) next.messages = patch.messages;
  if ("checkinDoneDate" in patch) next.checkinDoneDate = patch.checkinDoneDate;
  await writeStore(req.userId, next);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Coach AI
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `Ești coach-ul personal de organizare și nutriție din aplicația DailyPlan, care ajută userul cu structură, planificare, obiceiuri sănătoase și alimentație. Ești cald, direct, practic și încurajator — vorbești natural, ca un prieten care vrea binele userului, în limba română.

Rolul tău: ajuți cu organizarea zilei, spargerea obiectivelor mari în pași mici, construirea de obiceiuri, motivație realistă, tracking de progres, și feedback nutrițional general pe baza a ce-ți spune userul că a mâncat.

Ce poți face la nutriție:
- Dacă userul îți spune ce a mâncat, poți comenta general și util: dacă masa pare bogată în carbohidrați/proteine/grăsimi, dacă lipsesc legume sau fibre, cum ar putea echilibra următoarea masă, idei de gustări mai bune etc. — pe baza principiilor nutriționale general acceptate, ca un prieten informat, nu ca o evaluare clinică.
- Poți sugera principii generale de alimentație sănătoasă (echilibru de macronutrienți, hidratare, regularitate a meselor).

Limite importante pe care le respecți mereu:
- NU faci planuri de dietă personalizate cu calorii/macro-uri exacte pentru slăbit sau alte obiective medicale, NU diagnostichezi și NU tratezi afecțiuni (diabet, tulburări alimentare, alergii etc.). Pentru acestea, recomanzi un medic sau nutriționist.
- NU înlocuiești ajutorul medical. Pentru lăsatul de fumat, somn problematic, sau orice ține de sănătate serioasă, încurajezi userul să vorbească cu un medic.
- NU ești terapeut. Dacă userul pare să treacă prin ceva greu emoțional, îl încurajezi cu blândețe să vorbească cu oameni reali din viața lui sau cu un specialist.
- Ești o unealtă de organizare și educație generală, nu un înlocuitor pentru conexiune umană sau ajutor profesionist.

Ține cont de obiectivele și contextul userului furnizate mai jos și fii cât mai personalizat și practic.`;

app.post("/api/chat", requireAuth, chatLimiter, async (req, res) => {
  const { messages, profile, habits } = req.body;
  const context = `
CONTEXTUL USERULUI:
${profile || "(niciun profil setat încă)"}

OBICEIURILE URMĂRITE (și progresul recent):
${habits || "(niciun obicei urmărit încă)"}
`;
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: SYSTEM_PROMPT + "\n\n" + context,
        messages: messages,
      }),
    });
    const data = await response.json();
    if (data.error) {
      console.error("Eroare Anthropic API (/api/chat):", JSON.stringify(data.error));
      return res.status(500).json({ error: "Eroare API: " + (data.error.message || "necunoscută") });
    }
    const text = data.content.map(i => i.text || "").join("").trim();
    res.json({ reply: text });
  } catch (err) {
    console.error("Eroare server (/api/chat):", err);
    res.status(500).json({ error: "Nu am putut răspunde: " + err.message });
  }
});

app.post("/api/questions", requireAuth, heavyLimiter, async (req, res) => {
  const { profile, habits } = req.body;
  const prompt = `Pe baza profilului de mai jos, generează 5 întrebări scurte de "check-in de dimineață" care să te ajute să înțelegi cum e userul azi și ce vrea să facă, ca să-i poți construi un orar personalizat.

PROFILUL USERULUI:
${profile || "(niciun profil setat)"}

OBICEIURILE URMĂRITE:
${habits || "(niciunul)"}

Pentru fiecare întrebare, oferă 3-4 variante scurte de răspuns (userul poate alege una sau scrie propriul răspuns).
Întrebările să fie relevante pentru obiectivele lui (somn, sport, muncă, energie, stare, etc.).

Răspunde DOAR cu un array JSON valid, fără text în plus, fără markdown. Format exact:
[{"q":"Cum te simți azi?","options":["Energic","Obosit","Ok","Stresat"]}]`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await response.json();
    if (data.error) return res.status(500).json({ error: "Eroare API." });
    let text = data.content.map(i => i.text || "").join("").trim();
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    // extrage doar array-ul JSON, în caz că AI-ul a pus text în jur
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
    const questions = JSON.parse(text);
    res.json({ questions });
  } catch (err) {
    // fallback: întrebări generice, ca aplicația să nu se blocheze
    res.json({ questions: [
      { q: "Cum te simți azi?", options: ["Energic", "Obosit", "Ok", "Stresat"] },
      { q: "Cât timp vrei să dedici azi lucrului la proiecte?", options: ["1-2 ore", "3-4 ore", "Cât pot", "Azi mă odihnesc"] },
      { q: "Ai chef de mișcare azi?", options: ["Da", "Poate mai târziu", "Nu azi", "Nu știu încă"] },
      { q: "La ce oră vrei să începi ziua efectiv?", options: ["Acum", "Într-o oră", "După-amiază", "Nu știu"] },
      { q: "Care e prioritatea ta principală azi?", options: ["Muncă", "Odihna", "Sport", "Altceva"] },
    ]});
  }
});

app.post("/api/generate-schedule", requireAuth, heavyLimiter, async (req, res) => {
  const { profile, tasks, habits } = req.body;
  if (!tasks || !tasks.trim()) return res.status(400).json({ error: "Niciun task furnizat." });
  const today = new Date().toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long" });
  const prompt = `Organizează ziua utilizatorului între 07:00 și 23:00.
Data: ${today}

PROFILUL/OBIECTIVELE UTILIZATORULUI:
${profile || "(niciun profil)"}

OBICEIURILE PE CARE LE CONSTRUIEȘTE:
${habits || "(niciunul)"}

TASK-URILE DE AZI:
${tasks}

Reguli:
- Respectă preferințele și obiceiurile din profil (somn, sport, pauze, etc.).
- Include timp pentru obiceiurile pe care le construiește userul dacă sunt relevante zilnic.
- Distribuie task-urile grele în intervalele productive menționate.
- Fii realist, include mese, pauze și timp liber.

Răspunde DOAR cu un array JSON valid, fără text în plus, fără markdown. Format exact:
{"start":"09:00","end":"10:30","title":"...","type":"work"}
type ∈ work, break, exercise, meal, personal, free, sleep.`;
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await response.json();
    if (data.error) return res.status(500).json({ error: "Eroare API." });
    let text = data.content.map(i => i.text || "").join("").trim();
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    res.json({ schedule: JSON.parse(text) });
  } catch (err) {
    res.status(500).json({ error: "Nu am putut genera orarul." });
  }
});

// Servește frontend-ul construit (Vite build din ../dist)
const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));
// Orice rută care nu e /api trimite index.html (pentru SPA)
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✓ Server DailyPlan pornit pe http://localhost:${PORT}`));
