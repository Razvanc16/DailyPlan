import { useState, useEffect, useRef } from "react";

const ACCENT = "#FF3366";
const ACCENT2 = "#B44FFF";
const API_URL =
  import.meta.env.VITE_API_URL ||
  (typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? window.location.origin
    : "http://localhost:3001");

const DEFAULT_HABITS = [
  { id: "sleep", name: "Somn la miezul nopții", icon: "🌙" },
  { id: "sport", name: "Mișcare (bandă/baschet)", icon: "🏀" },
  { id: "nicorette", name: "Fără țigări (spray la nevoie)", icon: "🚭" },
  { id: "work", name: "Lucrat la aplicații", icon: "💻" },
];

const todayKey = () => new Date().toISOString().slice(0, 10);
const last7 = () => {
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d.toISOString().slice(0, 10)); }
  return days;
};

const typeColors = { work: "#FF3366", break: "#00E5FF", exercise: "#00C864", meal: "#FFB800", personal: "#B44FFF", free: "rgba(255,255,255,0.3)", sleep: "#6E7BFF" };
const typeLabels = { work: "Muncă", break: "Pauză", exercise: "Sport", meal: "Masă", personal: "Personal", free: "Liber", sleep: "Somn" };

export default function App() {
  const [view, setView] = useState("chat");
  const [profile, setProfile] = useState("");
  const [habits, setHabits] = useState(DEFAULT_HABITS);
  const [checks, setChecks] = useState({});
  const [newHabit, setNewHabit] = useState("");
  const [deletedHabit, setDeletedHabit] = useState(null);
  const undoTimer = useRef(null);

  // Chat + flux check-in
  const [messages, setMessages] = useState([]); // { role, content, schedule? }
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState([]);   // întrebările generate
  const [qIndex, setQIndex] = useState(0);          // la ce întrebare sunt
  const [answers, setAnswers] = useState([]);       // răspunsurile date
  const [checkinDone, setCheckinDone] = useState(false); // deblochează butonul orar
  const [genLoading, setGenLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    setProfile(localStorage.getItem("dp:profile") || "");
    const sh = localStorage.getItem("dp:habits"); if (sh) { try { setHabits(JSON.parse(sh)); } catch {} }
    const sc = localStorage.getItem("dp:checks"); if (sc) { try { setChecks(JSON.parse(sc)); } catch {} }
    const sm = localStorage.getItem("dp:messages"); if (sm) { try { setMessages(JSON.parse(sm)); } catch {} }
    const cd = localStorage.getItem("dp:checkinDone:" + todayKey());
    if (cd === "1") setCheckinDone(true);
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, questions, qIndex]);

  const saveProfile = (v) => { setProfile(v); localStorage.setItem("dp:profile", v); };
  const saveHabits = (h) => { setHabits(h); localStorage.setItem("dp:habits", JSON.stringify(h)); };
  const saveChecks = (c) => { setChecks(c); localStorage.setItem("dp:checks", JSON.stringify(c)); };
  const saveMessages = (m) => { setMessages(m); localStorage.setItem("dp:messages", JSON.stringify(m)); };

  const toggleCheck = (id) => {
    const day = todayKey();
    saveChecks({ ...checks, [day]: { ...(checks[day] || {}), [id]: !(checks[day]?.[id]) } });
  };
  const addHabit = () => { if (!newHabit.trim()) return; saveHabits([...habits, { id: "h" + Date.now(), name: newHabit.trim(), icon: "⭐" }]); setNewHabit(""); };
  const removeHabit = (id) => {
    const h = habits.find(x => x.id === id); if (!h) return;
    setDeletedHabit(h); saveHabits(habits.filter(x => x.id !== id));
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setDeletedHabit(null), 5000);
  };
  const undoRemove = () => { if (!deletedHabit) return; saveHabits([...habits, deletedHabit]); setDeletedHabit(null); if (undoTimer.current) clearTimeout(undoTimer.current); };

  const habitsSummary = () => {
    const days = last7().filter(d => checks[d]);
    let s = "Obiceiuri: " + habits.map(h => h.name).join(", ") + "\n";
    if (!days.length) return s + "Niciun progres bifat încă.";
    days.forEach(d => { const done = habits.filter(h => checks[d]?.[h.id]).map(h => h.name); s += `${d}: ${done.length ? done.join(", ") : "nimic"}\n`; });
    return s;
  };

  // Pornește check-in-ul: generează întrebările din profil
  const startCheckin = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/questions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, habits: habitsSummary() }),
      });
      const data = await res.json();
      if (data.questions?.length) { setQuestions(data.questions); setQIndex(0); setAnswers([]); }
      else throw new Error();
    } catch {
      saveMessages([...messages, { role: "assistant", content: "N-am putut genera întrebările. Verifică profilul și conexiunea, apoi încearcă din nou." }]);
    }
    setLoading(false);
  };

  const answerQuestion = (answer) => {
    const q = questions[qIndex];
    const newAnswers = [...answers, { q: q.q, a: answer }];
    setAnswers(newAnswers);
    // adaugă în chat vizual
    saveMessages([...messages, { role: "assistant", content: q.q }, { role: "user", content: answer }]);
    if (qIndex + 1 < questions.length) {
      setQIndex(qIndex + 1);
    } else {
      // gata întrebările
      setQuestions([]);
      setCheckinDone(true);
      localStorage.setItem("dp:checkinDone:" + todayKey(), "1");
      saveMessages(prev => {
        const base = [...messages, { role: "assistant", content: q.q }, { role: "user", content: answer }];
        return [...base, { role: "assistant", content: "Perfect, am tot ce-mi trebuie! 🎯 Acum pot să-ți construiesc orarul zilei — apasă butonul de jos. Sau continuă să vorbim dacă vrei să adaugi ceva." }];
      });
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const newMsgs = [...messages, { role: "user", content: input.trim() }];
    saveMessages(newMsgs); setInput(""); setLoading(true);
    try {
      const apiMsgs = newMsgs.filter(m => !m.schedule).map(m => ({ role: m.role, content: m.content }));
      const res = await fetch(`${API_URL}/api/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMsgs, profile, habits: habitsSummary() }),
      });
      const data = await res.json();
      if (data.error) throw new Error();
      saveMessages([...newMsgs, { role: "assistant", content: data.reply }]);
    } catch {
      saveMessages([...newMsgs, { role: "assistant", content: "Ceva n-a mers. Verifică conexiunea și încearcă din nou." }]);
    }
    setLoading(false);
  };

  const generateSchedule = async () => {
    if (genLoading) return;
    setGenLoading(true);
    const answersText = answers.map(a => `${a.q} → ${a.a}`).join("\n");
    const convoText = messages.filter(m => !m.schedule).map(m => `${m.role === "user" ? "Eu" : "Coach"}: ${m.content}`).join("\n");
    try {
      const res = await fetch(`${API_URL}/api/generate-schedule`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile,
          habits: habitsSummary(),
          tasks: `Răspunsurile de azi la check-in:\n${answersText}\n\nDin conversație:\n${convoText}`,
        }),
      });
      const data = await res.json();
      if (data.schedule) {
        saveMessages([...messages, { role: "assistant", content: "Iată orarul tău de azi:", schedule: data.schedule }]);
      } else throw new Error();
    } catch {
      saveMessages([...messages, { role: "assistant", content: "N-am putut genera orarul. Încearcă din nou." }]);
    }
    setGenLoading(false);
  };

  const resetCheckin = () => {
    if (!confirm("Resetezi check-in-ul de azi? (poți răspunde din nou la întrebări)")) return;
    localStorage.removeItem("dp:checkinDone:" + todayKey());
    setCheckinDone(false); setAnswers([]); setQuestions([]); saveMessages([]);
  };

  const day = todayKey();
  const todayChecks = checks[day] || {};
  const doneToday = habits.filter(h => todayChecks[h.id]).length;
  const streak = (() => { let c = 0; for (const d of last7().reverse()) { const ch = checks[d]; if (ch && habits.some(h => ch[h.id])) c++; else break; } return c; })();

  const inCheckin = questions.length > 0;

  return (
    <div style={{ height: "100%", background: "#0B0B0F", color: "#fff", fontFamily: "'Inter', sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::placeholder { color: rgba(255,255,255,0.3); }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        button:active { transform: scale(0.97); }
        .dp-scroll { overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
      `}</style>

      {/* HEADER — cu safe-area pentru notch/Dynamic Island */}
      <div style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)", padding: "20px 20px 14px", paddingTop: "max(env(safe-area-inset-top), 20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.5px" }}>
              Daily<span style={{ background: `linear-gradient(135deg,${ACCENT},${ACCENT2})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Plan</span>
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Coach-ul tău de dezvoltare personală</div>
          </div>
          {streak > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: "#FFB800" }}>🔥 {streak}z</div>}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
          {[{ id: "chat", label: "💬 Azi" }, { id: "habits", label: "✓ Obiceiuri" }, { id: "profile", label: "👤 Profil" }].map(t => (
            <button key={t.id} onClick={() => setView(t.id)} style={{
              padding: "8px 13px", borderRadius: 12, cursor: "pointer", fontSize: 13, fontWeight: 700,
              background: view === t.id ? `${ACCENT}20` : "rgba(255,255,255,0.04)",
              border: `1px solid ${view === t.id ? ACCENT : "rgba(255,255,255,0.1)"}`,
              color: view === t.id ? ACCENT : "rgba(255,255,255,0.5)",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* CHAT / CHECK-IN */}
      {view === "chat" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "calc(100vh - 130px)" }}>
          <div className="dp-scroll" style={{ flex: 1, overflowY: "auto", padding: "20px", overscrollBehavior: "contain" }}>
            {/* Start check-in dacă nu au fost mesaje și nu e în curs */}
            {messages.length === 0 && !inCheckin && (
              <div style={{ textAlign: "center", color: "rgba(255,255,255,0.5)", marginTop: 30, padding: "0 16px" }}>
                <div style={{ fontSize: 40, marginBottom: 14 }}>☀️</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Bună! Hai să-ți planificăm ziua.</div>
                <div style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>Îți pun câteva întrebări scurte ca să înțeleg cum ești azi, apoi îți construiesc un orar pe măsură.</div>
                {!profile ? (
                  <div style={{ fontSize: 13, color: "#FFB800", lineHeight: 1.5 }}>💡 Completează-ți întâi Profilul (tab 👤) ca întrebările să fie personalizate.</div>
                ) : (
                  <button onClick={startCheckin} disabled={loading} style={{ padding: "14px 28px", borderRadius: 30, border: "none", background: `linear-gradient(135deg,${ACCENT},${ACCENT2})`, color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer", boxShadow: "0 6px 24px rgba(255,51,102,0.35)" }}>
                    {loading ? "Se pregătește..." : "☀️ Începe ziua"}
                  </button>
                )}
              </div>
            )}

            {/* Mesajele */}
            {messages.map((m, i) => (
              <div key={i} style={{ marginBottom: 12, animation: "fadeUp 0.3s ease-out" }}>
                {m.schedule ? (
                  <div>
                    <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", marginBottom: 10 }}>{m.content}</div>
                    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "14px" }}>
                      {m.schedule.map((s, j) => {
                        const color = typeColors[s.type] || typeColors.free;
                        return (
                          <div key={j} style={{ display: "flex", gap: 12, marginBottom: j < m.schedule.length - 1 ? 8 : 0 }}>
                            <div style={{ minWidth: 78, textAlign: "right" }}>
                              <div style={{ fontSize: 13, fontWeight: 700 }}>{s.start}</div>
                              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{s.end}</div>
                            </div>
                            <div style={{ width: 3, borderRadius: 3, background: color }} />
                            <div style={{ flex: 1, padding: "9px 13px", borderRadius: 10, background: `${color}12`, border: `1px solid ${color}30` }}>
                              <div style={{ fontSize: 14, fontWeight: 600 }}>{s.title}</div>
                              <div style={{ fontSize: 10, color, textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>{typeLabels[s.type] || s.type}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                    <div style={{ maxWidth: "82%", padding: "12px 16px", borderRadius: 16, fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap",
                      background: m.role === "user" ? `linear-gradient(135deg,${ACCENT},${ACCENT2})` : "rgba(255,255,255,0.06)",
                      border: m.role === "user" ? "none" : "1px solid rgba(255,255,255,0.1)" }}>{m.content}</div>
                  </div>
                )}
              </div>
            ))}

            {/* Întrebarea curentă din check-in */}
            {inCheckin && (
              <div style={{ animation: "fadeUp 0.3s ease-out", marginTop: 8 }}>
                <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 12 }}>
                  <div style={{ maxWidth: "82%", padding: "12px 16px", borderRadius: 16, fontSize: 14, lineHeight: 1.5, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    {questions[qIndex].q}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 10, marginLeft: 4 }}>Întrebarea {qIndex + 1} din {questions.length}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {questions[qIndex].options?.map((opt, k) => (
                    <button key={k} onClick={() => answerQuestion(opt)} style={{ padding: "13px 16px", borderRadius: 14, textAlign: "left", cursor: "pointer", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", fontSize: 14, fontFamily: "'Inter', sans-serif" }}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {loading && <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, padding: "8px 4px" }}>scrie…</div>}
            <div ref={chatEndRef} />
          </div>

          {/* Buton generare orar — deblocat după check-in */}
          {checkinDone && !messages.some(m => m.schedule) && (
            <div style={{ padding: "10px 16px 0" }}>
              <button onClick={generateSchedule} disabled={genLoading} style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: genLoading ? "rgba(255,51,102,0.4)" : `linear-gradient(135deg,${ACCENT},${ACCENT2})`, color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
                {genLoading ? "Se construiește orarul..." : "✨ Generează orarul zilei"}
              </button>
            </div>
          )}

          {/* Input chat — activ mereu după ce începe check-in-ul sau conversația */}
          {(checkinDone || messages.length > 0) && !inCheckin && (
            <div style={{ padding: "12px 16px", paddingBottom: "max(env(safe-area-inset-bottom), 12px)", display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={resetCheckin} title="Reia ziua" style={{ background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 18, cursor: "pointer" }}>↻</button>
              <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()}
                placeholder="Scrie ceva..."
                style={{ flex: 1, padding: "13px 16px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 24, color: "#fff", fontSize: 14, outline: "none", fontFamily: "'Inter', sans-serif" }} />
              <button onClick={sendMessage} disabled={loading} style={{ width: 46, height: 46, borderRadius: "50%", border: "none", background: `linear-gradient(135deg,${ACCENT},${ACCENT2})`, color: "#fff", fontSize: 18, cursor: "pointer", flexShrink: 0 }}>↑</button>
            </div>
          )}
        </div>
      )}

      {/* HABITS */}
      {view === "habits" && (
        <div className="dp-scroll" style={{ flex: 1, overflowY: "auto", padding: "20px", paddingBottom: "max(env(safe-area-inset-bottom), 20px)", maxWidth: 600, margin: "0 auto", width: "100%", overscrollBehavior: "contain" }}>
          <div style={{ background: `${ACCENT}10`, border: `1px solid ${ACCENT}25`, borderRadius: 16, padding: "18px", marginBottom: 20, textAlign: "center" }}>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Azi ai bifat</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: ACCENT }}>{doneToday}<span style={{ fontSize: 18, color: "rgba(255,255,255,0.4)" }}>/{habits.length}</span></div>
            {streak > 0 && <div style={{ fontSize: 12, color: "#FFB800", marginTop: 4 }}>🔥 {streak} zile la rând</div>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {habits.map(h => {
              const done = todayChecks[h.id];
              return (
                <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 14, background: done ? "rgba(0,200,100,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${done ? "rgba(0,200,100,0.35)" : "rgba(255,255,255,0.1)"}` }}>
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
            <input value={newHabit} onChange={e => setNewHabit(e.target.value)} onKeyDown={e => e.key === "Enter" && addHabit()} placeholder="Adaugă un obicei nou..."
              style={{ flex: 1, padding: "12px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, color: "#fff", fontSize: 14, outline: "none", fontFamily: "'Inter', sans-serif" }} />
            <button onClick={addHabit} style={{ padding: "0 18px", borderRadius: 12, border: "none", background: `${ACCENT}25`, color: ACCENT, fontSize: 20, fontWeight: 700, cursor: "pointer" }}>+</button>
          </div>
        </div>
      )}

      {/* PROFILE */}
      {view === "profile" && (
        <div className="dp-scroll" style={{ flex: 1, overflowY: "auto", padding: "20px", paddingBottom: "max(env(safe-area-inset-bottom), 20px)", maxWidth: 600, margin: "0 auto", width: "100%", overscrollBehavior: "contain" }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Despre tine</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, marginBottom: 16 }}>
            Scrie tot ce ar trebui coach-ul să știe: obiectivele tale, ritmul zilei, ce vrei să schimbi. Se salvează automat și e folosit la întrebările de dimineață și la orare.
          </div>
          <textarea value={profile} onChange={e => saveProfile(e.target.value)} rows={12}
            placeholder={"ex: Sunt student, în vacanță. Vreau să dorm la miezul nopții (acum mă culc la 2), să mă mișc regulat (am bandă și coș de baschet), să mă las de fumat (folosesc spray Nicorette), și să lucrez constant la aplicațiile mele. Mă trezesc târziu și amân des."}
            style={{ width: "100%", padding: "16px", borderRadius: 14, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", fontSize: 14, outline: "none", resize: "vertical", lineHeight: 1.6, fontFamily: "'Inter', sans-serif" }} />
          <div style={{ fontSize: 12, color: "#00C864", marginTop: 10 }}>✓ Salvat automat</div>
          <div style={{ marginTop: 24, padding: "16px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
              ℹ️ DailyPlan te ajută cu organizare și obiceiuri. Nu înlocuiește un medic sau nutriționist — pentru planuri de slăbit, lăsatul de fumat sau somn, cel mai bine e să vorbești și cu un specialist.
            </div>
          </div>
        </div>
      )}

      {/* Undo bar */}
      {deletedHabit && (
        <div style={{ position: "fixed", bottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)", left: "50%", transform: "translateX(-50%)", zIndex: 1000, display: "flex", alignItems: "center", gap: 14, padding: "12px 16px 12px 18px", borderRadius: 14, background: "rgba(30,30,36,0.98)", border: "1px solid rgba(255,255,255,0.15)", boxShadow: "0 8px 30px rgba(0,0,0,0.5)", animation: "fadeUp 0.3s ease-out", maxWidth: "90vw" }}>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.8)" }}>Ai șters „{deletedHabit.name}"</span>
          <button onClick={undoRemove} style={{ background: "none", border: "none", color: ACCENT, fontSize: 13, fontWeight: 800, cursor: "pointer", padding: 0 }}>ANULEAZĂ</button>
        </div>
      )}
    </div>
  );
}
