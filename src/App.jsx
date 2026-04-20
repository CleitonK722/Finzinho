import { useState, useEffect, useRef } from "react";

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

const STORAGE_KEY = "finzinho-gastos-v2";

function formatCurrency(val) {
  return Number(val).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

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
  const descricao = text
    .replace(/r?\$?\s?\d+(?:[.,]\d{1,2})?/i, "")
    .replace(/gastei|comprei|paguei|no|na|em|de|com|reais|real/gi, " ")
    .replace(/\s+/g, " ").trim() || "Gasto";
  const categoria = detectCategory(text);
  return { valor, descricao: descricao.charAt(0).toUpperCase() + descricao.slice(1), categoria };
}

export default function App() {
  const [gastos, setGastos] = useState([]);
  const [view, setView] = useState("chat");
  const [messages, setMessages] = useState([
    { role: "bot", text: "Oi! Sou o Finzinho 🐟\nMe diz o que você gastou!\n\nExemplos:\n• 'gastei 45 no mercado'\n• 'uber 18,50'\n• 'almoço 32 reais'" }
  ]);
  const [input, setInput] = useState("");
  const [form, setForm] = useState({ descricao: "", valor: "", categoria: "alimentacao" });
  const [filterCat, setFilterCat] = useState("todas");
  const [pendente, setPendente] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) setGastos(JSON.parse(saved)); } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(gastos)); } catch {}
  }, [gastos]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const addGasto = (g) => { const novo = { ...g, id: Date.now(), data: new Date().toISOString() }; setGastos(prev => [novo, ...prev]); return novo; };
  const removeGasto = (id) => setGastos(prev => prev.filter(g => g.id !== id));

  const handleSend = (overrideInput) => {
    const text = (overrideInput !== undefined ? overrideInput : input).trim();
    if (!text) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", text }]);

    if (pendente) {
      const lower = text.toLowerCase();
      if (["sim","s","yes","confirma","ok","pode","isso"].some(w => lower.includes(w))) {
        const novo = addGasto(pendente);
        setPendente(null);
        setMessages(prev => [...prev, { role: "bot", text: `✅ Anotado!\n${CATEGORIES[novo.categoria].emoji} ${novo.descricao}\n${formatCurrency(novo.valor)}`, gasto: novo }]);
      } else if (["não","nao","n","no","cancela"].some(w => lower.includes(w))) {
        setPendente(null);
        setMessages(prev => [...prev, { role: "bot", text: "Ok, cancelei! Me manda de novo 😊" }]);
      } else {
        setMessages(prev => [...prev, { role: "bot", text: "Responde sim ou não para confirmar 👆" }]);
      }
      return;
    }

    const resultado = parseGasto(text);
    if (!resultado) {
      setMessages(prev => [...prev, { role: "bot", text: "Não consegui identificar o valor 🤔\nTente assim:\n• 'gastei 50 no mercado'\n• 'uber 18,50'\n• 'pizza 45 reais'" }]);
      return;
    }

    const cat = CATEGORIES[resultado.categoria];
    setPendente(resultado);
    setMessages(prev => [...prev, { role: "bot", text: `Entendi! Confirma?\n\n${cat.emoji} ${resultado.descricao}\n💰 ${formatCurrency(resultado.valor)}\n📂 ${cat.label}\n\nResponde sim ou não`, confirmando: true }]);
  };

  const handleFormSubmit = () => {
    if (!form.descricao || !form.valor) return;
    const novo = addGasto({ ...form, valor: parseFloat(form.valor.replace(",", ".")) });
    setForm({ descricao: "", valor: "", categoria: "alimentacao" });
    setMessages(prev => [...prev, { role: "bot", text: `✅ Adicionado!\n${CATEGORIES[novo.categoria].emoji} ${novo.descricao}\n${formatCurrency(novo.valor)}`, gasto: novo }]);
    setView("chat");
  };

  const totalGeral = gastos.reduce((s, g) => s + g.valor, 0);
  const porCategoria = Object.entries(CATEGORIES).map(([key, cat]) => ({ key, ...cat, total: gastos.filter(g => g.categoria === key).reduce((s, g) => s + g.valor, 0) })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);
  const gastosFiltrados = filterCat === "todas" ? gastos : gastos.filter(g => g.categoria === filterCat);

  const inp = { flex: 1, background: "#1a1a24", border: "1px solid #2a2a38", borderRadius: 12, padding: "10px 14px", color: "#e8e8f0", fontSize: 14, fontFamily: "'DM Sans'", outline: "none", width: "100%", boxSizing: "border-box" };

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: "#0f0f13", minHeight: "100vh", color: "#e8e8f0", display: "flex", flexDirection: "column" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <div style={{ padding: "14px 20px", borderBottom: "1px solid #1e1e2e", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0f0f13", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>🐟</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Finzinho</div>
            <div style={{ fontSize: 11, color: "#555", fontFamily: "'DM Mono'" }}>controle de gastos</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "#444", fontFamily: "'DM Mono'", marginBottom: 2 }}>TOTAL</div>
          <div style={{ fontFamily: "'DM Mono'", fontSize: 15, color: "#a0e9c0", fontWeight: 500 }}>{formatCurrency(totalGeral)}</div>
        </div>
      </div>

      <div style={{ display: "flex", borderBottom: "1px solid #1e1e2e" }}>
        {[["chat","💬 Chat"],["tabela","📊 Gastos"],["form","➕ Adicionar"]].map(([key, label]) => (
          <button key={key} onClick={() => setView(key)} style={{ flex: 1, padding: "10px 0", border: "none", background: "none", color: view === key ? "#a0e9c0" : "#555", fontFamily: "'DM Sans'", fontSize: 13, fontWeight: view === key ? 600 : 400, cursor: "pointer", borderBottom: view === key ? "2px solid #a0e9c0" : "2px solid transparent", transition: "all 0.2s" }}>{label}</button>
        ))}
      </div>

      {view === "chat" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 108px)" }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 10 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth: "82%", background: msg.role === "user" ? "#1e3a5f" : msg.confirmando ? "#1a2a1a" : "#1a1a24", border: `1px solid ${msg.role === "user" ? "#2a4a7f" : msg.confirmando ? "#2a4a2a" : "#2a2a38"}`, borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", padding: "10px 14px", fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-line" }}>
                  {msg.text}
                  {msg.gasto && (
                    <div style={{ marginTop: 8, padding: "6px 10px", background: "#0f1f0f", border: "1px solid #1a3a1a", borderRadius: 8, fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                      <span>{CATEGORIES[msg.gasto.categoria]?.emoji}</span>
                      <span style={{ color: "#a0e9c0", fontFamily: "'DM Mono'" }}>{formatCurrency(msg.gasto.valor)}</span>
                      <span style={{ color: "#666" }}>·</span>
                      <span style={{ color: "#888" }}>{msg.gasto.descricao}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {pendente && (
            <div style={{ padding: "0 16px 8px", display: "flex", gap: 8 }}>
              <button onClick={() => handleSend("sim")} style={{ flex: 1, padding: "8px", borderRadius: 10, border: "1px solid #2a4a2a", background: "#1a3a1a", color: "#a0e9c0", fontFamily: "'DM Sans'", fontSize: 13, cursor: "pointer" }}>✅ Sim</button>
              <button onClick={() => handleSend("não")} style={{ flex: 1, padding: "8px", borderRadius: 10, border: "1px solid #4a2a2a", background: "#3a1a1a", color: "#f87171", fontFamily: "'DM Sans'", fontSize: 13, cursor: "pointer" }}>❌ Não</button>
            </div>
          )}

          <div style={{ padding: "10px 16px 14px", borderTop: "1px solid #1e1e2e", display: "flex", gap: 8 }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSend()} placeholder={pendente ? "sim ou não..." : "Ex: gastei 45 no mercado..."} style={inp} />
            <button onClick={() => handleSend()} disabled={!input.trim()} style={{ background: "#a0e9c0", color: "#0f1f0f", border: "none", borderRadius: 12, padding: "10px 16px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "'DM Sans'", opacity: !input.trim() ? 0.4 : 1 }}>Enviar</button>
          </div>
        </div>
      )}

      {view === "tabela" && (
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {porCategoria.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "#444", fontFamily: "'DM Mono'", marginBottom: 8 }}>RESUMO POR CATEGORIA</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {porCategoria.map(cat => (
                  <div key={cat.key} style={{ background: "#1a1a24", border: `1px solid ${cat.color}33`, borderRadius: 10, padding: "8px 12px", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                    <span>{cat.emoji}</span><span style={{ color: "#aaa" }}>{cat.label}</span>
                    <span style={{ fontFamily: "'DM Mono'", color: cat.color, fontSize: 12 }}>{formatCurrency(cat.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            {[["todas","Todas","#a0e9c0"], ...Object.entries(CATEGORIES).map(([k,c]) => [k,`${c.emoji} ${c.label}`,c.color])].map(([key, label, color]) => (
              <button key={key} onClick={() => setFilterCat(key)} style={{ padding: "5px 12px", borderRadius: 20, border: "1px solid", borderColor: filterCat === key ? color : "#2a2a38", background: filterCat === key ? color+"22" : "none", color: filterCat === key ? color : "#555", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans'" }}>{label}</button>
            ))}
          </div>

          {gastosFiltrados.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#333", fontSize: 14 }}>Nenhum gasto ainda 🐟<br /><span style={{ fontSize: 12, color: "#2a2a2a" }}>Use o chat ou o formulário!</span></div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {gastosFiltrados.map(g => {
                const cat = CATEGORIES[g.categoria] || CATEGORIES.outros;
                return (
                  <div key={g.id} style={{ background: "#1a1a24", border: "1px solid #2a2a38", borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: cat.color+"22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{cat.emoji}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.descricao}</div>
                      <div style={{ fontSize: 11, color: "#444", marginTop: 2 }}>{cat.label} · {formatDate(g.data)}</div>
                    </div>
                    <div style={{ fontFamily: "'DM Mono'", fontSize: 14, color: cat.color, flexShrink: 0 }}>{formatCurrency(g.valor)}</div>
                    <button onClick={() => removeGasto(g.id)} style={{ background: "none", border: "none", color: "#333", cursor: "pointer", fontSize: 16, padding: "0 4px", flexShrink: 0 }}>✕</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {view === "form" && (
        <div style={{ flex: 1, padding: 16, maxWidth: 480 }}>
          <div style={{ fontSize: 11, color: "#444", fontFamily: "'DM Mono'", marginBottom: 16 }}>ADICIONAR GASTO</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: "#777", display: "block", marginBottom: 6 }}>Descrição</label>
              <input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Ex: Almoço no restaurante" style={inp} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#777", display: "block", marginBottom: 6 }}>Valor (R$)</label>
              <input value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} placeholder="0,00" type="number" min="0" step="0.01" style={{ ...inp, fontFamily: "'DM Mono'" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "#777", display: "block", marginBottom: 8 }}>Categoria</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {Object.entries(CATEGORIES).map(([key, cat]) => (
                  <button key={key} onClick={() => setForm(f => ({ ...f, categoria: key }))} style={{ padding: "7px 12px", borderRadius: 20, border: "1px solid", borderColor: form.categoria === key ? cat.color : "#2a2a38", background: form.categoria === key ? cat.color+"22" : "none", color: form.categoria === key ? cat.color : "#555", fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans'" }}>{cat.emoji} {cat.label}</button>
                ))}
              </div>
            </div>
            <button onClick={handleFormSubmit} disabled={!form.descricao || !form.valor} style={{ background: "#a0e9c0", color: "#0f1f0f", border: "none", borderRadius: 12, padding: "12px", fontWeight: 600, fontSize: 15, cursor: "pointer", fontFamily: "'DM Sans'", marginTop: 8, opacity: !form.descricao || !form.valor ? 0.4 : 1 }}>Adicionar gasto</button>
          </div>
        </div>
      )}
    </div>
  );
}
