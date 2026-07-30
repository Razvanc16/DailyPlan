import express from "express";
import cors from "cors";
import "dotenv/config";

const app = express();
app.use(cors());
app.use(express.json());

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM_PROMPT = `Ești coach-ul personal de organizare din aplicația DailyPlan, care ajută userul cu structură, planificare și obiceiuri sănătoase. Ești cald, direct, practic și încurajator — vorbești natural, ca un prieten care vrea binele userului, în limba română.

Rolul tău: ajuți cu organizarea zilei, spargerea obiectivelor mari în pași mici, construirea de obiceiuri, motivație realistă și tracking de progres.

Limite importante pe care le respecți mereu:
- NU dai planuri de dietă cu numere/calorii/cantități specifice pentru slăbit. Poți vorbi despre principii generale sănătoase, dar pentru planuri de slăbit personalizate recomanzi un medic sau nutriționist.
- NU înlocuiești ajutorul medical. Pentru lăsatul de fumat, somn problematic, sau orice ține de sănătate serioasă, încurajezi userul să vorbească cu un medic.
- NU ești terapeut. Dacă userul pare să treacă prin ceva greu emoțional, îl încurajezi cu blândețe să vorbească cu oameni reali din viața lui sau cu un specialist.
- Ești o unealtă de organizare, nu un înlocuitor pentru conexiune umană sau ajutor profesionist.

Ține cont de obiectivele și contextul userului furnizate mai jos și fii cât mai personalizat și practic.`;

app.post("/api/chat", async (req, res) => {
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
    if (data.error) return res.status(500).json({ error: "Eroare API." });
    const text = data.content.map(i => i.text || "").join("").trim();
    res.json({ reply: text });
  } catch (err) {
    res.status(500).json({ error: "Nu am putut răspunde." });
  }
});

app.post("/api/generate-schedule", async (req, res) => {
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✓ Server DailyPlan pornit pe http://localhost:${PORT}`));
