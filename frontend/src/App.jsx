import { useState, useEffect, useRef, useCallback } from "react";
import * as api from "./api";

// ── STYLES ────────────────────────────────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{
    --bg:#0d0f12;--surface:#13171d;--surface2:#1a1f28;--border:#2a303c;
    --accent:#f0b429;--accent2:#00c2a8;--danger:#e05252;--success:#48bb78;
    --text:#e2e8f0;--muted:#64748b;
    --mono:'IBM Plex Mono',monospace;--sans:'IBM Plex Sans',sans-serif;
    --sw:240px;--th:56px;--bh:64px;
  }
  html{font-size:16px}
  body{background:var(--bg);color:var(--text);font-family:var(--sans);min-height:100vh;overflow-x:hidden;-webkit-font-smoothing:antialiased}
  ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:var(--bg)}::-webkit-scrollbar-thumb{background:var(--border)}

  /* LOGIN */
  .login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);position:relative;overflow:hidden;padding:20px}
  .login-grid{position:absolute;inset:0;background-image:linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(90deg,var(--border) 1px,transparent 1px);background-size:48px 48px;opacity:.28}
  .login-card{position:relative;z-index:1;width:100%;max-width:420px;background:var(--surface);border:1px solid var(--border);padding:40px 32px}
  .login-logo{font-family:var(--mono);font-size:10px;letter-spacing:4px;text-transform:uppercase;color:var(--accent);margin-bottom:8px}
  .login-title{font-family:var(--mono);font-size:24px;font-weight:700;line-height:1.1;margin-bottom:4px}
  .login-sub{font-size:13px;color:var(--muted);margin-bottom:32px}
  .field-label{font-family:var(--mono);font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:8px;display:block}
  .field-wrap{margin-bottom:18px}
  .field-input{width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:var(--mono);font-size:16px;padding:13px 16px;outline:none;transition:border-color .2s;-webkit-appearance:none;border-radius:0}
  .field-input:focus{border-color:var(--accent)}
  .btn-primary{width:100%;background:var(--accent);color:#0d0f12;border:none;font-family:var(--mono);font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:15px;cursor:pointer;transition:opacity .2s;margin-top:8px;-webkit-tap-highlight-color:transparent;border-radius:0}
  .btn-primary:active{opacity:.75}.btn-primary:disabled{opacity:.4;cursor:not-allowed}
  .error-msg{background:rgba(224,82,82,.1);border:1px solid var(--danger);color:var(--danger);font-family:var(--mono);font-size:12px;padding:10px 14px;margin-bottom:18px}

  /* SHELL */
  .app-shell{display:flex;min-height:100vh}
  .sidebar{width:var(--sw);flex-shrink:0;background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:50;transition:transform .25s ease}
  .sidebar-brand{padding:22px 20px;border-bottom:1px solid var(--border)}
  .brand-tag{font-family:var(--mono);font-size:9px;letter-spacing:3px;color:var(--accent);text-transform:uppercase;margin-bottom:4px}
  .brand-name{font-family:var(--mono);font-size:16px;font-weight:700}
  .sidebar-nav{flex:1;padding:14px 0;overflow-y:auto}
  .nav-lbl{font-family:var(--mono);font-size:9px;letter-spacing:3px;text-transform:uppercase;color:var(--muted);padding:8px 20px 4px}
  .nav-item{display:flex;align-items:center;gap:12px;padding:11px 20px;cursor:pointer;color:var(--muted);font-size:13px;font-weight:500;border-left:2px solid transparent;transition:all .15s;user-select:none;-webkit-tap-highlight-color:transparent}
  .nav-item:hover{color:var(--text);background:var(--surface2)}.nav-item.active{color:var(--accent);border-left-color:var(--accent);background:rgba(240,180,41,.05)}
  .nav-icon{width:18px;text-align:center;font-size:15px}
  .sidebar-footer{padding:14px 20px;border-top:1px solid var(--border)}
  .user-chip{display:flex;align-items:center;gap:10px;margin-bottom:12px}
  .user-av{width:32px;height:32px;background:var(--accent);color:#0d0f12;font-family:var(--mono);font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .user-name{font-size:13px;font-weight:600;line-height:1.2}
  .user-role{font-family:var(--mono);font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px}
  .btn-logout{width:100%;background:transparent;border:1px solid var(--border);color:var(--muted);font-family:var(--mono);font-size:10px;letter-spacing:2px;text-transform:uppercase;padding:8px;cursor:pointer;transition:all .15s;border-radius:0}
  .btn-logout:hover{border-color:var(--danger);color:var(--danger)}
  .sidebar-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:40;backdrop-filter:blur(2px)}

  /* TOPBAR */
  .main-content{margin-left:var(--sw);flex:1;display:flex;flex-direction:column;min-width:0}
  .topbar{height:var(--th);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;padding:0 24px;background:var(--surface);position:sticky;top:0;z-index:30}
  .topbar-left{display:flex;align-items:center;gap:14px}
  .hamburger{display:none;background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;padding:4px;-webkit-tap-highlight-color:transparent;line-height:1}
  .topbar-title{font-family:var(--mono);font-size:13px;font-weight:600;letter-spacing:1px}
  .topbar-right{display:flex;align-items:center;gap:14px}
  .clock{font-family:var(--mono);font-size:12px;color:var(--muted)}
  .status-dot{width:6px;height:6px;border-radius:50%;background:var(--success);box-shadow:0 0 6px var(--success);flex-shrink:0}

  /* PAGE */
  .page-body{padding:24px;flex:1}
  .page-header{margin-bottom:24px}
  .page-title{font-family:var(--mono);font-size:18px;font-weight:700;margin-bottom:4px}
  .page-desc{font-size:13px;color:var(--muted)}

  /* STATS */
  .stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
  .stat-card{background:var(--surface);border:1px solid var(--border);padding:18px 16px;position:relative;overflow:hidden}
  .stat-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px}
  .stat-card.yellow::before{background:var(--accent)}.stat-card.teal::before{background:var(--accent2)}
  .stat-card.red::before{background:var(--danger)}.stat-card.green::before{background:var(--success)}
  .stat-label{font-family:var(--mono);font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:8px}
  .stat-value{font-family:var(--mono);font-size:28px;font-weight:700;line-height:1;margin-bottom:4px}
  .stat-sub{font-size:11px;color:var(--muted)}

  /* CARD */
  .card{background:var(--surface);border:1px solid var(--border);margin-bottom:18px}
  .card-header{padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}
  .card-title{font-family:var(--mono);font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase}
  .card-body{padding:18px}

  /* TABLE */
  .table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
  .data-table{width:100%;border-collapse:collapse;min-width:500px}
  .data-table th{font-family:var(--mono);font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);text-align:left;padding:10px 14px;border-bottom:1px solid var(--border);white-space:nowrap}
  .data-table td{font-size:13px;padding:11px 14px;border-bottom:1px solid rgba(42,48,60,.5);vertical-align:middle}
  .data-table tr:last-child td{border-bottom:none}.data-table tr:hover td{background:var(--surface2)}
  .mono{font-family:var(--mono);font-size:12px}
  .badge{display:inline-block;font-family:var(--mono);font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;padding:3px 9px}
  .badge-in{background:rgba(72,187,120,.15);color:var(--success);border:1px solid rgba(72,187,120,.3)}
  .badge-out{background:rgba(224,82,82,.15);color:var(--danger);border:1px solid rgba(224,82,82,.3)}
  .cat-badge{display:inline-block;font-family:var(--mono);font-size:10px;font-weight:600;padding:2px 8px;letter-spacing:.5px}

  /* MOB CARDS */
  .mob-list{display:none}
  .mob-card{padding:14px 16px;border-bottom:1px solid var(--border);display:grid;grid-template-columns:1fr auto;gap:3px 12px;align-items:start}
  .mob-card:last-child{border-bottom:none}
  .mob-code{font-family:var(--mono);font-size:13px;font-weight:700;color:var(--accent)}
  .mob-desc{font-size:13px;grid-column:1}
  .mob-meta{font-family:var(--mono);font-size:11px;color:var(--muted);grid-column:1;margin-top:2px}
  .mob-right{grid-column:2;grid-row:1/4;display:flex;flex-direction:column;align-items:flex-end;gap:6px}
  .mob-qty{font-family:var(--mono);font-size:20px;font-weight:700;line-height:1}

  /* FORM */
  .mov-input{background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:var(--mono);font-size:16px;padding:12px 14px;outline:none;width:100%;transition:border-color .2s;-webkit-appearance:none;border-radius:0}
  .mov-input:focus{border-color:var(--accent)}
  .btn-in{background:var(--success);color:#0d0f12;border:none;font-family:var(--mono);font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:14px 20px;cursor:pointer;transition:opacity .15s;border-radius:0;-webkit-tap-highlight-color:transparent}
  .btn-in:active{opacity:.75}.btn-in:disabled{opacity:.4;cursor:not-allowed}
  .btn-out{background:var(--danger);color:#fff;border:none;font-family:var(--mono);font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:14px 20px;cursor:pointer;transition:opacity .15s;border-radius:0;-webkit-tap-highlight-color:transparent}
  .btn-out:active{opacity:.75}.btn-out:disabled{opacity:.4;cursor:not-allowed}

  /* CATEGORY DROPDOWN */
  .cat-wrap{position:relative;width:100%}
  .cat-trigger{width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:var(--mono);font-size:14px;padding:12px 40px 12px 14px;outline:none;cursor:pointer;text-align:left;transition:border-color .2s;display:flex;align-items:center;justify-content:space-between;-webkit-tap-highlight-color:transparent;border-radius:0}
  .cat-trigger.open,.cat-trigger:focus{border-color:var(--accent)}
  .cat-ph{color:var(--muted)}
  .cat-arrow{position:absolute;right:14px;top:50%;transform:translateY(-50%);font-size:10px;color:var(--muted);pointer-events:none;transition:transform .2s}
  .cat-arrow.open{transform:translateY(-50%) rotate(180deg)}
  .cat-panel{position:absolute;top:calc(100% + 2px);left:0;right:0;background:var(--surface);border:1px solid var(--accent);z-index:100;max-height:300px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,.4)}
  .cat-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:1px;background:var(--border)}
  .cat-opt{background:var(--surface2);padding:12px 14px;font-family:var(--mono);font-size:12px;color:var(--muted);cursor:pointer;transition:all .12s;display:flex;align-items:center;gap:8px;-webkit-tap-highlight-color:transparent;user-select:none}
  .cat-opt:hover{background:var(--surface);color:var(--text)}.cat-opt.sel{color:var(--accent);background:rgba(240,180,41,.06)}
  .cat-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
  .cat-add-row{padding:10px 14px;border-top:1px solid var(--border);display:flex;gap:8px;align-items:center}
  .cat-add-in{flex:1;background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:var(--mono);font-size:12px;padding:8px 10px;outline:none;border-radius:0}
  .cat-add-in:focus{border-color:var(--accent)}
  .cat-add-btn{background:var(--accent);color:#0d0f12;border:none;font-family:var(--mono);font-size:11px;font-weight:700;padding:8px 12px;cursor:pointer;border-radius:0;-webkit-tap-highlight-color:transparent;white-space:nowrap}
  .cat-add-btn:hover{opacity:.85}
  .cat-note{padding:10px 14px;border-top:1px solid var(--border);font-family:var(--mono);font-size:11px;color:var(--muted)}

  /* LAYOUT */
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:18px}
  .action-row{display:flex;gap:10px;margin-top:4px}
  .action-row .btn-in,.action-row .btn-out{flex:1;padding:15px 0}
  .search-row{display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap}
  .search-input{flex:1;min-width:160px;background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:var(--mono);font-size:13px;padding:9px 13px;outline:none;border-radius:0}
  .search-input:focus{border-color:var(--accent)}
  .filter-group{display:flex;gap:6px;flex-wrap:wrap}
  .filter-btn{background:transparent;border:1px solid var(--border);color:var(--muted);font-family:var(--mono);font-size:10px;letter-spacing:1px;text-transform:uppercase;padding:8px 14px;cursor:pointer;transition:all .15s;border-radius:0;white-space:nowrap;-webkit-tap-highlight-color:transparent}
  .filter-btn:hover,.filter-btn.active{border-color:var(--accent);color:var(--accent)}
  .stock-bar{height:4px;background:var(--border);overflow:hidden;margin-top:4px}
  .stock-bar-fill{height:100%;background:var(--accent2);transition:width .3s}
  .spinner{display:inline-block;width:14px;height:14px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .6s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .empty-state{text-align:center;padding:40px 20px;color:var(--muted)}
  .empty-icon{font-size:28px;margin-bottom:10px;opacity:.4}
  .empty-text{font-family:var(--mono);font-size:12px;letter-spacing:1px}

  /* TOAST */
  .toast-wrap{position:fixed;bottom:24px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;max-width:calc(100vw - 32px)}
  .toast{background:var(--surface);border:1px solid var(--border);padding:12px 16px;font-family:var(--mono);font-size:12px;display:flex;align-items:flex-start;gap:10px;animation:slideIn .25s ease;min-width:240px;max-width:360px}
  .toast.success{border-left:3px solid var(--success)}.toast.error{border-left:3px solid var(--danger)}
  @keyframes slideIn{from{transform:translateX(40px);opacity:0}to{transform:translateX(0);opacity:1}}

  /* MODAL */
  .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:200;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px);padding:16px}
  .modal-box{background:var(--surface);border:1px solid var(--border);width:100%;max-width:540px;max-height:90vh;overflow-y:auto}
  .modal-hdr{padding:18px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:var(--surface);z-index:1}
  .modal-title{font-family:var(--mono);font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase}
  .modal-close{background:transparent;border:none;color:var(--muted);font-size:24px;cursor:pointer;line-height:1;padding:0 4px;-webkit-tap-highlight-color:transparent}
  .modal-close:hover{color:var(--text)}
  .modal-body{padding:20px}

  /* BOTTOM NAV */
  .bottom-nav{display:none}

  /* RESPONSIVE */
  @media(max-width:900px){
    .two-col{grid-template-columns:1fr}
    .stats-grid{grid-template-columns:repeat(2,1fr)}
  }
  @media(max-width:680px){
    :root{--sw:280px}
    .sidebar{transform:translateX(-100%);box-shadow:none}
    .sidebar.open{transform:translateX(0);box-shadow:4px 0 24px rgba(0,0,0,.5)}
    .sidebar-overlay.open{display:block}
    .hamburger{display:flex;align-items:center}
    .main-content{margin-left:0;padding-bottom:var(--bh)}
    .topbar{padding:0 16px}.clock{display:none}
    .page-body{padding:14px}
    .page-title{font-size:16px}.page-desc{font-size:12px}
    .stats-grid{gap:10px;margin-bottom:16px}
    .stat-card{padding:14px 12px}.stat-value{font-size:22px}.stat-label{font-size:8px}
    .desktop-table{display:none}.mob-list{display:block}
    .search-row{flex-direction:column;align-items:stretch;gap:8px}
    .search-input{min-width:0;font-size:16px}
    .modal-overlay{align-items:flex-end;padding:0}
    .modal-box{max-width:100%;max-height:85vh;border-bottom:none;border-left:none;border-right:none}
    .action-row{flex-direction:column;gap:8px}
    .toast-wrap{bottom:calc(var(--bh) + 10px);right:12px;left:12px}
    .toast{min-width:0;max-width:100%}
    .cat-grid{grid-template-columns:1fr}
    .bottom-nav{display:flex;position:fixed;bottom:0;left:0;right:0;height:var(--bh);background:var(--surface);border-top:1px solid var(--border);z-index:50;padding-bottom:env(safe-area-inset-bottom)}
    .bn-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer;color:var(--muted);font-family:var(--mono);font-size:9px;letter-spacing:1px;text-transform:uppercase;padding:8px 4px;transition:color .15s;-webkit-tap-highlight-color:transparent;user-select:none;border:none;background:none}
    .bn-item.active{color:var(--accent)}.bn-icon{font-size:20px;line-height:1}
  }
  @media(max-width:380px){
    .stats-grid{gap:8px}.stat-card{padding:12px 10px}.stat-value{font-size:20px}
    .login-card{padding:28px 18px}.login-title{font-size:20px}
  }
`;

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const CAT_COLORS = ["#f0b429","#00c2a8","#e05252","#7c6af7","#f97316","#06b6d4","#ec4899","#84cc16","#a78bfa","#fb923c"];
const catColor = (name, list) => CAT_COLORS[list.indexOf(name) % CAT_COLORS.length] || "#64748b";
const NAV = [
  {id:"dashboard", label:"Dashboard",      icon:"⊞"},
  {id:"movimento", label:"Nuovo Movimento",icon:"⇅"},
  {id:"inventario",label:"Inventario",     icon:"▤"},
  {id:"storico",   label:"Storico",        icon:"≡"},
];

function fmtDate(iso) { const d=new Date(iso); return d.toLocaleDateString("it-IT")+" "+d.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"}); }
function fmtShort(iso){ const d=new Date(iso); return d.toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit"})+" "+d.toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"}); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2); }

// ── CLOCK ─────────────────────────────────────────────────────────────────────
function Clock(){ const [t,setT]=useState(new Date()); useEffect(()=>{const id=setInterval(()=>setT(new Date()),1000);return()=>clearInterval(id);},[]);return<span className="clock">{t.toLocaleTimeString("it-IT")}</span>; }

// ── TOAST ─────────────────────────────────────────────────────────────────────
function Toasts({toasts}){ return <div className="toast-wrap">{toasts.map(t=><div key={t.id} className={`toast ${t.type}`}><span style={{flexShrink:0}}>{t.type==="success"?"✓":"✕"}</span><span>{t.msg}</span></div>)}</div>; }

// ── CATEGORY DROPDOWN ─────────────────────────────────────────────────────────
function CatDropdown({value,onChange,categories,onAdd,isAdmin,placeholder="Seleziona reparto..."}){
  const [open,setOpen]=useState(false);
  const [nv,setNv]=useState("");
  const ref=useRef();
  useEffect(()=>{ const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);}; document.addEventListener("mousedown",h); return()=>document.removeEventListener("mousedown",h); },[]);
  const handleAdd=async()=>{ const t=nv.trim(); if(!t||categories.includes(t))return; await onAdd(t); onChange(t); setNv(""); setOpen(false); };
  const color=value?catColor(value,categories):"var(--muted)";
  return(
    <div className="cat-wrap" ref={ref}>
      <button type="button" className={`cat-trigger${open?" open":""}`} onClick={()=>setOpen(o=>!o)}>
        {value
          ?<span style={{display:"flex",alignItems:"center",gap:8}}><span style={{width:8,height:8,borderRadius:"50%",background:color,flexShrink:0}}/><span>{value}</span></span>
          :<span className="cat-ph">{placeholder}</span>}
      </button>
      <span className={`cat-arrow${open?" open":""}`}>▼</span>
      {open&&(
        <div className="cat-panel">
          <div className="cat-grid">
            {categories.map(c=>(
              <div key={c} className={`cat-opt${value===c?" sel":""}`} onClick={()=>{onChange(c);setOpen(false);}}>
                <span className="cat-dot" style={{background:catColor(c,categories)}}/>
                {c}
                {value===c&&<span style={{marginLeft:"auto",fontSize:10}}>✓</span>}
              </div>
            ))}
          </div>
          {isAdmin
            ?<div className="cat-add-row">
                <input className="cat-add-in" value={nv} onChange={e=>setNv(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&handleAdd()} placeholder="Nuovo reparto..." maxLength={40}/>
                <button className="cat-add-btn" onClick={handleAdd}>+ Aggiungi</button>
              </div>
            :<div className="cat-note">Solo l'admin può aggiungere reparti</div>}
        </div>
      )}
    </div>
  );
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
function LoginPage({onLogin}){
  const [u,setU]=useState(""); const [p,setP]=useState(""); const [err,setErr]=useState(""); const [loading,setLoading]=useState(false);
  const go=async()=>{
    setLoading(true);setErr("");
    try{ const {token,user}=await api.login(u,p); api.saveToken(token); onLogin(user); }
    catch(e){ setErr(e.response?.data?.message||"Errore di connessione."); setLoading(false); }
  };
  return(
    <div className="login-wrap"><div className="login-grid"/>
      <div className="login-card">
        <div className="login-logo">Sistema Gestionale</div>
        <div className="login-title">Warehouse<br/>Manager</div>
        <div className="login-sub">Accedi con le tue credenziali aziendali</div>
        {err&&<div className="error-msg">{err}</div>}
        <div className="field-wrap"><label className="field-label">Username</label>
          <input className="field-input" value={u} onChange={e=>setU(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} autoFocus autoCapitalize="none" autoCorrect="off"/>
        </div>
        <div className="field-wrap"><label className="field-label">Password</label>
          <input className="field-input" type="password" value={p} onChange={e=>setP(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()}/>
        </div>
        <button className="btn-primary" onClick={go} disabled={loading||!u||!p}>{loading?"Accesso in corso...":"Accedi al Sistema"}</button>
      </div>
    </div>
  );
}

// ── SIDEBAR ───────────────────────────────────────────────────────────────────
function Sidebar({user,page,setPage,onLogout,open,onClose}){
  const initials=user.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  const go=id=>{setPage(id);onClose();};
  return(<>
    <div className={`sidebar-overlay${open?" open":""}`} onClick={onClose}/>
    <aside className={`sidebar${open?" open":""}`}>
      <div className="sidebar-brand"><div className="brand-tag">v2.0 · MongoDB</div><div className="brand-name">WH Manager</div></div>
      <nav className="sidebar-nav">
        <div className="nav-lbl">Navigazione</div>
        {NAV.map(n=><div key={n.id} className={`nav-item${page===n.id?" active":""}`} onClick={()=>go(n.id)}><span className="nav-icon">{n.icon}</span>{n.label}</div>)}
      </nav>
      <div className="sidebar-footer">
        <div className="user-chip"><div className="user-av">{initials}</div><div><div className="user-name">{user.name}</div><div className="user-role">{user.role}</div></div></div>
        <button className="btn-logout" onClick={onLogout}>Disconnetti</button>
      </div>
    </aside>
  </>);
}

function BottomNav({page,setPage}){
  return(<nav className="bottom-nav">{NAV.map(n=><button key={n.id} className={`bn-item${page===n.id?" active":""}`} onClick={()=>setPage(n.id)}><span className="bn-icon">{n.icon}</span><span>{n.label.split(" ")[0]}</span></button>)}</nav>);
}

// ── LOADING PLACEHOLDER ───────────────────────────────────────────────────────
function Loading({label="Caricamento..."}){
  return<div style={{display:"flex",alignItems:"center",gap:12,padding:32,color:"var(--muted)",fontFamily:"var(--mono)",fontSize:13}}><div className="spinner"/>{label}</div>;
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function Dashboard({setPage}){
  const [inv,setInv]=useState(null);
  const [mov,setMov]=useState(null);
  const [stats,setStats]=useState(null);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    Promise.all([api.getInventory(),api.getMovements({limit:10}),api.todayStats()])
      .then(([i,m,s])=>{setInv(i);setMov(m.movements);setStats(s);})
      .finally(()=>setLoading(false));
  },[]);

  if(loading) return<div className="page-body"><Loading/></div>;
  const t=inv?.totals||{};
  const recent=mov||[];

  return(
    <div className="page-body">
      <div className="page-header"><div className="page-title">Dashboard</div><div className="page-desc">Panoramica generale del magazzino — dati in tempo reale</div></div>
      <div className="stats-grid">
        <div className="stat-card yellow"><div className="stat-label">In Stock</div><div className="stat-value">{(t.totalItems||0).toLocaleString()}</div><div className="stat-sub">{t.totalCodes||0} codici</div></div>
        <div className="stat-card teal"><div className="stat-label">Entrate Oggi</div><div className="stat-value">{stats?.IN?.qty||0}</div><div className="stat-sub">{stats?.IN?.count||0} mov.</div></div>
        <div className="stat-card red"><div className="stat-label">Uscite Oggi</div><div className="stat-value">{stats?.OUT?.qty||0}</div><div className="stat-sub">{stats?.OUT?.count||0} mov.</div></div>
        <div className="stat-card green"><div className="stat-label">Scorte Basse</div><div className="stat-value">{t.lowStockCount||0}</div><div className="stat-sub">sotto 50 pz</div></div>
      </div>
      <div className="card">
        <div className="card-header"><div className="card-title">Movimenti Recenti</div><button className="filter-btn" style={{fontSize:10}} onClick={()=>setPage("storico")}>Vedi tutti →</button></div>
        <div className="table-wrap desktop-table">
          <table className="data-table">
            <thead><tr><th>Codice</th><th>Reparto</th><th>Tipo</th><th>Qtà</th><th>Operatore</th><th>Data</th></tr></thead>
            <tbody>{recent.map(m=>(
              <tr key={m._id}>
                <td className="mono" style={{color:"var(--accent)"}}>{m.code}</td>
                <td>{m.category?<CatBadge name={m.category} cats={[]}/>:"—"}</td>
                <td><span className={`badge badge-${m.type==="IN"?"in":"out"}`}>{m.type==="IN"?"Entrata":"Uscita"}</span></td>
                <td className="mono">{m.qty.toLocaleString()}</td>
                <td style={{color:"var(--muted)",fontSize:12}}>{m.userName}</td>
                <td className="mono" style={{color:"var(--muted)",fontSize:11}}>{fmtShort(m.createdAt)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="mob-list">
          {recent.map(m=>(
            <div className="mob-card" key={m._id}>
              <div className="mob-code">{m.code}</div>
              <div className="mob-right"><span className={`badge badge-${m.type==="IN"?"in":"out"}`}>{m.type}</span><span className="mob-qty" style={{color:m.type==="IN"?"var(--success)":"var(--danger)"}}>{m.qty}</span></div>
              <div className="mob-desc">{m.category||m.code}</div>
              <div className="mob-meta">{m.userName} · {fmtShort(m.createdAt)}</div>
            </div>
          ))}
        </div>
        {recent.length===0&&<div className="empty-state"><div className="empty-text">Nessun movimento</div></div>}
      </div>
    </div>
  );
}

// ── CATEGORY BADGE (inline) ───────────────────────────────────────────────────
function CatBadge({name, cats}){
  const c=catColor(name,cats);
  return<span className="cat-badge" style={{background:c+"22",color:c,border:`1px solid ${c}44`}}>{name}</span>;
}

// ── MOVIMENTO ─────────────────────────────────────────────────────────────────
function MovimentoPage({user,categories,onAddCat,addToast}){
  const [code,setCode]=useState(""); const [qty,setQty]=useState(""); const [note,setNote]=useState("");
  const [category,setCategory]=useState(""); const [submitting,setSubmitting]=useState(false);
  const [recentMov,setRecentMov]=useState([]);
  const [stockHint,setStockHint]=useState(null);
  const codeRef=useRef();

  const loadRecent=useCallback(async()=>{ try{ const d=await api.getMovements({limit:10}); setRecentMov(d.movements); }catch{} },[]);
  useEffect(()=>{loadRecent();},[loadRecent]);

  useEffect(()=>{
    if(!code.trim()){setStockHint(null);return;}
    const t=setTimeout(async()=>{ try{ const d=await api.getItem(code.trim()); setStockHint(d.item.qty); }catch{setStockHint(null);} },450);
    return()=>clearTimeout(t);
  },[code]);

  const submit=async(type)=>{
    const q=parseInt(qty);
    if(!code.trim()){addToast("Inserisci un codice prodotto","error");return;}
    if(!category){addToast("Seleziona il reparto","error");return;}
    if(!q||q<=0){addToast("Quantità non valida","error");return;}
    setSubmitting(true);
    try{
      await api.addMovement({code:code.trim(),qty:q,type,category,note:note.trim()});
      addToast(`${type==="IN"?"Entrata":"Uscita"} di ${q} pz [${code.toUpperCase()}] — ${category}`,"success");
      setCode("");setQty("");setNote("");setCategory("");setStockHint(null);
      loadRecent();
      codeRef.current?.focus();
    }catch(e){
      addToast(e.response?.data?.message||"Errore nella registrazione","error");
    }finally{setSubmitting(false);}
  };

  return(
    <div className="page-body">
      <div className="page-header"><div className="page-title">Nuovo Movimento</div><div className="page-desc">Registra entrata o uscita manuale</div></div>
      <div className="two-col">
        <div>
          <div className="card">
            <div className="card-header"><div className="card-title">Dati Prodotto</div></div>
            <div className="card-body">
              <div className="field-wrap">
                <label className="field-label">Codice Prodotto *</label>
                <input ref={codeRef} className="mov-input" value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="es. ART-001" autoFocus autoCapitalize="characters" autoCorrect="off" spellCheck="false"/>
                {stockHint!==null&&<div style={{marginTop:8,fontFamily:"var(--mono)",fontSize:11,color:"var(--accent2)"}}>✓ In DB — stock: <strong>{stockHint}</strong> pz</div>}
              </div>
              <div className="field-wrap">
                <label className="field-label">Reparto *</label>
                <CatDropdown value={category} onChange={setCategory} categories={categories} onAdd={onAddCat} isAdmin={user.role==="Amministratore"}/>
              </div>
              <div className="field-wrap">
                <label className="field-label">Quantità *</label>
                <input className="mov-input" type="number" inputMode="numeric" min="1" value={qty} onChange={e=>setQty(e.target.value)} placeholder="0"/>
              </div>
              <div className="field-wrap" style={{marginBottom:0}}>
                <label className="field-label">Note (opzionale)</label>
                <input className="mov-input" value={note} onChange={e=>setNote(e.target.value)} placeholder="es. Ordine #123"/>
              </div>
            </div>
          </div>
          <div className="action-row">
            <button className="btn-in" onClick={()=>submit("IN")} disabled={submitting}>↑ {submitting?"...":"Entrata"}</button>
            <button className="btn-out" onClick={()=>submit("OUT")} disabled={submitting}>↓ {submitting?"...":"Uscita"}</button>
          </div>
          <div style={{marginTop:14,fontFamily:"var(--mono)",fontSize:11,color:"var(--muted)"}}>Operatore: <span style={{color:"var(--text)"}}>{user.name}</span> · {user.role}</div>
        </div>
        <div>
          <div className="card">
            <div className="card-header"><div className="card-title">Ultimi Movimenti</div></div>
            <div className="desktop-table">
              <table className="data-table" style={{minWidth:0}}>
                <thead><tr><th>Codice</th><th>Reparto</th><th>T</th><th>Qty</th><th>Ora</th></tr></thead>
                <tbody>{recentMov.map(m=>(
                  <tr key={m._id}>
                    <td className="mono" style={{color:"var(--accent)",fontSize:11}}>{m.code}</td>
                    <td style={{fontSize:11}}>{m.category?<CatBadge name={m.category} cats={categories}/>:"—"}</td>
                    <td><span className={`badge badge-${m.type==="IN"?"in":"out"}`} style={{fontSize:9}}>{m.type}</span></td>
                    <td className="mono">{m.qty}</td>
                    <td className="mono" style={{color:"var(--muted)",fontSize:10}}>{fmtShort(m.createdAt).split(" ")[1]}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="mob-list">
              {recentMov.map(m=>(
                <div className="mob-card" key={m._id}>
                  <div className="mob-code">{m.code}</div>
                  <div className="mob-right"><span className={`badge badge-${m.type==="IN"?"in":"out"}`} style={{fontSize:9}}>{m.type}</span><span className="mob-qty" style={{color:m.type==="IN"?"var(--success)":"var(--danger)"}}>{m.qty}</span></div>
                  <div className="mob-desc">{m.category||"—"}</div>
                  <div className="mob-meta">{fmtShort(m.createdAt)}</div>
                </div>
              ))}
            </div>
            {recentMov.length===0&&<div className="empty-state" style={{padding:24}}><div className="empty-text">Nessun movimento</div></div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── INVENTARIO ────────────────────────────────────────────────────────────────
function InventarioPage({categories}){
  const [data,setData]=useState(null);
  const [search,setSearch]=useState("");
  const [catF,setCatF]=useState("ALL");
  const [detail,setDetail]=useState(null);
  const [detailData,setDetailData]=useState(null);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{api.getInventory().then(setData).finally(()=>setLoading(false));},[]);

  const openDetail=async item=>{
    setDetail(item);setDetailData(null);
    try{const d=await api.getItem(item.code);setDetailData(d);}catch{}
  };

  const inv=data?.inventory||[];
  const filtered=inv.filter(i=>{
    const ms=i.code.toLowerCase().includes(search.toLowerCase())||i.description.toLowerCase().includes(search.toLowerCase());
    const mc=catF==="ALL"||(i.lastCategory||"")===catF;
    return ms&&mc;
  });
  const maxQty=Math.max(...inv.map(i=>i.qty),1);

  if(loading) return<div className="page-body"><Loading label="Caricamento inventario..."/></div>;

  return(
    <div className="page-body">
      <div className="page-header"><div className="page-title">Inventario</div><div className="page-desc">{inv.length} codici · {(data?.totals?.totalItems||0).toLocaleString()} pz totali</div></div>
      <div className="search-row">
        <input className="search-input" placeholder="Cerca codice o descrizione..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <span style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--muted)",whiteSpace:"nowrap"}}>{filtered.length} risultati</span>
      </div>
      <div className="filter-group" style={{marginBottom:14}}>
        <button className={`filter-btn${catF==="ALL"?" active":""}`} onClick={()=>setCatF("ALL")}>Tutti</button>
        {categories.map(c=><button key={c} className={`filter-btn${catF===c?" active":""}`} onClick={()=>setCatF(c)} style={catF===c?{borderColor:catColor(c,categories),color:catColor(c,categories)}:{}}><span style={{display:"inline-block",width:6,height:6,borderRadius:"50%",background:catColor(c,categories),marginRight:6,verticalAlign:"middle"}}/>{c}</button>)}
      </div>
      <div className="card">
        <div className="table-wrap desktop-table">
          <table className="data-table">
            <thead><tr><th>Codice</th><th>Descrizione</th><th>Reparto</th><th>Quantità</th><th>Stock</th><th>Ultimo Mov.</th><th>Totali</th><th></th></tr></thead>
            <tbody>{filtered.map(i=>(
              <tr key={i.code}>
                <td className="mono" style={{color:"var(--accent)"}}>{i.code}</td>
                <td>{i.description}</td>
                <td>{i.lastCategory?<CatBadge name={i.lastCategory} cats={categories}/>:<span style={{color:"var(--muted)",fontSize:11}}>—</span>}</td>
                <td className="mono"><span style={{color:i.qty<50?"var(--danger)":i.qty<100?"var(--accent)":"var(--success)",fontWeight:700}}>{i.qty.toLocaleString()}</span>{i.qty<50&&<span style={{marginLeft:8,fontSize:10,color:"var(--danger)"}}>⚠</span>}</td>
                <td style={{width:110}}><div className="stock-bar"><div className="stock-bar-fill" style={{width:`${Math.min(100,(i.qty/maxQty)*100)}%`}}/></div></td>
                <td className="mono" style={{color:"var(--muted)",fontSize:11}}>{i.lastMovement?fmtShort(i.lastMovement):"—"}</td>
                <td style={{fontSize:11,fontFamily:"var(--mono)"}}><span style={{color:"var(--success)"}}>↑{i.totalIn}</span>{" "}<span style={{color:"var(--danger)"}}>↓{i.totalOut}</span></td>
                <td><button className="filter-btn" style={{fontSize:10}} onClick={()=>openDetail(i)}>Storico</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="mob-list">
          {filtered.map(i=>(
            <div className="mob-card" key={i.code} onClick={()=>openDetail(i)} style={{cursor:"pointer"}}>
              <div className="mob-code">{i.code}</div>
              <div className="mob-right"><span className="mob-qty" style={{color:i.qty<50?"var(--danger)":i.qty<100?"var(--accent)":"var(--success)"}}>{i.qty.toLocaleString()}</span>{i.qty<50&&<span style={{fontSize:10,color:"var(--danger)",fontFamily:"var(--mono)"}}>⚠ BASSO</span>}<div className="stock-bar" style={{width:56}}><div className="stock-bar-fill" style={{width:`${Math.min(100,(i.qty/maxQty)*100)}%`}}/></div></div>
              <div className="mob-desc">{i.description}</div>
              <div className="mob-meta">{i.lastCategory&&<span style={{color:catColor(i.lastCategory,categories),marginRight:6}}>{i.lastCategory}</span>}↑{i.totalIn} ↓{i.totalOut}</div>
            </div>
          ))}
        </div>
        {filtered.length===0&&<div className="empty-state"><div className="empty-icon">▤</div><div className="empty-text">Nessun articolo trovato</div></div>}
      </div>

      {detail&&(
        <div className="modal-overlay" onClick={()=>setDetail(null)}>
          <div className="modal-box" onClick={e=>e.stopPropagation()}>
            <div className="modal-hdr"><div className="modal-title">Storico · {detail.code}</div><button className="modal-close" onClick={()=>setDetail(null)}>×</button></div>
            <div className="modal-body">
              <div style={{marginBottom:16,fontFamily:"var(--mono)",fontSize:12,color:"var(--muted)"}}>{detail.description} · Stock: <span style={{color:"var(--text)",fontWeight:700}}>{detail.qty}</span> pz</div>
              {!detailData?<Loading label="Caricamento storico..."/>:(detailData.movements.map(m=>(
                <div key={m._id} style={{padding:"12px 0",borderBottom:"1px solid var(--border)",display:"grid",gridTemplateColumns:"auto 1fr auto",gap:"8px 12px",alignItems:"center"}}>
                  <span className={`badge badge-${m.type==="IN"?"in":"out"}`}>{m.type}</span>
                  <div>
                    <div style={{fontSize:13}}>{m.userName}</div>
                    <div style={{fontFamily:"var(--mono)",fontSize:11,color:"var(--muted)",marginTop:2}}>{fmtDate(m.createdAt)}</div>
                    {m.category&&<div style={{marginTop:2}}><CatBadge name={m.category} cats={categories}/></div>}
                    {m.note&&<div style={{fontSize:11,color:"var(--muted)",marginTop:2}}>{m.note}</div>}
                  </div>
                  <span style={{fontFamily:"var(--mono)",fontSize:20,fontWeight:700,color:m.type==="IN"?"var(--success)":"var(--danger)"}}>{m.qty}</span>
                </div>
              )))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── STORICO ───────────────────────────────────────────────────────────────────
function StoricoPage({categories}){
  const [data,setData]=useState(null);
  const [search,setSearch]=useState("");
  const [typeF,setTypeF]=useState("ALL");
  const [catF,setCatF]=useState("ALL");
  const [page,setPage]=useState(1);
  const [loading,setLoading]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const params={page,limit:50};
      if(typeF!=="ALL") params.type=typeF;
      if(catF!=="ALL") params.category=catF;
      if(search.trim()) params.search=search.trim();
      setData(await api.getMovements(params));
    }finally{setLoading(false);}
  },[page,typeF,catF,search]);

  useEffect(()=>{setPage(1);},[typeF,catF,search]);
  useEffect(()=>{load();},[load]);

  const movements=data?.movements||[];
  const pg=data?.pagination;

  return(
    <div className="page-body">
      <div className="page-header"><div className="page-title">Storico</div><div className="page-desc">{pg?.total||0} movimenti nel database</div></div>
      <div className="search-row">
        <input className="search-input" placeholder="Cerca codice, operatore..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <div className="filter-group">
          {["ALL","IN","OUT"].map(f=><button key={f} className={`filter-btn${typeF===f?" active":""}`} onClick={()=>setTypeF(f)}>{f==="ALL"?"Tutti":f==="IN"?"Entrate":"Uscite"}</button>)}
        </div>
      </div>
      <div className="filter-group" style={{marginBottom:14}}>
        <button className={`filter-btn${catF==="ALL"?" active":""}`} onClick={()=>setCatF("ALL")}>Tutti i reparti</button>
        {categories.map(c=><button key={c} className={`filter-btn${catF===c?" active":""}`} onClick={()=>setCatF(c)} style={catF===c?{borderColor:catColor(c,categories),color:catColor(c,categories)}:{}}><span style={{display:"inline-block",width:6,height:6,borderRadius:"50%",background:catColor(c,categories),marginRight:6,verticalAlign:"middle"}}/>{c}</button>)}
      </div>
      <div className="card">
        {loading?<Loading/>:(
          <>
            <div className="table-wrap desktop-table">
              <table className="data-table">
                <thead><tr><th>#</th><th>Codice</th><th>Reparto</th><th>Tipo</th><th>Qtà</th><th>Operatore</th><th>Data / Ora</th><th>Note</th></tr></thead>
                <tbody>{movements.map((m,idx)=>(
                  <tr key={m._id}>
                    <td className="mono" style={{color:"var(--muted)",fontSize:11}}>{String(((page-1)*50)+idx+1).padStart(3,"0")}</td>
                    <td className="mono" style={{color:"var(--accent)"}}>{m.code}</td>
                    <td>{m.category?<CatBadge name={m.category} cats={categories}/>:<span style={{color:"var(--muted)",fontSize:11}}>—</span>}</td>
                    <td><span className={`badge badge-${m.type==="IN"?"in":"out"}`}>{m.type==="IN"?"Entrata":"Uscita"}</span></td>
                    <td className="mono" style={{fontWeight:700}}>{m.qty.toLocaleString()}</td>
                    <td style={{fontSize:12,color:"var(--muted)"}}>{m.userName}</td>
                    <td className="mono" style={{fontSize:11,color:"var(--muted)"}}>{fmtShort(m.createdAt)}</td>
                    <td style={{fontSize:11,color:"var(--muted)",maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.note||"—"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="mob-list">
              {movements.map(m=>(
                <div className="mob-card" key={m._id}>
                  <div className="mob-code">{m.code}</div>
                  <div className="mob-right"><span className={`badge badge-${m.type==="IN"?"in":"out"}`}>{m.type}</span><span className="mob-qty" style={{color:m.type==="IN"?"var(--success)":"var(--danger)"}}>{m.qty}</span></div>
                  <div className="mob-desc">{m.category||"—"}</div>
                  <div className="mob-meta">{m.userName} · {fmtShort(m.createdAt)}{m.note&&` · ${m.note}`}</div>
                </div>
              ))}
            </div>
            {movements.length===0&&<div className="empty-state"><div className="empty-icon">≡</div><div className="empty-text">Nessun movimento trovato</div></div>}
          </>
        )}
      </div>
      {pg&&pg.pages>1&&(
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",fontFamily:"var(--mono)",fontSize:11,color:"var(--muted)"}}>
          <span>Pag. {pg.page} / {pg.pages} · {pg.total} totali</span>
          <div style={{display:"flex",gap:8}}>
            <button className="filter-btn" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>← Prec</button>
            <button className="filter-btn" disabled={page>=pg.pages} onClick={()=>setPage(p=>p+1)}>Succ →</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── APP ROOT ──────────────────────────────────────────────────────────────────
export default function App(){
  const [user,setUser]=useState(null);
  const [page,setPage]=useState("dashboard");
  const [toasts,setToasts]=useState([]);
  const [sidebarOpen,setSidebarOpen]=useState(false);
  const [categories,setCategories]=useState([]);
  const [checking,setChecking]=useState(true);

  // Ripristina sessione da token salvato
  useEffect(()=>{
    if(!api.hasToken()){setChecking(false);return;}
    api.getMe().then(u=>setUser(u)).catch(()=>api.clearToken()).finally(()=>setChecking(false));
  },[]);

  // Carica categorie dopo il login
  useEffect(()=>{
    if(user) api.getCategories().then(setCategories).catch(()=>{});
  },[user]);

  const addToast=useCallback((msg,type="success")=>{
    const id=uid();
    setToasts(t=>[...t,{id,msg,type}]);
    setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),3500);
  },[]);

  const handleAddCat=async name=>{
    try{ await api.addCategory(name); setCategories(p=>[...p,name]); }
    catch(e){ addToast(e.response?.data?.message||"Errore aggiunta reparto","error"); }
  };

  const logout=()=>{ api.clearToken(); setUser(null); setPage("dashboard"); setSidebarOpen(false); };
  const pageTitle=NAV.find(n=>n.id===page)?.label??"";

  if(checking) return(
    <>
      <style>{STYLES}</style>
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",gap:14,fontFamily:"var(--mono)",fontSize:13,color:"var(--muted)",background:"var(--bg)"}}>
        <div className="spinner"/> Verifica sessione...
      </div>
    </>
  );

  if(!user) return(<><style>{STYLES}</style><LoginPage onLogin={setUser}/><Toasts toasts={toasts}/></>);

  return(
    <>
      <style>{STYLES}</style>
      <div className="app-shell">
        <Sidebar user={user} page={page} setPage={setPage} onLogout={logout} open={sidebarOpen} onClose={()=>setSidebarOpen(false)}/>
        <div className="main-content">
          <div className="topbar">
            <div className="topbar-left">
              <button className="hamburger" onClick={()=>setSidebarOpen(o=>!o)} aria-label="Menu">☰</button>
              <div className="topbar-title">{pageTitle}</div>
            </div>
            <div className="topbar-right"><div className="status-dot"/><Clock/></div>
          </div>
          {page==="dashboard"  &&<Dashboard setPage={setPage}/>}
          {page==="movimento"  &&<MovimentoPage user={user} categories={categories} onAddCat={handleAddCat} addToast={addToast}/>}
          {page==="inventario" &&<InventarioPage categories={categories}/>}
          {page==="storico"    &&<StoricoPage categories={categories}/>}
        </div>
        <BottomNav page={page} setPage={p=>{setPage(p);setSidebarOpen(false);}}/>
      </div>
      <Toasts toasts={toasts}/>
    </>
  );
}
