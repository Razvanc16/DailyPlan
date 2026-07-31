import { useState, useEffect, useRef, useCallback } from "react";

const ACCENT = "#FF3366";
const ACCENT2 = "#B44FFF";
const API_URL =
  import.meta.env.VITE_API_URL ||
  (typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? window.location.origin
    : "http://localhost:3001");

const todayKey = () => new Date().toISOString().slice(0, 10);
const last7 = () => {
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d.toISOString().slice(0, 10)); }
  return days;
};

const typeColors = { work: "#FF3366", break: "#00E5FF", exercise: "#00C864", meal: "#FFB800", personal: "#B44FFF", free: "rgba(255,255,255,0.3)", sleep: "#6E7BFF" };
const typeLabels = { work: "Muncă", break: "Pauză", exercise: "Sport", meal: "Masă", personal: "Personal", free: "Liber", sleep: "Somn" };

const authHeaders = (token) => (token ? { Authorization: `Bearer ${token}` } : {});

const GLOBAL_STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  ::placeholder { color: rgba(255,255,255,0.3); }
  @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  button:active { transform: scale(0.97); }
  .dp-scroll { overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
`;

// Chei vechi, dinainte de conturi — folosite doar o dată, la înregistrare, pentru migrare.
const LEGACY_KEYS = ["dp:profile", "dp:habits", "dp:checks", "dp:messages"];
function readLegacyData() {
  try {
    const profile = localStorage.getItem("dp:profile") || undefined;
    const habits = JSON.parse(localStorage.getItem("dp:habits") || "null") || undefined;
    const checks = JSON.parse(localStorage.getItem("dp:checks") || "null") || undefined;
    const messages = JSON.parse(localStorage.getItem("dp:messages") || "null") || undefined;
    if (!profile && !habits && !checks && !messages) return null;
    return { profile, habits, checks, messages };
  } catch {
    return null;
  }
}
function clearLegacyData() {
  LEGACY_KEYS.forEach(k => localStorage.removeItem(k));
  try {
    Object.keys(localStorage).filter(k => k.startsWith("dp:checkinDone:")).forEach(k => localStorage.removeItem(k));
  } catch {}
}

// ---------- Ecran de autentificare ----------
function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const hasLegacy = !!readLegacyData();

  const submit = async () => {
    if (!email.trim() || !password) { setError("Completează email și parolă."); return; }
    setLoading(true); setError("");
    try {
      const body = { email: email.trim().toLowerCase(), password };
      if (mode === "register") {
        const legacy = readLegacyData();
        if (legacy) body.migrate = legacy;
      }
      const res = await fetch(`${API_URL}/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ceva n-a mers.");
      if (mode === "register" && body.migrate) clearLegacyData();
      onAuthed(data.token, data.user, data.data);
    } catch (err) {
      setError(err.message || "Ceva n-a mers.");
    }
    setLoading(false);
  };

  return (
    <div style={{ height: "100%", background: "#0B0B0F", color: "#fff", fontFamily: "'Inter', sans-serif", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, overflowY: "auto" }}>
      <style>{GLOBAL_STYLE}</style>
      <div style={{ fontSize: 28, fontWeight: 900, marginBottom: 6 }}>
        Daily<span style={{ background: `linear-gradient(135deg,${ACCENT},${ACCENT2})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Plan</span>
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 28, textAlign: "center" }}>Coach-ul tău de dezvoltare personală</div>

      <div style={{ width: "100%", maxWidth: 340 }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 18, background: "rgba(255,255,255,0.05)", borderRadius: 14, padding: 4 }}>
          {[{ id: "login", label: "Autentificare" }, { id: "register", label: "Cont nou" }].map(t => (
            <button key={t.id} onClick={() => { setMode(t.id); setError(""); }} style={{
              flex: 1, padding: "10px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700,
              background: mode === t.id ? `linear-gradient(135deg,${ACCENT},${ACCENT2})` : "transparent",
              color: mode === t.id ? "#fff" : "rgba(255,255,255,0.5)",
            }}>{t.label}</button>
          ))}
        </div>

        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" autoComplete="email"
          onKeyDown={e => e.key === "Enter" && submit()}
          style={{ width: "100%", padding: "13px 16px", marginBottom: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, color: "#fff", fontSize: 14, outline: "none", fontFamily: "'Inter', sans-serif" }} />
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Parolă"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          onKeyDown={e => e.key === "Enter" && submit()}
          style={{ width: "100%", padding: "13px 16px", marginBottom: 14, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, color: "#fff", fontSize: 14, outline: "none", fontFamily: "'Inter', sans-serif" }} />

        {error && <div style={{ fontSize: 12, color: ACCENT, marginBottom: 12, lineHeight: 1.5 }}>{error}</div>}

        <button onClick={submit} disabled={loading} style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: `linear-gradient(135deg,${ACCENT},${ACCENT2})`, color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
          {loading ? "Se procesează..." : mode === "login" ? "Intră în cont" : "Creează cont"}
        </button>

        {mode === "register" && (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 14, lineHeight: 1.5, textAlign: "center" }}>
            Minim 8 caractere la parolă. Datele tale (profil, obiceiuri, conversații) rămân legate de acest cont, nu de acest telefon.
            {hasLegacy && <div style={{ color: "#FFB800", marginTop: 8 }}>Am găsit date salvate anterior în acest browser — le mut automat în contul nou.</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Aplicația principală (după autentificare) ----------
function Dashboard({ token, user, initialData, onLogout }) {
  const [view, setView] = useState("chat");
  const [profile, setProfile] = useState(initialData?.profile || "");
  const [habits, setHabits] = useState(initialData?.habits || []);
  const [checks, setChecks] = useState(initialData?.checks || {});
  const [newHabit, setNewHabit] = useState("");
  const [deletedHabit, setDeletedHabit] = useState(null);
  const undoTimer = useRef(null);

  const [messages, setMessages] = useState(initialData?.messages || []);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [checkinDoneDate, setCheckinDoneDate] = useState(initialData?.checkinDoneDate || null);
  const checkinDone = checkinDoneDate === todayKey();
  const [genLoading, setGenLoading] = useState(false);
  const chatEndRef = useRef(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [lastError, setLastError] = useState(null); // { retry }
  const [importStatus, setImportStatus] = useState(null);
  const fileInputRef = useRef(null);
  const saveTimer = useRef(null);

  // Trimite modificările către server (per cont) — debounce pentru câmpuri scrise continuu (profilul).
  const pushData = useCallback((partial, { debounce } = {}) => {
    const doSave = () => {
      fetch(`${API_URL}/api/me/data`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body: JSON.stringify(partial),
      }).catch(() => {});
    };
    if (debounce) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(doSave, 800);
    } else {
      doSave();
    }
  }, [token]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, questions, qIndex]);

  const saveProfile = (v) => { setProfile(v); pushData({ profile: v }, { debounce: true }); };
  const saveHabits = (h) => { setHabits(h); pushData({ habits: h }); };
  const saveChecks = (c) => { setChecks(c); pushData({ checks: c }); };
  const saveMessages = (m) => { setMessages(m); pushData({ messages: m }); };

  const exportBackup = () => {
    const payload = { profile, habits, checks, messages, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `dailyplan-backup-${todayKey()}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setImportStatus({ ok: true, msg: "Backup descărcat." });
    setTimeout(() => setImportStatus(null), 3000);
  };

  const importBackup = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (typeof data.profile === "string") saveProfile(data.profile);
        if (Array.isArray(data.habits)) saveHabits(data.habits);
        if (data.checks && typeof data.checks === "object") saveChecks(data.checks);
        if (Array.isArray(data.messages)) saveMessages(data.messages);
        setImportStatus({ ok: true, msg: "Backup restaurat cu succes." });
      } catch {
        setImportStatus({ ok: false, msg: "Fișierul nu e un backup valid DailyPlan." });
      }
      setTimeout(() => setImportStatus(null), 4000);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

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
    let s = "Obiceiuri: " + (habits.length ? habits.map(h => h.name).join(", ") : "(niciunul definit încă)") + "\n";
    if (!days.length) return s + "Niciun progres bifat încă.";
    days.forEach(d => { const done = habits.filter(h => checks[d]?.[h.id]).map(h => h.name); s += `${d}: ${done.length ? done.join(", ") : "nimic"}\n`; });
    return s;
  };

  // Pornește check-in-ul: generează întrebările din profil
  const startCheckin = async () => {
    setLoading(true);
    setLastError(null);
    try {
      const res = await fetch(`${API_URL}/api/questions`, {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body: JSON.stringify({ profile, habits: habitsSummary() }),
      });
      const data = await res.json();
      if (data.questions?.length) { setQuestions(data.questions); setQIndex(0); setAnswers([]); }
      else throw new Error(data.error);
    } catch (err) {
      saveMessages([...messages, { role: "assistant", content: err?.message || "N-am putut genera întrebările. Verifică profilul și conexiunea, apoi încearcă din nou." }]);
      setLastError({ retry: startCheckin });
    }
    setLoading(false);
  };

  const answerQuestion = (answer) => {
    const q = questions[qIndex];
    const newAnswers = [...answers, { q: q.q, a: answer }];
    setAnswers(newAnswers);
    if (qIndex + 1 < questions.length) {
      saveMessages([...messages, { role: "assistant", content: q.q }, { role: "user", content: answer }]);
      setQIndex(qIndex + 1);
    } else {
      setQuestions([]);
      const today = todayKey();
      setCheckinDoneDate(today);
      pushData({ checkinDoneDate: today });
      const base = [...messages, { role: "assistant", content: q.q }, { role: "user", content: answer }];
      saveMessages([...base, { role: "assistant", content: "Perfect, am tot ce-mi trebuie! 🎯 Acum pot să-ți construiesc orarul zilei — apasă butonul de jos. Sau continuă să vorbim dacă vrei să adaugi ceva." }]);
    }
  };

  const postChat = async (newMsgs) => {
    setLoading(true);
    setLastError(null);
    try {
      const apiMsgs = newMsgs.filter(m => !m.schedule).map(m => ({ role: m.role, content: m.content }));
      const res = await fetch(`${API_URL}/api/chat`, {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body: JSON.stringify({ messages: apiMsgs, profile, habits: habitsSummary() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      saveMessages([...newMsgs, { role: "assistant", content: data.reply }]);
    } catch (err) {
      saveMessages([...newMsgs, { role: "assistant", content: err?.message || "Ceva n-a mers. Verifică conexiunea și încearcă din nou." }]);
      setLastError({ retry: () => postChat(newMsgs) });
    }
    setLoading(false);
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const newMsgs = [...messages, { role: "user", content: input.trim() }];
    saveMessages(newMsgs); setInput("");
    await postChat(newMsgs);
  };

  const generateSchedule = async () => {
    if (genLoading) return;
    setGenLoading(true);
    setLastError(null);
    const answersText = answers.map(a => `${a.q} → ${a.a}`).join("\n");
    const convoText = messages.filter(m => !m.schedule).map(m => `${m.role === "user" ? "Eu" : "Coach"}: ${m.content}`).join("\n");
    try {
      const res = await fetch(`${API_URL}/api/generate-schedule`, {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeaders(token) },
        body: JSON.stringify({
          profile,
          habits: habitsSummary(),
          tasks: `Răspunsurile de azi la check-in:\n${answersText}\n\nDin conversație:\n${convoText}`,
        }),
      });
      const data = await res.json();
      if (data.schedule) {
        saveMessages([...messages, { role: "assistant", content: "Iată orarul tău de azi:", schedule: data.schedule }]);
      } else throw new Error(data.error);
    } catch (err) {
      saveMessages([...messages, { role: "assistant", content: err?.message || "N-am putut genera orarul. Încearcă din nou." }]);
      setLastError({ retry: generateSchedule });
    }
    setGenLoading(false);
  };

  const resetCheckin = () => setShowResetConfirm(true);
  const confirmResetCheckin = () => {
    setCheckinDoneDate(null);
    pushData({ checkinDoneDate: null });
    setAnswers([]); setQuestions([]); saveMessages([]);
    setShowResetConfirm(false);
  };

  const day = todayKey();
  const todayChecks = checks[day] || {};
  const doneToday = habits.filter(h => todayChecks[h.id]).length;
  const streak = (() => {
    let c = 0;
    const d = new Date();
    for (let i = 0; i < 3650; i++) {
      const key = d.toISOString().slice(0, 10);
      const ch = checks[key];
      if (ch && habits.some(h => ch[h.id])) { c++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return c;
  })();

  const inCheckin = questions.length > 0;

  return (
    <div style={{ height: "100%", background: "#0B0B0F", color: "#fff", fontFamily: "'Inter', sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{GLOBAL_STYLE}</style>

      {/* HEADER — cu safe-area pentru notch/Dynamic Island */}
      <div style={{ padding: "20px 20px 14px", paddingTop: "calc(env(safe-area-inset-top, 0px) + 28px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
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

            {lastError && !inCheckin && (
              <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 12 }}>
                <button onClick={() => { const r = lastError.retry; setLastError(null); r(); }} style={{ fontSize: 12, fontWeight: 700, color: ACCENT, background: `${ACCENT}20`, border: `1px solid ${ACCENT}50`, borderRadius: 20, padding: "8px 16px", cursor: "pointer" }}>
                  🔄 Încearcă din nou
                </button>
              </div>
            )}

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

          {checkinDone && !messages.some(m => m.schedule) && (
            <div style={{ padding: "10px 16px 0" }}>
              <button onClick={generateSchedule} disabled={genLoading} style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: genLoading ? "rgba(255,51,102,0.4)" : `linear-gradient(135deg,${ACCENT},${ACCENT2})`, color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
                {genLoading ? "Se construiește orarul..." : "✨ Generează orarul zilei"}
              </button>
            </div>
          )}

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

          {habits.length === 0 && (
            <div style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: 13, padding: "14px 10px", marginBottom: 10 }}>
              Niciun obicei încă. Adaugă primul mai jos — sunt ale tale, nimic predefinit. 👇
            </div>
          )}

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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, padding: "12px 14px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Conectat ca <span style={{ color: "#fff", fontWeight: 700 }}>{user.email}</span></div>
            <button onClick={onLogout} style={{ background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 700, padding: "7px 12px", cursor: "pointer" }}>Deconectare</button>
          </div>

          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Despre tine</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, marginBottom: 16 }}>
            Scrie tot ce ar trebui coach-ul să știe: obiectivele tale, ritmul zilei, ce vrei să schimbi. Se salvează automat în contul tău și e folosit la întrebările de dimineață și la orare.
          </div>
          <textarea value={profile} onChange={e => saveProfile(e.target.value)} rows={12}
            placeholder={"ex: Lucrez de acasă și vreau să mă culc mai devreme, să fac mișcare de 2-3 ori pe săptămână și să fiu mai constant cu proiectele mele. Mă trezesc greu dimineața și amân des."}
            style={{ width: "100%", padding: "16px", borderRadius: 14, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", fontSize: 14, outline: "none", resize: "vertical", lineHeight: 1.6, fontFamily: "'Inter', sans-serif" }} />
          <div style={{ fontSize: 12, color: "#00C864", marginTop: 10 }}>✓ Salvat automat în cont</div>
          <div style={{ marginTop: 24, padding: "16px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
              ℹ️ DailyPlan te ajută cu organizare, obiceiuri și informații generale de nutriție. Nu înlocuiește un medic sau nutriționist — pentru planuri medicale personalizate, cel mai bine e să vorbești și cu un specialist.
            </div>
          </div>

          <div style={{ marginTop: 16, padding: "16px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Backup date</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.6, marginBottom: 12 }}>
              Datele tale sunt legate de cont, dar poți exporta oricând o copie locală.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={exportBackup} style={{ flex: 1, padding: "11px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>⬇ Exportă</button>
              <button onClick={() => fileInputRef.current?.click()} style={{ flex: 1, padding: "11px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>⬆ Importă</button>
              <input ref={fileInputRef} type="file" accept="application/json" onChange={importBackup} style={{ display: "none" }} />
            </div>
            {importStatus && (
              <div style={{ fontSize: 12, marginTop: 10, color: importStatus.ok ? "#00C864" : "#FF3366" }}>{importStatus.msg}</div>
            )}
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

      {/* Modal confirmare resetare check-in */}
      {showResetConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 20 }} onClick={() => setShowResetConfirm(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#17171d", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: 22, maxWidth: 340, width: "100%", boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Resetezi check-in-ul de azi?</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.5, marginBottom: 18 }}>Poți răspunde din nou la întrebări, dar conversația de azi se va șterge.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowResetConfirm(false)} style={{ flex: 1, padding: "11px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.7)", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>Anulează</button>
              <button onClick={confirmResetCheckin} style={{ flex: 1, padding: "11px", borderRadius: 12, border: "none", background: `linear-gradient(135deg,${ACCENT},${ACCENT2})`, color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 14 }}>Resetează</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Wrapper: sesiune / autentificare ----------
export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("dp:token") || null);
  const [user, setUser] = useState(null);
  const [initialData, setInitialData] = useState(null);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBootError(false);
      if (!token) { setBooting(false); return; }
      setBooting(true);
      // Reîncercăm de câteva ori la eșec de rețea (frecvent pe mobil) înainte să
      // arătăm o eroare — un token valid nu trebuie tratat ca "delogat" doar
      // pentru că a picat un request pe 4G.
      const attempts = 3;
      for (let i = 0; i < attempts && !cancelled; i++) {
        try {
          const res = await fetch(`${API_URL}/api/me`, { headers: authHeaders(token) });
          if (res.status === 401) {
            localStorage.removeItem("dp:token");
            if (!cancelled) setToken(null);
            break;
          } else if (res.ok) {
            const data = await res.json();
            if (!cancelled) { setUser(data.user); setInitialData(data.data); }
            break;
          } else if (i === attempts - 1 && !cancelled) {
            setBootError(true);
          }
        } catch {
          if (i === attempts - 1 && !cancelled) setBootError(true);
        }
        if (i < attempts - 1) await new Promise(r => setTimeout(r, 600 * (i + 1)));
      }
      if (!cancelled) setBooting(false);
    })();
    return () => { cancelled = true; };
  }, [token, retryTick]);

  const handleAuthed = (tok, u, data) => {
    localStorage.setItem("dp:token", tok);
    setToken(tok); setUser(u); setInitialData(data);
  };

  const handleLogout = () => {
    fetch(`${API_URL}/api/auth/logout`, { method: "POST", headers: authHeaders(token) }).catch(() => {});
    localStorage.removeItem("dp:token");
    setToken(null); setUser(null); setInitialData(null);
  };

  const shellStyle = { height: "100%", background: "#0B0B0F", color: "#fff", fontFamily: "'Inter', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" };

  if (booting) {
    return <div style={shellStyle}><style>{GLOBAL_STYLE}</style><div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>Se încarcă...</div></div>;
  }

  if (bootError) {
    return (
      <div style={shellStyle}>
        <style>{GLOBAL_STYLE}</style>
        <div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 16 }}>Nu am putut contacta serverul. Verifică conexiunea.</div>
          <button onClick={() => setRetryTick(t => t + 1)} style={{ padding: "12px 24px", borderRadius: 14, border: "none", background: `linear-gradient(135deg,${ACCENT},${ACCENT2})`, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>Reîncearcă</button>
        </div>
      </div>
    );
  }

  if (!token || !user) {
    return <AuthScreen onAuthed={handleAuthed} />;
  }

  return <Dashboard key={user.id} token={token} user={user} initialData={initialData} onLogout={handleLogout} />;
}
