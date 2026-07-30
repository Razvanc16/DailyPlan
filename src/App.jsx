import { useState, useEffect, useRef } from "react";

const ACCENT = "#FF3366";
const ACCENT2 = "#B44FFF";
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const DEFAULT_HABITS = [
  { id: "sleep", name: "Somn la miezul nopții", icon: "🌙" },
  { id: "sport", name: "Mișcare (bandă/baschet)", icon: "🏀" },
  { id: "nicorette", name: "Fără țigări (spray la nevoie)", icon: "🚭" },
  { id: "work", name: "Lucrat la aplicații", icon: "💻" },
];

const todayKey = () => new Date().toISOString().slice(0, 10);
const last7 = () => {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
};

export default function App() {
  const [view, setView] = useState("chat");
  const [profile, setProfile] = useState("");
  const [habits, setHabits] = useState(DEFAULT_HABITS);
  const [checks, setChecks] = useState({});
  const [newHabit, setNewHabit] = useState("");
  const [deletedHabit, setDeletedHabit] = useState(null); // { habit, checks } pentru undo
  const undoTimer = useRef(null);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  const [tasks, setTasks] = useState("");
  const [schedule, setSchedule] = useState([]);
  const [schedLoading, setSchedLoading] = useState(false);
  const scheduleRef = useRef(null);

  useEffect(() => {
    setProfile(localStorage.getItem("dp:profile") || "");
    const sh = localStorage.getItem("dp:habits"); if (sh) { try { setHabits(JSON.parse(sh)); } catch {} }
    const sc = localStorage.getItem("dp:checks"); if (sc) { try { setChecks(JSON.parse(sc)); } catch {} }
    const sm = localStorage.getItem("dp:messages"); if (sm) { try { setMessages(JSON.parse(sm)); } catch {} }
    const st = localStorage.getItem("dp:schedule"); if (st) { try { setSchedule(JSON.parse(st)); } catch {} }
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const saveProfile = (v) => { setProfile(v); localStorage.setItem("dp:profile", v); };
  const saveHabits = (h) => { setHabits(h); localStorage.setItem("dp:habits", JSON.stringify(h)); };
  const saveChecks = (c) => { setChecks(c); localStorage.setItem("dp:checks", JSON.stringify(c)); };
  const saveMessages = (m) => { setMessages(m); localStorage.setItem("dp:messages", JSON.stringify(m)); };
  const saveSchedule = (s) => { setSchedule(s); localStorage.setItem("dp:schedule", JSON.stringify(s)); };

  const toggleCheck = (habitId) => {
    const day = todayKey();
    saveChecks({ ...checks, [day]: { ...(checks[day] || {}), [habitId]: !(checks[day]?.[habitId]) } });
  };

  const addHabit = () => {
    if (!newHabit.trim()) return;
    saveHabits([...habits, { id: "h" + Date.now(), name: newHabit.trim(), icon: "⭐" }]);
    setNewHabit("");
  };
  const removeHabit = (id) => {
    const habit = habits.find(h => h.id === id);
    if (!habit) return;
    setDeletedHabit(habit);
    saveHabits(habits.filter(h => h.id !== id));
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setDeletedHabit(null), 5000);
  };

  const undoRemove = () => {
    if (!deletedHabit) return;
    saveHabits([...habits, deletedHabit]);
    setDeletedHabit(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
  };

  const habitsSummary = () => {
    const days = last7().filter(d => checks[d]);
    let s = "Obiceiuri urmărite: " + habits.map(h => h.name).join(", ") + "\n";
    if (days.length === 0) return s + "Niciun progres bifat încă.";
    days.forEach(d => {
      const done = habits.filter(h => checks[d]?.[h.id]).map(h => h.name);
      s += `${d}: ${done.length ? done.join(", ") : "nimic"}\n`;
    });
    return s;
  };

  const sendMessage = async () => {
    if (!input.trim() || chatLoading) return;
    const newMsgs = [...messages, { role: "user", content: input.trim() }];
    saveMessages(newMsgs); setInput(""); setChatLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMsgs, profile, habits: habitsSummary() }),
      });
      const data = await res.json();
      if (data.error) throw new Error();
      saveMessages([...newMsgs, { role: "assistant", content: data.reply }]);
    } catch {
      saveMessages([...newMsgs, { role: "assistant", content: "Ceva n-a mers. Verifică dacă serverul (backend) e pornit." }]);
    }
    setChatLoading(false);
  };

  const clearChat = () => { if (confirm("Ștergi toată conversația?")) saveMessages([]); };

  const generateSchedule = async () => {
    if (!tasks.trim() || schedLoading) return;
    setSchedLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/generate-schedule`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, tasks, habits: habitsSummary() }),
      });
      const data = await res.json();
      if (data.schedule) saveSchedule(data.schedule);
    } catch {}
    setSchedLoading(false);
  };

  const typeColors = { work: "#FF3366", break: "#00E5FF", exercise: "#00C864", meal: "#FFB800", personal: "#B44FFF", free: "rgba(255,255,255,0.3)", sleep: "#6E7BFF" };
  const typeLabels = { work: "Muncă", break: "Pauză", exercise: "Sport", meal: "Masă", personal: "Personal", free: "Liber", sleep: "Somn" };

  const day = todayKey();
  const todayChecks = checks[day] || {};
  const doneToday = habits.filter(h => todayChecks[h.id]).length;
  const streak = (() => {
    let count = 0;
    const days = last7().reverse();
    for (const d of days) {
      const c = checks[d];
      if (c && habits.some(h => c[h.id])) count++;
      else break;
    }
    return count;
  })();

  return (
    <div style={{ minHeight: "100vh", background: "#0B0B0F", color: "#fff", fontFamily: "'Inter', sans-serif", display: "flex", flexDirection: "column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::placeholder { color: rgba(255,255,255,0.3); }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        button:active { transform: scale(0.97); }
      `}</style>

      <div style={{ padding: "36px 20px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.5px" }}>
              Daily<span style={{ background: `linear-gradient(135deg,${ACCENT},${ACCENT2})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Plan</span>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Coach-ul tău de dezvoltare personală</div>
          </div>
          {streak > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: "#FFB800" }}>🔥 {streak}z</div>}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 16, flexWrap: "wrap" }}>
          {[{ id: "chat", label: "💬 Chat" }, { id: "habits", label: "✓ Obiceiuri" }, { id: "schedule", label: "📅 Orar" }, { id: "profile", label: "👤 Profil" }].map(t => (
            <button key={t.id} onClick={() => setView(t.id)} style={{
              padding: "8px 13px", borderRadius: 12, cursor: "pointer", fontSize: 13, fontWeight: 700,
              background: view === t.id ? `${ACCENT}20` : "rgba(255,255,255,0.04)",
              border: `1px solid ${view === t.id ? ACCENT : "rgba(255,255,255,0.1)"}`,
              color: view === t.id ? ACCENT : "rgba(255,255,255,0.5)",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* CHAT */}
      {view === "chat" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "calc(100vh - 150px)" }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
            {messages.length === 0 && (
              <div style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", marginTop: 40, padding: "0 20px" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>👋</div>
                <div style={{ fontSize: 15, lineHeight: 1.6 }}>Salut! Sunt aici să te ajut cu organizarea, obiceiurile și obiectivele tale. Spune-mi cu ce te lupți azi.</div>
                {!profile && <div style={{ fontSize: 12, color: "#FFB800", marginTop: 16, lineHeight: 1.5 }}>💡 Completează-ți întâi Profilul (tab-ul 👤) ca să te cunosc mai bine.</div>}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 12, animation: "fadeUp 0.3s ease-out" }}>
                <div style={{ maxWidth: "82%", padding: "12px 16px", borderRadius: 16, fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap",
                  background: m.role === "user" ? `linear-gradient(135deg,${ACCENT},${ACCENT2})` : "rgba(255,255,255,0.06)",
                  border: m.role === "user" ? "none" : "1px solid rgba(255,255,255,0.1)" }}>{m.content}</div>
              </div>
            ))}
            {chatLoading && <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, padding: "8px 16px" }}>scrie…</div>}
            <div ref={chatEndRef} />
          </div>
          <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 8, alignItems: "center" }}>
            {messages.length > 0 && <button onClick={clearChat} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 18, cursor: "pointer" }}>🗑</button>}
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()}
              placeholder="Scrie ceva..."
              style={{ flex: 1, padding: "13px 16px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 24, color: "#fff", fontSize: 14, outline: "none", fontFamily: "'Inter', sans-serif" }} />
            <button onClick={sendMessage} disabled={chatLoading} style={{ width: 46, height: 46, borderRadius: "50%", border: "none", background: `linear-gradient(135deg,${ACCENT},${ACCENT2})`, color: "#fff", fontSize: 18, cursor: "pointer", flexShrink: 0 }}>↑</button>
          </div>
        </div>
      )}

      {/* HABITS */}
      {view === "habits" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "20px", maxWidth: 600, margin: "0 auto", width: "100%" }}>
          <div style={{ background: `${ACCENT}10`, border: `1px solid ${ACCENT}25`, borderRadius: 16, padding: "18px", marginBottom: 20, textAlign: "center" }}>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Azi ai bifat</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: ACCENT }}>{doneToday}<span style={{ fontSize: 18, color: "rgba(255,255,255,0.4)" }}>/{habits.length}</span></div>
            {streak > 0 && <div style={{ fontSize: 12, color: "#FFB800", marginTop: 4 }}>🔥 {streak} zile la rând</div>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {habits.map(h => {
              const done = todayChecks[h.id];
              return (
                <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 14,
                  background: done ? "rgba(0,200,100,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${done ? "rgba(0,200,100,0.35)" : "rgba(255,255,255,0.1)"}` }}>
                  <button onClick={() => toggleCheck(h.id)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, flex: 1, textAlign: "left" }}>
                    <span style={{ fontSize: 24 }}>{h.icon}</span>
                    <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: done ? "#fff" : "rgba(255,255,255,0.7)" }}>{h.name}</span>
                    <span style={{ width: 26, height: 26, borderRadius: "50%", border: `2px solid ${done ? "#00C864" : "rgba(255,255,255,0.2)"}`, background: done ? "#00C864" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{done ? "✓" : ""}</span>
                  </button>
                  <button onClick={() => removeHabit(h.id)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.2)", fontSize: 16, cursor: "pointer" }}>×</button>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <input value={newHabit} onChange={e => setNewHabit(e.target.value)} onKeyDown={e => e.key === "Enter" && addHabit()}
              placeholder="Adaugă un obicei nou..."
              style={{ flex: 1, padding: "12px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, color: "#fff", fontSize: 14, outline: "none", fontFamily: "'Inter', sans-serif" }} />
            <button onClick={addHabit} style={{ padding: "0 18px", borderRadius: 12, border: "none", background: `${ACCENT}25`, color: ACCENT, fontSize: 20, fontWeight: 700, cursor: "pointer" }}>+</button>
          </div>
        </div>
      )}

      {/* SCHEDULE */}
      {view === "schedule" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "20px", maxWidth: 600, margin: "0 auto", width: "100%" }}>
          <textarea value={tasks} onChange={e => setTasks(e.target.value)} rows={3}
            placeholder="Task-urile de azi (ex: lucrez la NightFeed, sport, cumpărături)..."
            style={{ width: "100%", padding: "14px", borderRadius: 14, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", fontSize: 14, outline: "none", resize: "vertical", marginBottom: 12, fontFamily: "'Inter', sans-serif" }} />
          <button onClick={generateSchedule} disabled={schedLoading} style={{ width: "100%", padding: "15px", borderRadius: 14, border: "none", background: schedLoading ? "rgba(255,51,102,0.4)" : `linear-gradient(135deg,${ACCENT},${ACCENT2})`, color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer", marginBottom: 20 }}>
            {schedLoading ? "Se generează..." : "✨ Generează Orarul"}
          </button>
          {schedule.length > 0 && (
            <div ref={scheduleRef}>
              {schedule.map((s, i) => {
                const color = typeColors[s.type] || typeColors.free;
                return (
                  <div key={i} style={{ display: "flex", gap: 12, marginBottom: 8 }}>
                    <div style={{ minWidth: 84, textAlign: "right" }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{s.start}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{s.end}</div>
                    </div>
                    <div style={{ width: 3, borderRadius: 3, background: color }} />
                    <div style={{ flex: 1, padding: "10px 14px", borderRadius: 10, background: `${color}12`, border: `1px solid ${color}30` }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{s.title}</div>
                      <div style={{ fontSize: 10, color, textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>{typeLabels[s.type] || s.type}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* PROFILE */}
      {view === "profile" && (
        <div style={{ flex: 1, overflowY: "auto", padding: "20px", maxWidth: 600, margin: "0 auto", width: "100%" }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Despre tine</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, marginBottom: 16 }}>
            Scrie tot ce ar trebui coach-ul să știe despre tine: obiectivele tale, ritmul zilei, ce vrei să schimbi, ce te ajută și ce te încurcă. Se salvează automat și e folosit în chat și la generarea orarelor.
          </div>
          <textarea value={profile} onChange={e => saveProfile(e.target.value)} rows={12}
            placeholder={"ex: Sunt student la ASE, în vacanță de vară. Lucrez la aplicațiile mele (NightFeed, DailyPlan). \n\nObiective:\n- Vreau să dorm la miezul nopții (acum mă culc la 2)\n- Vreau să mă mișc regulat (am bandă de alergat și coș de baschet acasă)\n- Mă las de fumat, folosesc spray Nicorette și funcționează\n- Vreau consistență la lucrul pe aplicații\n\nRitm: mă trezesc târziu, sunt mai productiv după-amiaza. Mă încurcă că am toată ziua liberă și amân."}
            style={{ width: "100%", padding: "16px", borderRadius: 14, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", fontSize: 14, outline: "none", resize: "vertical", lineHeight: 1.6, fontFamily: "'Inter', sans-serif" }} />
          <div style={{ fontSize: 12, color: "#00C864", marginTop: 10 }}>✓ Salvat automat</div>

          <div style={{ marginTop: 24, padding: "16px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
              ℹ️ DailyPlan te ajută cu organizare și obiceiuri. Nu înlocuiește un medic sau nutriționist — pentru planuri de slăbit, lăsatul de fumat sau somn, cel mai bine e să vorbești și cu un specialist.
            </div>
          </div>
        </div>
      )}

      {/* Bară Undo — apare când ștergi un obicei */}
      {deletedHabit && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 1000, display: "flex", alignItems: "center", gap: 14, padding: "12px 16px 12px 18px", borderRadius: 14, background: "rgba(30,30,36,0.98)", border: "1px solid rgba(255,255,255,0.15)", boxShadow: "0 8px 30px rgba(0,0,0,0.5)", animation: "fadeUp 0.3s ease-out", maxWidth: "90vw" }}>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.8)" }}>Ai șters „{deletedHabit.name}"</span>
          <button onClick={undoRemove} style={{ background: "none", border: "none", color: ACCENT, fontSize: 13, fontWeight: 800, cursor: "pointer", padding: 0 }}>ANULEAZĂ</button>
        </div>
      )}
    </div>
  );
}
