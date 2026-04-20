import { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, orderBy, where } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from "firebase/auth";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyADHYjRMDYsXT2gXkNwR3VzEpc8oOr3o04",
  authDomain: "finanzinho-2966b.firebaseapp.com",
  projectId: "finanzinho-2966b",
  storageBucket: "finanzinho-2966b.firebasestorage.app",
  messagingSenderId: "542269306227",
  appId: "1:542269306227:web:56f00e4e8ef107a15b4106",
};

const GEMINI_KEY = "AIzaSyDttpVWDnrB2lTVbgsKdS0fwst2FwQ7i70";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

const CONFIG_KEY = "finzinho-config-v3";
const FIXOS_KEY = "finzinho-fixos-v1";

const CATEGORIES = {
  alimentacao: { label: "Alimentação", emoji: "🍽️", color: "#f97316", keywords: ["mercado","supermercado","restaurante","lanche","almoço","jantar","café","padaria","pizza","ifood","rappi","delivery","feira","comida","refeição","hamburguer","sushi"] },
  transporte: { label: "Transporte", emoji: "🚗", color: "#3b82f6", keywords: ["uber","99","taxi","ônibus","metrô","combustível","gasolina","etanol","estacionamento","pedágio","moto","bicicleta","passagem"] },
  saude: { label: "Saúde", emoji: "💊", color: "#10b981", keywords: ["farmácia","remédio","médico","consulta","dentista","hospital","exame","academia","psicólogo","fisioterapia","clínica"] },
  lazer: { label: "Lazer", emoji: "🎬", color: "#a855f7", keywords: ["cinema","show","teatro","netflix","spotify","youtube","jogo","viagem","hotel","passeio","bar","balada","festa","ingresso"] },
  moradia: { label: "Moradia", emoji: "🏠", color: "#f59e0b", keywords: ["aluguel","condomínio","luz","energia","água","internet","gás","conta","iptu","seguro","manutenção","reforma","móvel"] },
  educacao: { label: "Educação", emoji: "📚", color: "#06b6d4", keywords: ["escola","faculdade","curso","livro","material","mensalidade","aula","treinamento","workshop","certificado"] },
  roupas: { label: "Roupas", emoji: "👕", color: "#ec4899", keywords: ["roupa","sapato","tênis","camisa","calça","vestido","blusa","jaqueta","moda","loja","shein","renner"] },
  outros: { label: "Outros", emoji: "📦", color: "#6b7280", keywords: [] },
};

const EXEMPLOS = ["gastei 45 no mercado","uber 18,50","almoço 32 reais","farmácia 27,90","netflix 45","conta de luz 180"];
const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

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

async function askGemini(prompt, gastos, totalMes, config) {
  const resumo = `Dados do usuário: ${gastos.length} gastos registrados. Total do mês: ${formatCurrency(totalMes)}. ${config.meta > 0 ? `Meta mensal: ${formatCurrency(config.meta)}.` : ""} Últimos gastos: ${gastos.slice(0, 5).map(g => `${g.descricao} (${formatCurrency(g.valor)})`).join(", ")}.`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Você é o Finzinho, um assistente simpático de controle de gastos pessoais. Responda em português brasileiro, de forma curta e amigável. Use emojis com moderação. ${resumo}\n\nPergunta do usuário: ${prompt}` }] }]
    })
  });
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "Desculpe, não consegui responder agora 😅";
}

// Tela de Login
function LoginScreen({ dark }) {
  const [modo, setModo] = useState("opcoes"); // opcoes | email-login | email-cadastro
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  const bg = dark ? "#0f0f13" : "#f5f5f0";
  const card = dark ? "#1a1a24" : "#ffffff";
  const border = dark ? "#2a2a38" : "#e0e0e0";
  const text = dark ? "#e8e8f0" : "#1a1a24";
  const muted = dark ? "#666" : "#999";

  const handleGoogle = async () => {
    setLoading(true); setErro("");
    try { await signInWithPopup(auth, googleProvider); } catch (e) { setErro("Erro ao entrar com Google"); setLoading(false); }
  };

  const handleEmailLogin = async () => {
    setLoading(true); setErro("");
    try { await signInWithEmailAndPassword(auth, email, senha); } catch (e) { setErro("Email ou senha incorretos"); setLoading(false); }
  };

  const handleEmailCadastro = async () => {
    if (!nome.trim()) { setErro("Digite seu nome"); return; }
    setLoading(true); setErro("");
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, senha);
      await updateProfile(cred.user, { displayName: nome });
    } catch (e) {
      if (e.code === "auth/email-already-in-use") setErro("Email já cadastrado");
      else if (e.code === "auth/weak-password") setErro("Senha deve ter pelo menos 6 caracteres");
      else setErro("Erro ao criar conta");
      setLoading(false);
    }
  };

  const inp = { background: dark ? "#0f0f13" : "#f5f5f0", border: `1px solid ${border}`, borderRadius: 10, padding: "11px 14px", color: text, fontSize: 14, fontFamily: "'DM Sans'", outline: "none", width: "100%", boxSizing: "border-box" };

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 56, marginBottom: 10 }}>🐟</div>
          <div style={{ fontWeight: 600, fontSize: 24, color: text }}>Finzinho</div>
          <div style={{ fontSize: 12, color: muted, fontFamily: "'DM Mono'", marginTop: 4 }}>controle de gastos pessoal</div>
        </div>

        <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 20, padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
          {modo === "opcoes" && (
            <>
              <button onClick={handleGoogle} disabled={loading} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, background: "#fff", border: "1px solid #e0e0e0", borderRadius: 12, padding: "13px", fontWeight: 600, fontSize: 15, cursor: "pointer", color: "#333", boxShadow: "0 2px 6px rgba(0,0,0,0.08)" }}>
                <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                {loading ? "Entrando..." : "Entrar com Google"}
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, height: 1, background: border }} />
                <span style={{ fontSize: 12, color: muted }}>ou</span>
                <div style={{ flex: 1, height: 1, background: border }} />
              </div>
              <button onClick={() => setModo("email-login")} style={{ padding: "12px", borderRadius: 12, border: `1px solid ${border}`, background: "none", color: text, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>📧 Entrar com email</button>
              <button onClick={() => setModo("email-cadastro")} style={{ padding: "12px", borderRadius: 12, border: "none", background: "#a0e9c0", color: "#0f1f0f", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>✨ Criar conta</button>
            </>
          )}

          {modo === "email-login" && (
            <>
              <div style={{ fontSize: 15, fontWeight: 600, color: text, marginBottom: 4 }}>Entrar com email</div>
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" style={inp} />
              <input value={senha} onChange={e => setSenha(e.target.value)} placeholder="Senha" type="password" onKeyDown={e => e.key === "Enter" && handleEmailLogin()} style={inp} />
              {erro && <div style={{ fontSize: 12, color: "#f87171" }}>{erro}</div>}
              <button onClick={handleEmailLogin} disabled={loading || !email || !senha} style={{ padding: "12px", borderRadius: 12, border: "none", background: "#a0e9c0", color: "#0f1f0f", fontWeight: 600, fontSize: 14, cursor: "pointer", opacity: !email || !senha ? 0.5 : 1 }}>{loading ? "Entrando..." : "Entrar"}</button>
              <button onClick={() => { setModo("opcoes"); setErro(""); }} style={{ padding: "10px", borderRadius: 12, border: `1px solid ${border}`, background: "none", color: muted, fontSize: 13, cursor: "pointer" }}>← Voltar</button>
            </>
          )}

          {modo === "email-cadastro" && (
            <>
              <div style={{ fontSize: 15, fontWeight: 600, color: text, marginBottom: 4 }}>Criar conta</div>
              <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Seu nome" style={inp} />
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" style={inp} />
              <input value={senha} onChange={e => setSenha(e.target.value)} placeholder="Senha (mín. 6 caracteres)" type="password" style={inp} />
              {erro && <div style={{ fontSize: 12, color: "#f87171" }}>{erro}</div>}
              <button onClick={handleEmailCadastro} disabled={loading || !email || !senha || !nome} style={{ padding: "12px", borderRadius: 12, border: "none", background: "#a0e9c0", color: "#0f1f0f", fontWeight: 600, fontSize: 14, cursor: "pointer", opacity: !email || !senha || !nome ? 0.5 : 1 }}>{loading ? "Criando..." : "Criar conta"}</button>
              <button onClick={() => { setModo("opcoes"); setErro(""); }} style={{ padding: "10px", borderRadius: 12, border: `1px solid ${border}`, background: "none", color: muted, fontSize: 13, cursor: "pointer" }}>← Voltar</button>
            </>
          )}
        </div>
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: muted }}>Seus dados ficam salvos na nuvem ☁️</div>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checando, setChecando] = useState(true);
  const [dark, setDark] = useState(true);
  const [gastos, setGastos] = useState([]);
  const [fixos, setFixos] = useState([]);
  const [config, setConfig] = useState({ meta: 0 });
  const [carregando, setCarregando] = useState(false);
  const [view, setView] = useState("chat");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState({ descricao: "", valor: "", categoria: "alimentacao" });
  const [fixoForm, setFixoForm] = useState({ descricao: "", valor: "", categoria: "moradia" });
  const [filterCat, setFilterCat] = useState("todas");
  const [pendente, setPendente] = useState(null);
  const [selecionados, setSelecionados] = useState([]);
  const [exemploIdx, setExemploIdx] = useState(0);
  const [editando, setEditando] = useState(null);
  const [metaInput, setMetaInput] = useState("");
  const [subView, setSubView] = useState("lista");
  const [aiLoading, setAiLoading] = useState(false);
  // Perfil
  const [editandoPerfil, setEditandoPerfil] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const fotoInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  const bg = dark ? "#0f0f13" : "#f5f5f0";
  const card = dark ? "#1a1a24" : "#ffffff";
  const border = dark ? "#2a2a38" : "#e0e0e0";
  const text = dark ? "#e8e8f0" : "#1a1a24";
  const muted = dark ? "#555" : "#999";
  const subtle = dark ? "#444" : "#bbb";

  useEffect(() => { const unsub = onAuthStateChanged(auth, u => { setUser(u); setChecando(false); if (u) setNovoNome(u.displayName || ""); }); return unsub; }, []);

  useEffect(() => {
    if (!user) return;
    carregarGastos();
    try { const s = localStorage.getItem(CONFIG_KEY + user.uid); if (s) { const c = JSON.parse(s); setConfig(c); setMetaInput(c.meta > 0 ? c.meta.toString() : ""); } } catch {}
    try { const s = localStorage.getItem(FIXOS_KEY + user.uid); if (s) setFixos(JSON.parse(s)); } catch {}
    const interval = setInterval(() => setExemploIdx(i => (i + 1) % EXEMPLOS.length), 3000);
    return () => clearInterval(interval);
  }, [user]);

  const carregarGastos = async () => {
    setCarregando(true);
    try {
      const q = query(collection(db, "gastos"), where("uid", "==", user.uid), orderBy("data", "desc"));
      const snap = await getDocs(q);
      setGastos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setCarregando(false);
  };

  useEffect(() => { if (user) try { localStorage.setItem(CONFIG_KEY + user.uid, JSON.stringify(config)); } catch {} }, [config, user]);
  useEffect(() => { if (user) try { localStorage.setItem(FIXOS_KEY + user.uid, JSON.stringify(fixos)); } catch {} }, [fixos, user]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const addGasto = async (g) => {
    const novo = { ...g, uid: user.uid, data: new Date().toISOString() };
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

  const salvarPerfil = async () => {
    if (!novoNome.trim()) return;
    await updateProfile(auth.currentUser, { displayName: novoNome });
    setUser({ ...user, displayName: novoNome });
    setEditandoPerfil(false);
  };

  const handleFotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingFoto(true);
    try {
      const storageRef = ref(storage, `fotos/${user.uid}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await updateProfile(auth.currentUser, { photoURL: url });
      setUser({ ...user, photoURL: url });
    } catch (e) { console.error(e); }
    setUploadingFoto(false);
  };

  const toggleSelecionado = (id) => setSelecionados(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  const aplicarFixosDoMes = async () => {
    const mes = getMesAtual();
    const jaAplicados = gastos.filter(g => g.fixoMes === mes).map(g => g.fixoId);
    const novos = fixos.filter(f => !jaAplicados.includes(f.id));
    for (const f of novos) await addGasto({ ...f, fixoId: f.id, fixoMes: mes });
    return novos.length;
  };

  const handleSend = async (overrideInput) => {
    const text = (overrideInput !== undefined ? overrideInput : input).trim();
    if (!text || aiLoading) return;
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

    // Tenta detectar gasto primeiro
    const resultado = parseGasto(text);
    if (resultado && text.match(/\d/)) {
      const cat = CATEGORIES[resultado.categoria];
      setPendente(resultado);
      setMessages(prev => [...prev, { role: "bot", text: `Confirma?\n\n${cat.emoji} ${resultado.descricao}\n💰 ${formatCurrency(resultado.valor)}\n📂 ${cat.label}`, confirmando: true }]);
      return;
    }

    // Usa IA para outras perguntas
    setAiLoading(true);
    setMessages(prev => [...prev, { role: "bot", text: "...", loading: true }]);
    try {
      const resposta = await askGemini(text, gastos, totalMes, config);
      setMessages(prev => [...prev.filter(m => !m.loading), { role: "bot", text: resposta }]);
    } catch {
      setMessages(prev => [...prev.filter(m => !m.loading), { role: "bot", text: "Ops, tive um problema! Tente de novo 😅" }]);
    }
    setAiLoading(false);
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
  const pctMeta = config.meta > 0 ? Math.min((totalMes / config.meta) * 100, 100) : 0;
  const corMeta = pctMeta > 90 ? "#f87171" : pctMeta > 70 ? "#f59e0b" : "#a0e9c0";
  const porCategoria = Object.entries(CATEGORIES).map(([key, cat]) => ({ key, ...cat, total: gastos.filter(g => g.categoria === key).reduce((s, g) => s + g.valor, 0) })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);
  const porMes = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setMonth(d.getMonth() - (5 - i)); const mes = d.getMonth(); const ano = d.getFullYear(); return { label: MESES[mes], total: gastos.filter(g => { const gd = new Date(g.data); return gd.getMonth() === mes && gd.getFullYear() === ano; }).reduce((s, g) => s + g.valor, 0) }; });
  const maxMes = Math.max(...porMes.map(m => m.total), 1);
  const gastosBuscados = gastos.filter(g => (!busca || g.descricao.toLowerCase().includes(busca.toLowerCase())) && (filterCat === "todas" || g.categoria === filterCat));
  const maiorGasto = gastos.length > 0 ? gastos.reduce((a, b) => a.valor > b.valor ? a : b) : null;
  const catMaisGasta = porCategoria.length > 0 ? porCategoria[0] : null;

  const inp = { background: card, border: `1px solid ${border}`, borderRadius: 10, padding: "10px 14px", color: text, fontSize: 14, fontFamily: "'DM Sans'", outline: "none", width: "100%", boxSizing: "border-box" };

  if (checando) return <div style={{ background: "#0f0f13", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 }}>🐟</div>;
  if (!user) return <LoginScreen dark={dark} />;

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: bg, minHeight: "100vh", color: text, display: "flex", flexDirection: "column" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <input type="file" accept="image/*" ref={fotoInputRef} style={{ display: "none" }} onChange={handleFotoUpload} />

      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: bg, position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>🐟</span>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Finzinho</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 9, color: subtle, fontFamily: "'DM Mono'" }}>MÊS ATUAL</div>
            <div style={{ fontFamily: "'DM Mono'", fontSize: 14, color: corMeta, fontWeight: 500 }}>{formatCurrency(totalMes)}</div>
          </div>
          <button onClick={() => setDark(d => !d)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 8, padding: "5px 8px", fontSize: 13, cursor: "pointer" }}>{dark ? "☀️" : "🌙"}</button>
          <div onClick={() => setView("perfil")} style={{ cursor: "pointer" }}>
            {user.photoURL ? <img src={user.photoURL} style={{ width: 32, height: 32, borderRadius: "50%", border: `2px solid ${view === "perfil" ? "#a0e9c0" : border}` }} /> : <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#a0e9c022", border: `2px solid ${view === "perfil" ? "#a0e9c0" : border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>👤</div>}
          </div>
        </div>
      </div>

      {config.meta > 0 && (
        <div style={{ padding: "5px 16px", borderBottom: `1px solid ${border}` }}>
          <div style={{ height: 3, background: dark ? "#1e1e2e" : "#eee", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pctMeta}%`, background: corMeta, borderRadius: 2, transition: "width 0.5s" }} />
          </div>
          <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>{pctMeta.toFixed(0)}% do limite · restam {formatCurrency(Math.max(config.meta - totalMes, 0))}</div>
        </div>
      )}

      <div style={{ display: "flex", borderBottom: `1px solid ${border}` }}>
        {[["chat","💬"],["historico","🕐"],["resumo","📊"],["form","➕"],["config","⚙️"]].map(([key, label]) => (
          <button key={key} onClick={() => { setView(key); setSelecionados([]); setEditando(null); }} style={{ flex: 1, padding: "10px 0", border: "none", background: "none", color: view === key ? "#a0e9c0" : muted, fontSize: 18, cursor: "pointer", borderBottom: view === key ? "2px solid #a0e9c0" : "2px solid transparent", transition: "all 0.2s" }}>{label}</button>
        ))}
      </div>

      {/* CHAT com IA */}
      {view === "chat" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 120px)" }}>
          {messages.length === 0 ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", gap: 10 }}>
              <div style={{ fontSize: 44 }}>🐟</div>
              <div style={{ fontSize: 17, fontWeight: 600 }}>Oi, {user.displayName?.split(" ")[0] || "você"}!</div>
              <div style={{ fontSize: 13, color: muted, lineHeight: 1.6 }}>Me diz o que gastou ou me faça<br />uma pergunta sobre seus gastos 🤖</div>
              <div style={{ padding: "8px 16px", background: card, border: `1px solid ${border}`, borderRadius: 20, fontSize: 13, color: muted, fontFamily: "'DM Mono'" }}>
                este mês: <span style={{ color: corMeta }}>{formatCurrency(totalMes)}</span>
              </div>
              {catMaisGasta && <div style={{ fontSize: 12, color: subtle }}>{catMaisGasta.emoji} Mais gasto em {catMaisGasta.label}</div>}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: 4 }}>
                {["Como estão meus gastos?","Onde gasto mais?","Dica para economizar"].map(s => (
                  <button key={s} onClick={() => handleSend(s)} style={{ padding: "6px 12px", borderRadius: 16, border: `1px solid ${border}`, background: card, color: muted, fontSize: 12, cursor: "pointer" }}>{s}</button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              {messages.map((msg, i) => (
                <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                  <div style={{ maxWidth: "82%", background: msg.role === "user" ? (dark ? "#1e3a5f" : "#e8f0ff") : msg.confirmando ? (dark ? "#1a2a1a" : "#f0fff4") : card, border: `1px solid ${msg.role === "user" ? (dark ? "#2a4a7f" : "#c0d0ff") : msg.confirmando ? (dark ? "#2a4a2a" : "#b0e0c0") : border}`, borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", padding: "10px 14px", fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-line", color: msg.loading ? muted : text }}>
                    {msg.loading ? "✨ Pensando..." : msg.text}
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
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSend()} placeholder={pendente ? "sim ou não..." : aiLoading ? "Aguarde..." : "Ex: " + EXEMPLOS[exemploIdx]} disabled={aiLoading} style={{ ...inp, flex: 1, opacity: aiLoading ? 0.6 : 1 }} />
            <button onClick={() => handleSend()} disabled={!input.trim() || aiLoading} style={{ background: "#a0e9c0", color: "#0f1f0f", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 600, fontSize: 14, cursor: "pointer", opacity: !input.trim() || aiLoading ? 0.4 : 1 }}>
              {aiLoading ? "..." : "Enviar"}
            </button>
          </div>
          <div style={{ padding: "4px 16px 10px", fontSize: 11, color: subtle, textAlign: "center" }}>🤖 Com IA · Digite gastos ou faça perguntas</div>
        </div>
      )}

      {/* PERFIL */}
      {view === "perfil" && (
        <div style={{ flex: 1, overflowY: "auto", padding: 16, maxWidth: 480 }}>
          <div style={{ fontSize: 11, color: subtle, fontFamily: "'DM Mono'", marginBottom: 16 }}>MEU PERFIL</div>
          <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 16, marginBottom: 16 }}>
            <div style={{ position: "relative" }}>
              {user.photoURL ? <img src={user.photoURL} style={{ width: 80, height: 80, borderRadius: "50%", border: `3px solid #a0e9c0` }} /> : <div style={{ width: 80, height: 80, borderRadius: "50%", background: "#a0e9c022", border: `3px solid #a0e9c0`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>👤</div>}
              <button onClick={() => fotoInputRef.current?.click()} disabled={uploadingFoto} style={{ position: "absolute", bottom: 0, right: 0, background: "#a0e9c0", border: "none", borderRadius: "50%", width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 14 }}>
                {uploadingFoto ? "⏳" : "📷"}
              </button>
            </div>
            {!editandoPerfil ? (
              <>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>{user.displayName || "Sem nome"}</div>
                  <div style={{ fontSize: 13, color: muted, marginTop: 4 }}>{user.email}</div>
                </div>
                <button onClick={() => { setEditandoPerfil(true); setNovoNome(user.displayName || ""); }} style={{ padding: "8px 20px", borderRadius: 20, border: `1px solid ${border}`, background: "none", color: text, fontSize: 13, cursor: "pointer" }}>✏️ Editar nome</button>
              </>
            ) : (
              <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
                <input value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Seu nome" style={inp} autoFocus />
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={salvarPerfil} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "#a0e9c0", color: "#0f1f0f", fontWeight: 600, cursor: "pointer" }}>Salvar</button>
                  <button onClick={() => setEditandoPerfil(false)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1px solid ${border}`, background: "none", color: muted, cursor: "pointer" }}>Cancelar</button>
                </div>
              </div>
            )}
          </div>

          <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>📊 Meu resumo</div>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1, padding: "10px", background: bg, borderRadius: 10, textAlign: "center" }}>
                <div style={{ fontSize: 11, color: muted, marginBottom: 4 }}>Gastos</div>
                <div style={{ fontFamily: "'DM Mono'", fontSize: 16, color: "#a0e9c0" }}>{gastos.length}</div>
              </div>
              <div style={{ flex: 1, padding: "10px", background: bg, borderRadius: 10, textAlign: "center" }}>
                <div style={{ fontSize: 11, color: muted, marginBottom: 4 }}>Este mês</div>
                <div style={{ fontFamily: "'DM Mono'", fontSize: 13, color: corMeta }}>{formatCurrency(totalMes)}</div>
              </div>
              <div style={{ flex: 1, padding: "10px", background: bg, borderRadius: 10, textAlign: "center" }}>
                <div style={{ fontSize: 11, color: muted, marginBottom: 4 }}>Total</div>
                <div style={{ fontFamily: "'DM Mono'", fontSize: 13, color: "#a0e9c0" }}>{formatCurrency(totalGeral)}</div>
              </div>
            </div>
          </div>

          <button onClick={() => signOut(auth)} style={{ width: "100%", padding: "12px", borderRadius: 12, border: "1px solid #4a1a1a", background: dark ? "#3a1a1a" : "#fff0f0", color: "#f87171", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Sair da conta</button>
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
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="🔍 Buscar gasto..." style={{ ...inp, marginBottom: 10 }} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: subtle, fontFamily: "'DM Mono'" }}>{gastosBuscados.length} GASTOS</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {selecionados.length > 0 && <button onClick={() => { if (window.confirm(`Apagar ${selecionados.length}?`)) removeGastos(selecionados); }} style={{ background: dark ? "#3a1a1a" : "#fff0f0", border: "1px solid #7f2a2a", borderRadius: 8, padding: "5px 10px", color: "#f87171", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>🗑️ {selecionados.length}</button>}
                  <button onClick={() => exportarExcel(gastos)} style={{ background: "none", border: `1px solid ${border}`, borderRadius: 8, padding: "5px 10px", color: muted, fontSize: 12, cursor: "pointer" }}>📤 Excel</button>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                {[["todas","Todas","#a0e9c0"], ...Object.entries(CATEGORIES).map(([k,c]) => [k,`${c.emoji}`,c.color])].map(([key, label, color]) => (
                  <button key={key} onClick={() => setFilterCat(key)} style={{ padding: "4px 10px", borderRadius: 20, border: `1px solid ${filterCat === key ? color : border}`, background: filterCat === key ? color+"22" : "none", color: filterCat === key ? color : muted, fontSize: 12, cursor: "pointer" }}>{label}</button>
                ))}
              </div>
              {carregando ? <div style={{ textAlign: "center", padding: 40, color: muted }}>Carregando... ☁️</div> :
                gastosBuscados.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: subtle }}>Nenhum gasto 🐟</div> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {gastosBuscados.map(g => {
                    const cat = CATEGORIES[g.categoria] || CATEGORIES.outros;
                    const sel = selecionados.includes(g.id);
                    if (editando?.id === g.id) return (
                      <div key={g.id} style={{ background: card, border: `1px solid #a0e9c0`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                        <input value={editando.descricao} onChange={e => setEditando(ed => ({ ...ed, descricao: e.target.value }))} style={inp} />
                        <input value={editando.valor} onChange={e => setEditando(ed => ({ ...ed, valor: e.target.value }))} style={{ ...inp, fontFamily: "'DM Mono'" }} type="number" />
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {Object.entries(CATEGORIES).map(([key, c]) => <button key={key} onClick={() => setEditando(ed => ({ ...ed, categoria: key }))} style={{ padding: "5px 10px", borderRadius: 16, border: `1px solid ${editando.categoria === key ? c.color : border}`, background: editando.categoria === key ? c.color+"22" : "none", color: editando.categoria === key ? c.color : muted, fontSize: 12, cursor: "pointer" }}>{c.emoji}</button>)}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={salvarEdicao} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", background: "#a0e9c0", color: "#0f1f0f", fontWeight: 600, cursor: "pointer" }}>Salvar</button>
                          <button onClick={() => setEditando(null)} style={{ flex: 1, padding: "8px", borderRadius: 8, border: `1px solid ${border}`, background: "none", color: muted, cursor: "pointer" }}>Cancelar</button>
                        </div>
                      </div>
                    );
                    return (
                      <div key={g.id} style={{ background: sel ? (dark ? "#1a2a3a" : "#e8f0ff") : card, border: `1px solid ${sel ? "#2a4a7f" : border}`, borderRadius: 12, padding: "11px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                        <div onClick={() => toggleSelecionado(g.id)} style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${sel ? "#a0e9c0" : subtle}`, background: sel ? "#a0e9c0" : "none", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 11, cursor: "pointer", color: "#0f1f0f" }}>{sel ? "✓" : ""}</div>
                        <div style={{ width: 30, height: 30, borderRadius: 8, background: cat.color+"22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>{cat.emoji}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.descricao}</div>
                          <div style={{ fontSize: 10, color: subtle }}>{cat.label} · {formatDate(g.data)}</div>
                        </div>
                        <div style={{ fontFamily: "'DM Mono'", fontSize: 13, color: cat.color, flexShrink: 0 }}>{formatCurrency(g.valor)}</div>
                        <button onClick={() => setEditando({ ...g })} style={{ background: "none", border: "none", color: muted, cursor: "pointer", fontSize: 14 }}>✏️</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {subView === "fixos" && (
            <div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                <input value={fixoForm.descricao} onChange={e => setFixoForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Nome (ex: Aluguel)" style={inp} />
                <input value={fixoForm.valor} onChange={e => setFixoForm(f => ({ ...f, valor: e.target.value }))} placeholder="Valor" type="number" style={{ ...inp, fontFamily: "'DM Mono'" }} />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {Object.entries(CATEGORIES).map(([key, cat]) => <button key={key} onClick={() => setFixoForm(f => ({ ...f, categoria: key }))} style={{ padding: "5px 10px", borderRadius: 16, border: `1px solid ${fixoForm.categoria === key ? cat.color : border}`, background: fixoForm.categoria === key ? cat.color+"22" : "none", color: fixoForm.categoria === key ? cat.color : muted, fontSize: 12, cursor: "pointer" }}>{cat.emoji} {cat.label}</button>)}
                </div>
                <button onClick={handleFixoAdd} disabled={!fixoForm.descricao || !fixoForm.valor} style={{ padding: "10px", borderRadius: 10, border: "none", background: "#a0e9c0", color: "#0f1f0f", fontWeight: 600, cursor: "pointer", opacity: !fixoForm.descricao || !fixoForm.valor ? 0.4 : 1 }}>+ Adicionar fixo</button>
              </div>
              {fixos.length > 0 && <>
                <button onClick={async () => { const n = await aplicarFixosDoMes(); alert(n > 0 ? `${n} aplicado(s)!` : "Já aplicados!"); }} style={{ width: "100%", marginBottom: 10, padding: "10px", borderRadius: 10, border: `1px solid #a0e9c0`, background: "none", color: "#a0e9c0", fontWeight: 600, cursor: "pointer" }}>🔄 Aplicar fixos do mês</button>
                {fixos.map(f => { const cat = CATEGORIES[f.categoria] || CATEGORIES.outros; return (
                  <div key={f.id} style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, padding: "11px 12px", display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: cat.color+"22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>{cat.emoji}</div>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 500 }}>{f.descricao}</div><div style={{ fontSize: 10, color: subtle }}>{cat.label}</div></div>
                    <div style={{ fontFamily: "'DM Mono'", fontSize: 13, color: cat.color }}>{formatCurrency(f.valor)}</div>
                    <button onClick={() => setFixos(prev => prev.filter(x => x.id !== f.id))} style={{ background: "none", border: "none", color: subtle, cursor: "pointer" }}>✕</button>
                  </div>
                );})}
              </>}
            </div>
          )}
        </div>
      )}

      {/* RESUMO */}
      {view === "resumo" && (
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1, padding: "12px 14px", background: card, border: `1px solid ${border}`, borderRadius: 12 }}>
              <div style={{ fontSize: 10, color: subtle, fontFamily: "'DM Mono'", marginBottom: 4 }}>MÊS ATUAL</div>
              <div style={{ fontFamily: "'DM Mono'", fontSize: 17, color: corMeta, fontWeight: 500 }}>{formatCurrency(totalMes)}</div>
            </div>
            <div style={{ flex: 1, padding: "12px 14px", background: card, border: `1px solid ${border}`, borderRadius: 12 }}>
              <div style={{ fontSize: 10, color: subtle, fontFamily: "'DM Mono'", marginBottom: 4 }}>TOTAL GERAL</div>
              <div style={{ fontFamily: "'DM Mono'", fontSize: 17, color: "#a0e9c0", fontWeight: 500 }}>{formatCurrency(totalGeral)}</div>
            </div>
          </div>

          {maiorGasto && <div style={{ padding: "10px 14px", background: card, border: `1px solid ${border}`, borderRadius: 12, marginBottom: 12, fontSize: 13 }}><span style={{ color: muted }}>💸 Maior gasto: </span><span style={{ fontWeight: 500 }}>{maiorGasto.descricao}</span><span style={{ fontFamily: "'DM Mono'", color: "#f97316", marginLeft: 8 }}>{formatCurrency(maiorGasto.valor)}</span></div>}

          <div style={{ padding: "12px 14px", background: card, border: `1px solid ${border}`, borderRadius: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: subtle, fontFamily: "'DM Mono'", marginBottom: 12 }}>ÚLTIMOS 6 MESES</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
              {porMes.map((m, i) => {
                const h = m.total > 0 ? Math.max((m.total / maxMes) * 70, 4) : 4;
                const isAtual = i === 5;
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ fontSize: 9, color: muted }}>{m.total > 0 ? `${(m.total/1000).toFixed(1)}k` : ""}</div>
                    <div style={{ width: "100%", height: h, background: isAtual ? "#a0e9c0" : (dark ? "#2a2a38" : "#e0e0e0"), borderRadius: 4 }} />
                    <div style={{ fontSize: 10, color: isAtual ? "#a0e9c0" : muted }}>{m.label}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {config.meta > 0 && (
            <div style={{ padding: "12px 14px", background: card, border: `1px solid ${border}`, borderRadius: 12, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 13 }}>🎯 Meta</span>
                <span style={{ fontFamily: "'DM Mono'", fontSize: 13, color: corMeta }}>{formatCurrency(totalMes)} / {formatCurrency(config.meta)}</span>
              </div>
              <div style={{ height: 8, background: dark ? "#1e1e2e" : "#eee", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pctMeta}%`, background: corMeta, borderRadius: 4 }} />
              </div>
              <div style={{ fontSize: 11, color: muted, marginTop: 4 }}>{config.meta - totalMes > 0 ? `Restam ${formatCurrency(config.meta - totalMes)}` : `Excedido em ${formatCurrency(totalMes - config.meta)}`}</div>
            </div>
          )}

          <div style={{ fontSize: 11, color: subtle, fontFamily: "'DM Mono'", marginBottom: 10 }}>POR CATEGORIA</div>
          {porCategoria.map(cat => {
            const pct = totalGeral > 0 ? (cat.total / totalGeral) * 100 : 0;
            return (
              <div key={cat.key} style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span>{cat.emoji}</span><span style={{ fontSize: 13 }}>{cat.label}</span></div>
                  <span style={{ fontFamily: "'DM Mono'", fontSize: 13, color: cat.color }}>{formatCurrency(cat.total)}</span>
                </div>
                <div style={{ height: 4, background: dark ? "#0f0f13" : "#eee", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: cat.color, borderRadius: 2 }} />
                </div>
                <div style={{ fontSize: 10, color: subtle, marginTop: 3 }}>{pct.toFixed(1)}%</div>
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
                {Object.entries(CATEGORIES).map(([key, cat]) => <button key={key} onClick={() => setForm(f => ({ ...f, categoria: key }))} style={{ padding: "7px 12px", borderRadius: 20, border: `1px solid ${form.categoria === key ? cat.color : border}`, background: form.categoria === key ? cat.color+"22" : "none", color: form.categoria === key ? cat.color : muted, fontSize: 13, cursor: "pointer" }}>{cat.emoji} {cat.label}</button>)}
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
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>🎯 Meta mensal</div>
              <input value={metaInput} onChange={e => setMetaInput(e.target.value)} placeholder="Ex: 3000" type="number" style={{ ...inp, marginBottom: 10 }} />
              <button onClick={() => { const v = parseFloat(metaInput); setConfig(c => ({ ...c, meta: isNaN(v) ? 0 : v })); alert(v > 0 ? `Meta: ${formatCurrency(v)}` : "Meta removida!"); }} style={{ width: "100%", padding: "10px", borderRadius: 10, border: "none", background: "#a0e9c0", color: "#0f1f0f", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Salvar meta</button>
            </div>
            <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{dark ? "☀️" : "🌙"} Tema</div>
              <button onClick={() => setDark(d => !d)} style={{ width: "100%", padding: "10px", borderRadius: 10, border: `1px solid ${border}`, background: "none", color: text, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>{dark ? "☀️ Modo claro" : "🌙 Modo escuro"}</button>
            </div>
            <div style={{ background: card, border: `1px solid ${border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>📤 Exportar</div>
              <button onClick={() => exportarExcel(gastos)} style={{ width: "100%", padding: "10px", borderRadius: 10, border: `1px solid ${border}`, background: "none", color: text, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>📥 Baixar planilha</button>
            </div>
            <div style={{ background: card, border: "1px solid #4a1a1a", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: "#f87171" }}>🗑️ Apagar tudo</div>
              <button onClick={async () => { if (window.confirm("Apagar TODOS?")) await removeGastos(gastos.map(g => g.id)); }} style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1px solid #7f2a2a", background: dark ? "#3a1a1a" : "#fff0f0", color: "#f87171", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Apagar todos</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
