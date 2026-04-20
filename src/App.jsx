import { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, orderBy } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyADHYjRMDYsXT2gXkNwR3VzEpc8oOr3o04",
  authDomain: "finanzinho-2966b.firebaseapp.com",
  projectId: "finanzinho-2966b",
  storageBucket: "finanzinho-2966b.firebasestorage.app",
  messagingSenderId: "542269306227",
  appId: "1:542269306227:web:56f00e4e8ef107a15b4106",
  measurementId: "G-8TSVTTSFQ4"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const SENHA_CORRETA = "#Kempner123";
const LOGIN_KEY = "finzinho-logado";
const CONFIG_KEY = "finzinho-config-v3";
const FIXOS_KEY = "finzinho-fixos-v1";

const CATEGORIES = {
  alimentacao: { label: "Alimentação", emoji: "🍽️", color: "#f97316", keywords: ["mercado","supermercado","restaurante","lanche","almoço","jantar","café","padaria","pizza","ifood","rappi","delivery","feira","açougue","peixaria","comida","refeição","hamburguer","sushi","churrasco"] },
  transporte: { label: "Transporte", emoji: "🚗", color: "#3b82f6", keywords: ["uber","99","taxi","ônibus","metrô","combustível","gasolina","etanol","estacionamento","pedágio","moto","bicicleta","transporte","passagem","bilhete"] },
  saude: { label: "Saúde", emoji: "💊", color: "#10b981", keywords: ["farmácia","remédio","médico","consulta","dentista","hospital","exame","plano de saúde","academia","psicólogo","fisioterapia","saúde","clínica"] },
  lazer: { label: "Lazer", emoji: "🎬", color: "#a855f7", keywords: ["cinema","show","teatro","netflix","spotify","youtube","jogo","viagem","hotel","passeio","diversão","bar","balada","festa","ingresso"] },
  moradia: { label: "Moradia", emoji: "🏠", color: "#f59e0b", keywords: ["aluguel","condomínio","luz","energia","água","internet","gás","conta","iptu","seguro","manutenção","reforma","móvel","eletrodoméstico"] },
  educacao: { label: "Educação", emoji: "📚", color: "#06b6d4", keywords: ["escola","faculdade","curso","livro","material","mensalidade","aula","treinamento","workshop","certificado","educação"] },
  roupas: { label: "Roupas", emoji: "👕", color: "#ec4899", keywords: ["roupa","sapato","tênis","camisa","calça","vestido","blusa","jaqueta","moda","loja","shein","renner","c&a","riachuelo"] },
  outros: { label: "Outros", emoji: "📦", color: "#6b7280", keywords: [] },
};

const EXEMPLOS = ["gastei 45 no mercado","uber 18,50","almoço 32 reais","farmácia 27,90","netflix 45","conta de luz 180"];

function formatCurrency(val) { return Number(val).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function formatDate(iso) { return new Date(iso).toLocaleDateString("pt-BR"); }
function getMesAtual() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth()}`; }

function detectCategory(text) {
  const lower = text.toLowerCase();
  for (const [key, cat] of Object.entries(CATEGORIES)) {
    if (key === "outros") continue;
    if (cat.keywords.some(k => lower.includes(k))) return key;
  }
  return "outros";
}

function parseGasto(text) {
  const valorMatch = text.match(/r?\$?\s?(\d+(?:[.,]\d{1,2})?)/i);
  if (!valorMatch) return null;
  const valor = parseFloat(valorMatch[1].replace(",", "."));
  if (isNaN(valor) || valor <= 0) return null;
  const descricao = text.replace(/r?\$?\s?\d+(?:[.,]\d{1,2})?/i, "").replace(/gastei|comprei|paguei|no|na|em|de|com|reais|real/gi, " ").replace(/\s+/g, " ").trim() || "Gasto";
  return { valor, descricao: descricao.charAt(0).toUpperCase() + descricao.slice(1), categoria: detectCategory(text) };
}

function exportarExcel(gastos) {
  const header = ["Data","Descrição","Categoria","Valor (R$)"];
  const rows = gastos.map(g => [formatDate(g.data), g.descricao, CATEGORIES[g.categoria]?.label || "Outros", g.valor.toFixed(2).replace(".", ",")]);
  const csv = [header, ...rows].map(r => r.join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "finzinho-gastos.csv"; a.click();
  URL.revokeObjectURL(url);
}

function LoginScreen({ onLogin, dark }) {
  const [senha, setSenha] = useState(""); const [erro, setErro] = useState(false); const [mostrar, setMostrar] = useState(false);
  const bg = dark ? "#0f0f13" : "#f5f5f0"; const card = dark ? "#1a1a24" : "#ffffff"; const border = dark ? "#2a2a38" : "#e0e0e0"; const text = dark ? "#e8e8f0" : "#1a1a24";
  const handleLogin = () => { if (senha === SENHA_CORRETA) { localStorage.setItem(LOGIN_KEY, "true"); onLogin(); } else { setErro(true); setSenha(""); setTimeout(() => setErro(false), 2000); } };
  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <div style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 8 }}>🐟</div>
          <div style={{ fontWeight: 600, fontSize: 24, color: text }}>Finzinho</div>
          <div style={{ fontSize: 13, color: dark ? "#444" : "#999", fontFamily: "'DM Mono'", marginTop: 4 }}>controle de gastos</div>
        </div>
        <div style={{ width: "100%", background: card, border: `1px solid ${erro ? "#4a1a1a" : border}`, borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, color: dark ? "#666" : "#999", display: "block", marginBottom: 8, fontFamily: "'DM Mono'" }}>SENHA</label>
            <div style={{ position: "relative" }}>
              <input type={mostrar ? "text" : "password"} value={senha} onChange={e => setSenha(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="Digite sua senha" autoFocus
                style={{ width: "100%", background: bg, border: `1px solid ${erro ? "#7f2a2a" : border}`, borderRadius: 10, padding: "11px 44px 11px 14px", color: erro ? "#f87171" : text, fontSize: 15, fontFamily: "'DM Mono'", outline: "none", boxSizing: "border-box", letterSpacing: mostrar ? "normal" : "2px" }} />
              <button onClick={() => setMostrar(m => !m)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 16, color: dark ? "#444" : "#999" }}>{mostrar ? "🙈" : "👁️"}</button>
            </div>
            {erro && <div style={{ fontSize: 12, color: "#f87171", marginTop: 6 }}>Senha incorreta.</div>}
          </div>
          <button onClick={handleLogin} disabled={!senha} style={{ background: senha ? "#a0e9c0" : (dark ? "#1e1e2e" : "#eee"), color: senha ? "#0f1f0f" : (dark ? "#333" : "#aaa"), border: "none", borderRadius: 10, padding: "12px", fontWeight: 600, fontSize: 15, cursor: senha ? "pointer" : "default", fontFamily: "'DM Sans'" }}>Entrar</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [logado, setLogado] = useState(false);
  const [checando, setChecando] = useState(true);
  const [dark, setDark] = useState(true);
  const [gastos, setGastos] = useState([]);
  const [fixos, setFixos] = useState([]);
  const [config, setConfig] = useState({ meta: 0 });
  const [carregando, setCarregando] = useState(false);
  const [view, setView] = useState("chat");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [form, setForm] = useState({ descricao: "", valor: "", categoria: "alimentacao" });
  const [fixoForm, setFixoForm] = useState({ descricao: "", valor: "", categoria: "moradia" });
  const [filterCat, setFilterCat] = useState("todas");
  const [pendente, setPendente] = useState(null);
  const [selecionados, setSelecionados] = useState([]);
  const [exemploIdx, setExemploIdx] = useState(0);
  const [editando, setEditando] = useState(null);
  const [metaInput, setMetaInput] = useState("");
  const [subView, setSubView] = useState("lista");
  const messagesEndRef = useRef(null);

  const bg = dark ? "#0f0f13" : "#f5f5f0";
  const card = dark ? "#1a1a24" : "#ffffff";
  const border = dark ? "#2a2a38" : "#e0e0e0";
  const text = dark ? "#e8e8f0" : "#1a1a24";
  const muted = dark ? "#555" : "#999";
  const subtle = dark ? "#444" : "#bbb";

  useEffect(() => { const s = localStorage.getItem(LOGIN_KEY); if (s === "true") setLogado(true); setChecando(false); }, []);

  useEffect(() => {
    if (!logado) return;
    carregarGastos();
    try { const s = localStorage.getItem(CONFIG_KEY); if (s) { const c = JSON.parse(s); setConfig(c); setMetaInput(c.meta > 0 ? c.meta.toString() : ""); } } catch {}
    try { const s = localStorage.getItem(FIXOS_KEY); if (s) setFixos(JSON.parse(s)); } catch {}
    const interval = setInterval(() => setExemploIdx(i => (i + 1) % EXEMPLOS.length), 3000);
    return () => clearInterval(interval);
  }, [logado]);

  const carregarGastos = async () => {
    setCarregando(true);
    try {
      const q = query(collection(db, "gastos"), orderBy("data", "desc"));
      const snap = await getDocs(q);
      setGastos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setCarregando(false);
  };

  useEffect(() => { try { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); } catch {} }, [config]);
  useEffect(() => { try { localStorage.setItem(FIXOS_KEY, JSON.stringify(fixos)); } catch {} }, [fixos]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const addGasto = async (g) => {
    const novo = { ...g, data: new Date().toISOString() };
    const docRef = await addDoc(collection(db, "gastos"), novo);
    const comId = { id: docRef.id, ...novo };
    setGastos(prev => [comId, ...prev]);
    return comId;
  };

  const removeGastos = async (ids) => {
    await Promise.all(ids.map(id => deleteDoc(doc(db, "gastos", id))));
    setGastos(prev => prev.filter(g => !ids.includes(g.id)));
    setSelecionados([]);
  };

  const salvarEdicao = async () => {
    if (!editando) return;
    const { id, ...dados } = editando;
    await updateDoc(doc(db, "gastos", id), { descricao: dados.descricao, valor: parseFloat(String(dados.valor).replace(",", ".")), categoria: dados.categoria });
    setGastos(prev => prev.map(g => g.id === id ? { ...g, ...dados } : g));
    setEditando(null);
  };

  const toggleSelecionado = (id) => setSelecionados(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  const aplicarFixosDoMes = async () => {
    const mes = getMesAtual();
    const jaAplicados = gastos.filter(g => g.fixoMes === mes).map(g => g.fixoId);
    const novos = fixos.filter(f => !jaAplicados.includes(f.id));
    for (const f of novos) {
      await addGasto({ ...f, fixoId: f.id, fixoMes: mes });
    }
    return novos.length;
  };

  const handleSend = async (overrideInput) => {
    const text = (overrideInput !== undefined ? overrideInput : input).trim();
    if (!text) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", text }]);
    if (pendente) {
      const lower = text.toLowerCase();
      if (["sim","s","yes","confirma","ok","pode","isso"].some(w => lower.includes(w))) {
        const novo = await addGasto(pendente); setPendente(null);
        setMessages(prev => [...prev, { role: "bot", text: `✅ Anotado!\n${CATEGORIES[novo.categoria].emoji} ${novo.descricao}\n${formatCurrency(novo.valor)}`, gasto: novo }]);
      } else if (["não","nao","n","no","cancela"].some(w => lower.includes(w))) {
        setPendente(null); setMessages(prev => [...prev, { role: "bot", text: "Ok, cancelei! 😊" }]);
      } else { setMessages(prev => [...prev, { role: "bot", text: "Responde sim ou não 👆" }]); }
      return;
    }
    const resultado = parseGasto(text);
    if (!resultado) { setMessages(prev => [...prev, { role: "bot", text: "Não consegui identificar o valor 🤔\nEx: 'mercado 50'" }]); return; }
    const cat = CATEGORIES[resultado.categoria];
    setPendente(resultado);
    setMessages(prev => [...prev, { role: "bot", text: `Confirma?\n\n${cat.emoji} ${resultado.descricao}\n💰 ${formatCurrency(resultado.valor)}\n📂 ${cat.label}`, confirmando: true }]);
  };

  const handleFormSubmit = async () => {
    if (!form.descricao || !form.valor) return;
    const novo = await addGasto({ ...form, valor: parseFloat(String(form.valor).replace(",", ".")) });
    setForm({ descricao: "", valor: "", categoria: "alimentacao" });
    setMessages(prev => [...prev, { role: "bot", text: `✅ Adicionado!\n${CATEGORIES[novo.categoria].emoji} ${novo.descricao}\n${formatCurrency(novo.valor)}`, gasto: novo }]);
    setView("chat");
  };

  const handleFixoAdd = () => {
    if (!fixoForm.descricao || !fixoForm.valor) return;
    setFixos(prev => [...prev, { ...fixoForm, valor: parseFloat(String(fixoForm.valor).replace(",", ".")), id: Date.now() }]);
    setFixoForm({ descricao: "", valor: "", categoria: "moradia" });
  };

  const totalMes = gastos.filter(g => { const d = new Date(g.data); const h = new Date(); return d.getMonth() === h.getMonth() && d.getFullYear() === h.getFullYear(); }).reduce((s, g) => s + g.valor, 0);
  const totalGeral = gastos.reduce((s, g) => s + g.valor, 0);
  const porCategoria = Object.entries(CATEGORIES).map(([key, cat]) => ({ key, ...cat, total: gastos.filter(g => g.categoria === key).reduce((s, g) => s + g.valor, 0) })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);
  const gastosFiltrados = filterCat === "todas" ? gastos : gastos.filter(g => g.categoria === filterCat);
  const pctMeta = config.meta > 0 ? Math.min((totalMes / config.meta) * 100, 100) : 0;
  const corMeta = pctMeta > 90 ? "#f87171" : pctMeta > 70 ? "#f59e0b" : "#a0e9c0";

  const inp = { background: card, border: `1px solid ${border}`, borderRadius: 10, padding: "10px 14px", color: text, fontSize: 14, fontFamily: "'DM Sans'", outline: "none", width: "100%", boxSizing: "border-box" };

  if (checando) return null;
  if (!logado) return <LoginScreen onLogin={() => setLogado(true)} dark={dark} />;

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: bg, minHeight: "100vh", color: text, display: "flex", flexDirection: "column", transition: "background 0.3s" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: bg, position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>🐟</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Finzinho</div>
            <div style={{ fontSize: 10, color: muted, fontFamily: "'DM Mono'" }}>{carregando ? "carregando..." : "controle de gastos"}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 9, color: subtle, fontFamily: "'DM Mono'", marginBottom: 1 }}>MÊS ATUAL</div>
            <div style={{ fontFamily: "'DM Mono'", fontSize: 14, color: corMeta, fontWeight: 500 }}>{formatCurrency(totalMes)}</div>
            {config.meta > 0 && <div style={{ fontSize: 9, color: muted }}>{formatCurrency(config.meta)} limite</div>}
          </div>
          <button onClick={() => setDark(d => !d)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 8, padding: "5px 8px", fontSize: 14, cursor: "pointer" }}>{dark ? "☀️" : "🌙"}</button>
          <button onClick={() => { localStorage.removeItem(LOGIN_KEY); setLogado(false); }} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 8, padding: "5px 8px", color: muted, fontSize: 11, cursor: "pointer" }}>Sair</button>
        </div>
      </div>

      {/* Meta bar */}
      {config.meta > 0 && (
        <div style={{ padding: "6px 16px", borderBottom: `1px solid ${border}` }}>
          <div style={{ height: 4, background: dark ? "#1e1e2e" : "#eee", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pctMeta}%`, background: corMeta, borderRadius: 2, transition: "width 0.5s" }} />
          </div>
          <div style={{ fontSize: 10, color: muted, marginTop: 3 }}>{pctMeta.toFixed(0)}% do limite mensal usado</div>
        </div>
      )}

      {/* Nav */}
      <div style={{ display: "flex", borderBottom: `1px solid ${border}` }}>
        {[["chat","💬"],["historico","🕐"],["resumo","📊"],["form","➕"],["config","⚙️"]].map(([key, label]) => (
          <button key={key} onClick={() => { setView(key); setSelecionados([]); setEditando(null); }} style={{ flex: 1, padding: "10px 0", border: "none", background: "none", color: view === key ? "#a0e9c0" : muted, fontSize: 18, cursor: "pointer", borderBottom: view === key ? "2px solid #a0e9c0" : "2px solid transparent", transition: "all 0.2s" }}>{label}</button>
        ))}
      </div>

      {/* CHAT */}
      {view === "chat" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 130px)" }}>
          {messages.length === 0 ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🐟</div>
              <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Oi! Sou o Finzinho</div>
              <div style={{ fontSize: 14, color: muted, lineHeight: 1.6 }}>Me diz o que você gastou<br />e eu anoto pra você 💰</div>
              <div style={{ marginTop: 20, padding: "8px 16px", background: card, border: `1px solid ${border}`, borderRadius: 20, fontSize: 13, color: muted, fontFamily: "'DM Mono'" }}>
                gasto mensal: <span style={{ color: corMeta }}>{formatCurrency(totalMes)}</span>
              </div>
              {config.meta > 0 && pctMeta > 70 && (
                <div style={{ marginTop: 10, padding: "8px 14px", background: dark ? "#2a1a0a" : "#fff8f0", border: `1px solid ${corMeta}44`, borderRadius: 12, fontSize: 12, color: corMeta }}>
                  {pctMeta > 90 ? "⚠️ Atenção! Quase no limite do mês!" : "📊 Mais da metade do limite usado"}
                </div>
              )}
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              {messages.map((msg, i) => (
                <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                  <div style={{ maxWidth: "82%", background: msg.role === "user" ? (dark ? "#1e3a5f" : "#e8f0ff") : msg.confirmando ? (dark ? "#1a2a1a" : "#f0fff4") : card, border: `1px solid ${msg.role === "user" ? (dark ? "#2a4a7f" : "#c0d0ff") : msg.confirmando ? (dark ? "#2a4a2a" : "#b0e0c0") : border}`, borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", padding: "10px 14px", fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-line", color: text }}>
                    {msg.text}
                    {msg.gasto && (
                      <div style={{ marginTop: 8, padding: "6px 10px", background: dark ? "#0f1f0f" : "#f0fff4", border: `1px solid ${dark ? "#1a3a1a" : "#b0e0c0"}`, borderRadius: 8, fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                        <span>{CATEGORIES[msg.gasto.categoria]?.emoji}</span>
                        <span style={{ color: "#a0e9c0", fontFamily: "'DM Mono'" }}>{formatCurrency(msg.gasto.valor)}</span>
                        <span style={{ color: muted }}>·</span>
                        <span style={{ color: muted }}>{msg.gasto.descricao}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
          {pendente && (
            <div style={{ padding: "0 16px 8px", display: "flex", gap: 8 }}>
              <button onClick={() => handleSend("sim")} style={{ flex: 1, padding: "8px", borderRadius: 10, border: "1px solid #2a4a2a", background: dark ? "#1a3a1a" : "#f0fff4", color: "#a0e9c0", fontSize: 13, cursor: "pointer" }}>✅ Sim</button>
              <button onClick={() => handleSend("não")} style={{ flex: 1, padding: "8px", borderRadius: 10, border: "1px solid #4a2a2a", background: dark ? "#3a1a1a" : "#fff0f0", color: "#f87171", fontSize: 13, cursor: "pointer" }}>❌ Não</button>
            </div>
          )}
          <div style={{ padding: "10px 16px 6px", borderTop: `1px solid ${border}`, display: "flex", gap: 8 }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSend()} placeholder={pendente ? "sim ou não..." : "Ex: " + EXEMPLOS[exemploIdx]} style={{ ...inp, flex: 1 }} />
            <button onClick={() => handleSend()} disabled={!input.trim()} style={{ background: "#a0e9c0", color: "#0f1f0f", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 600, fontSize: 14, cursor: "pointer", opacity: !input.trim() ? 0.4 : 1 }}>Enviar</button>
          </div>
          <div style={{ padding: "4px 16px 10px", fontSize: 11, color: subtle, textAlign: "center" }}>Digite o que gastou em linguagem natural</div>
        </div>
      )}

      {/* HISTÓRICO */}
      {view === "historico" && (
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {[["lista","📋 Gastos"],["fixos","🔄 Fixos"]].map(([k, l]) => (
              <button key={k} onClick={() => setSubView(k)} style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${subView === k ? "#a0e9c0" : border}`, background: subView === k ? "#a0e9c022" : "none", color: subView === k ? "#a0e9c0" : muted, fontSize: 13, cursor: "pointer" }}>{l}</button>
            ))}
          </div>

          {subView === "lista" && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: subtle, fontFamily: "'DM Mono'" }}>{gastos.length} GASTOS · {formatCurrency(totalGeral)}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {selecionados.length > 0 && (
                    <button onClick={() => { if (window.confirm(`Apagar ${selecionados.length} gasto(s)?`)) removeGastos(selecionados); }} style={{ background: dark ? "#3a1a1a" : "#fff0f0", border: "1px solid #7f2a2a", borderRadius: 8, padding: "5px 10px", color: "#f87171", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>🗑️ Apagar {selecionados.length}</button>
                  )}
                  <button onClick={() => exportarExcel(gastos)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 8, padding: "5px 10px", color: muted, fontSize: 12, cursor: "pointer" }}>📤 Excel</button>
                </div>
              </div>

              <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                {[["todas","Todas","#a0e9c0"], ...Object.entries(CATEGORIES).map(([k,c]) => [k,`${c.emoji}`,c.color])].map(([key, label, color]) => (
                  <button key={key} onClick={() => setFilterCat(key)} style={{ padding: "4px 10px", borderRadius: 20, border: `1px solid ${filterCat === key ? color : border}`, background: filterCat === key ? color+"22" : "none", color: filterCat === key ? color : muted, fontSize: 12, cursor: "pointer" }}>{label}</button>
                ))}
              </div>

              {carregando ? (
                <div style={{ textAlign: "center", padding: 40, color: muted }}>Carregando... ☁️</div>
              ) : gastosFiltrados.length === 0 ? (
                <div style={{ textAlign: "center", padding: 40, color: subtle, fontSize: 14 }}>Nenhum gasto ainda 🐟</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {gastosFiltrados.map(g => {
                    const cat = CATEGORIES[g.categoria] || CATEGORIES.outros;
                    const sel = selecionados.includes(g.id);
                    if (editando?.id === g.id) return (
                      <div key={g.id} style={{ background: card, border: `1px solid #a0e9c0`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                        <input value={editando.descricao} onChange={e => setEditando(ed => ({ ...ed, descricao: e.target.value }))} style={inp} placeholder="Descrição" />
                        <input value={editando.valor} onChange={e => setEditando(ed => ({ ...ed, valor: e.target.value }))} style={{ ...inp, fontFamily: "'DM Mono'" }} placeholder="Valor" type="number" />
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {Object.entries(CATEGORIES).map(([key, c]) => (
                            <button key={key} onClick={() => setEditando(ed => ({ ...ed, categoria: key }))} style={{ padding: "5px 10px", borderRadius: 16, border: `1px solid ${editando.categoria === key ? c.color : border}`, background: editando.categoria === key ? c.color+"22" : "none", color: editando.categoria === key ? c.color : muted, fontSize: 12, cursor: "pointer" }}>{c.emoji} {c.label}</button>
                          ))}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={salvarEdicao} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", background: "#a0e9c0", color: "#0f1f0f", fontWeight: 600, cursor: "pointer" }}>Salvar</button>
                          <button onClick={() => setEditando(null)} style={{ flex: 1, padding: "8px", borderRadius: 8, border: `1px solid ${border}`, background: "none", color: muted, cursor: "pointer" }}>Cancelar</button>
                        </div>
                      </div>
                    );
                    return (
                      <div key={g.id} style={{ background: sel ? (dark ? "#1a2a3a" : "#e8f0ff") : card, border: `1px solid ${sel ? "#2a4a7f" : border}`, borderRadius: 12, padding: "11px 12px", display: "flex", alignItems: "center", gap: 8, transition: "all 0.15s" }}>
                        <div onClick={() => toggleSelecionado(g.id)} style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${sel ? "#a0e9c0" : subtle}`, background: sel ? "#a0e9c0" : "none", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 11, cursor: "pointer", color: "#0f1f0f" }}>{sel ? "✓" : ""}</div>
                        <div style={{ width: 30, height: 30, borderRadius: 8, background: cat.color+"22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>{cat.emoji}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.descricao}</div>
                          <div style={{ fontSize: 10, color: subtle, marginTop: 1 }}>{cat.label} · {formatDate(g.data)}</div>
                        </div>
                        <div style={{ fontFamily: "'DM Mono'", fontSize: 13, color: cat.color, flexShrink: 0 }}>{formatCurrency(g.valor)}</div>
                        <button onClick={() => setEditando({ ...g })} style={{ background: "none", border: "none", color: muted, cursor: "pointer", fontSize: 14, padding: "0 2px" }}>✏️</button>
                      </div>
                    );
                  })}
                </div>
              )}
              {gastos.length > 0 && selecionados.length === 0 && !editando && (
                <div style={{ textAlign: "center", marginTop: 12, fontSize: 11, color: subtle }}>Toque no ✏️ para editar · Toque no quadrado para selecionar</div>
              )}
            </>
          )}

          {subView === "fixos" && (
            <div>
              <div style={{ fontSize: 11, color: subtle, fontFamily: "'DM Mono'", marginBottom: 12 }}>GASTOS FIXOS MENSAIS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                <input value={fixoForm.descricao} onChange={e => setFixoForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Nome (ex: Aluguel, Netflix...)" style={inp} />
                <input value={fixoForm.valor} onChange={e => setFixoForm(f => ({ ...f, valor: e.target.value }))} placeholder="Valor" type="number" style={{ ...inp, fontFamily: "'DM Mono'" }} />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {Object.entries(CATEGORIES).map(([key, cat]) => (
                    <button key={key} onClick={() => setFixoForm(f => ({ ...f, categoria: key }))} style={{ padding: "5px 10px", borderRadius: 16, border: `1px solid ${fixoForm.categoria === key ? cat.color : border}`, background: fixoForm.categoria === key ? cat.color+"22" : "none", color: fixoForm.categoria === key ? cat.color : muted, fontSize: 12, cursor: "pointer" }}>{cat.emoji} {cat.label}</button>
                  ))}
                </div>
                <button onClick={handleFixoAdd} disabled={!fixoForm.descricao || !fixoForm.valor} style={{ padding: "10px", borderRadius: 10, border: "none", background: "#a0e9c0", color: "#0f1f0f", fontWeight: 600, fontSize: 14, cursor: "pointer", opacity: !fixoForm.descricao || !fixoForm.valor ? 0.4 : 1 }}>+ Adicionar fixo</button>
              </div>
              {fixos.length > 0 && (
                <>
                  <button onClick={async () => { const n = await aplicarFixosDoMes(); alert(n > 0 ? `${n} gasto(s) aplicado(s)!` : "Fixos já aplicados este mês!"); }} style={{ width: "100%", marginBottom: 10, padding: "10px", borderRadius: 10, border: `1px solid #a0e9c0`, background: "none", color: "#a0e9c0", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>🔄 Aplicar fixos deste mês</button>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {fixos.map(f => {
                      const cat = CATEGORIES[f.categoria] || CATEGORIES.outros;
                      return (
                        <div key={f.id} style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, padding: "11px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 30, height: 30, borderRadius: 8, background: cat.color+"22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>{cat.emoji}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{f.descricao}</div>
                            <div style={{ fontSize: 10, color: subtle }}>{cat.label}</div>
                          </div>
                          <div style={{ fontFamily: "'DM Mono'", fontSize: 13, color: cat.color }}>{formatCurrency(f.valor)}</div>
                          <button onClick={() => setFixos(prev => prev.filter(x => x.id !== f.id))} style={{ background: "none", border: "none", color: subtle, cursor: "pointer", fontSize: 14 }}>✕</button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* RESUMO */}
      {view === "resumo" && (
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1, padding: "12px 14px", background: card, border: `1px solid ${border}`, borderRadius: 12 }}>
              <div style={{ fontSize: 10, color: subtle, fontFamily: "'DM Mono'", marginBottom: 4 }}>MÊS ATUAL</div>
              <div style={{ fontFamily: "'DM Mono'", fontSize: 18, color: corMeta, fontWeight: 500 }}>{formatCurrency(totalMes)}</div>
            </div>
            <div style={{ flex: 1, padding: "12px 14px", background: card, border: `1px solid ${border}`, borderRadius: 12 }}>
              <div style={{ fontSize: 10, color: subtle, fontFamily: "'DM Mono'", marginBottom: 4 }}>TOTAL GERAL</div>
              <div style={{ fontFamily: "'DM Mono'", fontSize: 18, color: "#a0e9c0", fontWeight: 500 }}>{formatCurrency(totalGeral)}</div>
            </div>
          </div>
          {config.meta > 0 && (
            <div style={{ padding: "12px 14px", background: card, border: `1px solid ${border}`, borderRadius: 12, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 13 }}>Meta mensal</span>
                <span style={{ fontFamily: "'DM Mono'", fontSize: 13, color: corMeta }}>{formatCurrency(totalMes)} / {formatCurrency(config.meta)}</span>
              </div>
              <div style={{ height: 8, background: dark ? "#1e1e2e" : "#eee", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pctMeta}%`, background: corMeta, borderRadius: 4, transition: "width 0.5s" }} />
              </div>
              <div style={{ fontSize: 11, color: muted, marginTop: 4 }}>
                {config.meta - totalMes > 0 ? `Restam ${formatCurrency(config.meta - totalMes)}` : `Limite excedido em ${formatCurrency(totalMes - config.meta)}`}
              </div>
            </div>
          )}
          <div style={{ fontSize: 11, color: subtle, fontFamily: "'DM Mono'", marginBottom: 10 }}>POR CATEGORIA</div>
          {porCategoria.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: subtle, fontSize: 14 }}>Nenhum gasto ainda 🐟</div>
          ) : porCategoria.map(cat => {
            const pct = totalGeral > 0 ? (cat.total / totalGeral) * 100 : 0;
            return (
              <div key={cat.key} style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 16 }}>{cat.emoji}</span><span style={{ fontSize: 13 }}>{cat.label}</span></div>
                  <span style={{ fontFamily: "'DM Mono'", fontSize: 13, color: cat.color }}>{formatCurrency(cat.total)}</span>
                </div>
                <div style={{ height: 4, background: dark ? "#0f0f13" : "#eee", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: cat.color, borderRadius: 2 }} />
                </div>
                <div style={{ fontSize: 10, color: subtle, marginTop: 3 }}>{pct.toFixed(1)}% do total</div>
              </div>
            );
          })}
        </div>
      )}

      {/* FORMULÁRIO */}
      {view === "form" && (
        <div style={{ flex: 1, overflowY: "auto", padding: 16, maxWidth: 480 }}>
          <div style={{ fontSize: 11, color: subtle, fontFamily: "'DM Mono'", marginBottom: 14 }}>ADICIONAR GASTO</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div><label style={{ fontSize: 12, color: muted, display: "block", marginBottom: 6 }}>Descrição</label><input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Ex: Almoço no restaurante" style={inp} /></div>
            <div><label style={{ fontSize: 12, color: muted, display: "block", marginBottom: 6 }}>Valor (R$)</label><input value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} placeholder="0,00" type="number" min="0" step="0.01" style={{ ...inp, fontFamily: "'DM Mono'" }} /></div>
            <div>
              <label style={{ fontSize: 12, color: muted, display: "block", marginBottom: 8 }}>Categoria</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {Object.entries(CATEGORIES).map(([key, cat]) => (
                  <button key={key} onClick={() => setForm(f => ({ ...f, categoria: key }))} style={{ padding: "7px 12px", borderRadius: 20, border: `1px solid ${form.categoria === key ? cat.color : border}`, background: form.categoria === key ? cat.color+"22" : "none", color: form.categoria === key ? cat.color : muted, fontSize: 13, cursor: "pointer" }}>{cat.emoji} {cat.label}</button>
                ))}
              </div>
            </div>
            <button onClick={handleFormSubmit} disabled={!form.descricao || !form.valor} style={{ background: "#a0e9c0", color: "#0f1f0f", border: "none", borderRadius: 12, padding: "12px", fontWeight: 600, fontSize: 15, cursor: "pointer", marginTop: 8, opacity: !form.descricao || !form.valor ? 0.4 : 1 }}>Adicionar gasto</button>
          </div>
        </div>
      )}

      {/* CONFIG */}
      {view === "config" && (
        <div style={{ flex: 1, overflowY: "auto", padding: 16, maxWidth: 480 }}>
          <div style={{ fontSize: 11, color: subtle, fontFamily: "'DM Mono'", marginBottom: 14 }}>CONFIGURAÇÕES</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>🎯 Meta mensal</div>
              <div style={{ fontSize: 12, color: muted, marginBottom: 10 }}>Defina um limite de gastos por mês</div>
              <input value={metaInput} onChange={e => setMetaInput(e.target.value)} placeholder="Ex: 3000" type="number" style={{ ...inp, marginBottom: 10 }} />
              <button onClick={() => { const v = parseFloat(metaInput); setConfig(c => ({ ...c, meta: isNaN(v) ? 0 : v })); alert(v > 0 ? `Meta definida: ${formatCurrency(v)}` : "Meta removida!"); }} style={{ width: "100%", padding: "10px", borderRadius: 10, border: "none", background: "#a0e9c0", color: "#0f1f0f", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Salvar meta</button>
            </div>
            <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{dark ? "☀️" : "🌙"} Tema</div>
              <div style={{ fontSize: 12, color: muted, marginBottom: 10 }}>Alternar entre modo escuro e claro</div>
              <button onClick={() => setDark(d => !d)} style={{ width: "100%", padding: "10px", borderRadius: 10, border: `1px solid ${border}`, background: "none", color: text, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{dark ? "☀️ Mudar para claro" : "🌙 Mudar para escuro"}</button>
            </div>
            <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>📤 Exportar dados</div>
              <div style={{ fontSize: 12, color: muted, marginBottom: 10 }}>Baixar todos os gastos em planilha</div>
              <button onClick={() => exportarExcel(gastos)} style={{ width: "100%", padding: "10px", borderRadius: 10, border: `1px solid ${border}`, background: "none", color: text, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>📥 Baixar planilha</button>
            </div>
            <div style={{ background: card, border: "1px solid #4a1a1a", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: "#f87171" }}>🗑️ Apagar tudo</div>
              <div style={{ fontSize: 12, color: muted, marginBottom: 10 }}>Remove todos os gastos permanentemente</div>
              <button onClick={async () => { if (window.confirm("Tem certeza? Isso apaga TODOS os gastos!")) { await removeGastos(gastos.map(g => g.id)); } }} style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1px solid #7f2a2a", background: dark ? "#3a1a1a" : "#fff0f0", color: "#f87171", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Apagar todos os gastos</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
