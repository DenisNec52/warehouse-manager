/**
 * pages/IntegrationsPage.jsx — Integrazioni (solo admin)
 *
 * Chiavi API per i sistemi esterni (gestionale offerte, ERP) e webhook.
 * Chiave e segreto di firma compaiono UNA volta, subito dopo la creazione:
 * il server conserva solo un hash (chiavi) o una copia cifrata (segreti webhook).
 * Guida per chi sviluppa l'integrazione: backend/docs/INTEGRAZIONE.md.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X, KeyRound, Webhook, Copy, Check, Trash2, Ban, Send, Power, History } from "lucide-react";
import { m as motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import clsx from "clsx";
import { integrationsAPI } from "@/lib/api";

const errorMessage = (e) => e.response?.data?.errors?.[0]?.message || e.response?.data?.message || "Errore";
const fmt = (d) => (d ? new Date(d).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "—");

const SCOPE_LABELS = {
  "products:read":      "Leggere articoli e giacenze",
  "movements:read":     "Leggere i movimenti",
  "movements:write":    "Registrare entrate/uscite",
  "reservations:read":  "Leggere le prenotazioni",
  "reservations:write": "Prenotare, rilasciare, consumare",
  "production:read":    "Stato commesse in produzione",
};
const EVENT_LABELS = {
  "movement.created":     "Movimento registrato",
  "stock.low":            "Scorta bassa",
  "product.created":      "Articolo creato",
  "product.updated":      "Articolo modificato/eliminato",
  "reservation.created":  "Prenotazione creata",
  "reservation.released": "Prenotazione rilasciata",
  "reservation.consumed": "Prenotazione consumata",
};

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-xs" onClick={onClose}/>
      <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
        className="relative z-10 w-full sm:max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-t-lg sm:rounded-lg shadow-modal">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-white">{title}</h2>
          <button className="btn btn-ghost btn-sm p-1.5" onClick={onClose} aria-label="Chiudi"><X size={16}/></button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

/** Valore da copiare mostrato una sola volta. */
function SecretOnce({ label, value, onDone }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); toast.success("Copiato"); }
    catch { toast.error("Copia non riuscita: selezionalo e copialo a mano"); }
  };
  return (
    <div className="p-5 space-y-4">
      <div className="rounded-(--radius) bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 text-sm p-3">
        Copialo adesso e salvalo nella configurazione segreta del sistema esterno: <strong>non verrà più mostrato</strong>.
      </div>
      <div>
        <label className="form-label">{label}</label>
        <div className="flex gap-2">
          <input className="form-input font-mono text-xs" readOnly value={value} onFocus={e => e.target.select()}/>
          <button type="button" className="btn btn-md btn-secondary px-3" onClick={copy} aria-label="Copia">
            {copied ? <Check size={14}/> : <Copy size={14}/>}
          </button>
        </div>
      </div>
      <button className="btn btn-md btn-primary w-full" onClick={onDone}>Ho salvato, chiudi</button>
    </div>
  );
}

function CheckList({ options, labels, value, onChange }) {
  const toggle = (o) => onChange(value.includes(o) ? value.filter(x => x !== o) : [...value, o]);
  return (
    <div className="space-y-1.5">
      {options.map(o => (
        <label key={o} className="flex items-start gap-2 text-sm cursor-pointer">
          <input type="checkbox" className="mt-0.5" checked={value.includes(o)} onChange={() => toggle(o)}/>
          <span>
            <span className="text-gray-900 dark:text-white">{labels[o] || o}</span>
            <span className="block text-xs text-gray-400 font-mono">{o}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

// ── Chiavi API ────────────────────────────────────────────────
function KeyModal({ scopes, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", scopes: ["products:read"], expiresAt: "", allowedIps: "" });
  const [created, setCreated] = useState(null);
  const mut = useMutation({
    mutationFn: () => integrationsAPI.createKey({
      name: form.name.trim(),
      scopes: form.scopes,
      expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`).toISOString() : null,
      allowedIps: form.allowedIps.split(/[\s,]+/).map(s => s.trim()).filter(Boolean),
    }),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ["integrations", "keys"] }); setCreated(res.data.key); },
    onError: e => toast.error(errorMessage(e)),
  });

  if (created) return <Modal title="Chiave creata" onClose={onClose}><SecretOnce label="Chiave API" value={created} onDone={onClose}/></Modal>;

  return (
    <Modal title="Nuova chiave API" onClose={onClose}>
      <form className="p-5 space-y-4" onSubmit={e => { e.preventDefault(); mut.mutate(); }}>
        <div>
          <label className="form-label" htmlFor="key-name">Nome *</label>
          <input id="key-name" className="form-input" maxLength={80} autoFocus placeholder="es. Gestionale offerte"
            value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}/>
        </div>
        <div>
          <label className="form-label">Permessi *</label>
          <p className="text-xs text-gray-400 mb-2">Solo quelli che servono davvero al sistema collegato.</p>
          <CheckList options={scopes} labels={SCOPE_LABELS} value={form.scopes} onChange={v => setForm(f => ({ ...f, scopes: v }))}/>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="form-label" htmlFor="key-exp">Scadenza</label>
            <input id="key-exp" type="date" className="form-input" min={new Date().toISOString().slice(0, 10)}
              value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}/>
          </div>
          <div>
            <label className="form-label" htmlFor="key-ips">IP consentiti</label>
            <input id="key-ips" className="form-input" placeholder="vuoto = qualsiasi"
              value={form.allowedIps} onChange={e => setForm(f => ({ ...f, allowedIps: e.target.value }))}/>
          </div>
        </div>
        <p className="text-xs text-gray-400">
          Le operazioni fatte con la chiave risultano come "API · nome" e sono attribuite a te. Se il tuo account
          viene disattivato, la chiave smette di funzionare.
        </p>
        <div className="flex gap-3">
          <button type="button" className="btn btn-md btn-secondary flex-1" onClick={onClose}>Annulla</button>
          <button type="submit" className="btn btn-md btn-primary flex-1" disabled={mut.isPending || form.name.trim().length < 2 || !form.scopes.length}>
            {mut.isPending ? "..." : "Crea chiave"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function KeysSection({ scopes }) {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const { data: keys = [], isLoading } = useQuery({
    queryKey: ["integrations", "keys"],
    queryFn: () => integrationsAPI.keys().then(r => r.data.keys),
  });
  const revoke = useMutation({
    mutationFn: (id) => integrationsAPI.revokeKey(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["integrations", "keys"] }); toast.success("Chiave revocata"); },
    onError: e => toast.error(errorMessage(e)),
  });

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3 gap-4">
        <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><KeyRound size={16}/> Chiavi API</h2>
        <button className="btn btn-sm btn-primary gap-1.5" onClick={() => setModal(true)}><Plus size={14}/> Nuova chiave</button>
      </div>
      <div className="card divide-y divide-gray-100 dark:divide-gray-800">
        {isLoading && <div className="p-6 text-center text-gray-400 text-sm">Caricamento...</div>}
        {!isLoading && !keys.length && <div className="p-6 text-center text-gray-400 text-sm">Nessuna chiave. Creane una per collegare il gestionale.</div>}
        {keys.map(k => (
          <div key={k.id} className={clsx("px-4 py-3 flex gap-3 items-start", !k.active && "opacity-50")}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-gray-900 dark:text-white">{k.name}</span>
                <span className="font-mono text-xs text-gray-400">whk_{k.prefix}_…</span>
                {k.revokedAt ? <span className="badge badge-red">Revocata</span>
                  : !k.active ? <span className="badge badge-gray">Scaduta</span>
                  : <span className="badge badge-green">Attiva</span>}
              </div>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {k.scopes.map(s => <span key={s} className="badge badge-blue font-mono">{s}</span>)}
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                Creata {fmt(k.createdAt)}{k.createdBy ? ` da ${k.createdBy.name}` : ""} · Ultimo uso {fmt(k.lastUsedAt)}
                {k.lastUsedIp ? ` (${k.lastUsedIp})` : ""}{k.expiresAt ? ` · Scade ${fmt(k.expiresAt)}` : ""}
                {k.allowedIps?.length ? ` · Solo da ${k.allowedIps.join(", ")}` : ""}
              </p>
            </div>
            {!k.revokedAt && (
              <button className="btn btn-ghost btn-sm p-1.5 text-red-500" aria-label="Revoca" title="Revoca"
                disabled={revoke.isPending}
                onClick={() => { if (confirm(`Revocare "${k.name}"? Il sistema che la usa smetterà subito di funzionare.`)) revoke.mutate(k.id); }}>
                <Ban size={14}/>
              </button>
            )}
          </div>
        ))}
      </div>
      <AnimatePresence>{modal && <KeyModal scopes={scopes} onClose={() => setModal(false)}/>}</AnimatePresence>
    </section>
  );
}

// ── Webhook ───────────────────────────────────────────────────
function WebhookModal({ events, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", url: "https://", events: ["movement.created", "stock.low"] });
  const [secret, setSecret] = useState(null);
  const mut = useMutation({
    mutationFn: () => integrationsAPI.createWebhook({ name: form.name.trim(), url: form.url.trim(), events: form.events }),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ["integrations", "webhooks"] }); setSecret(res.data.secret); },
    onError: e => toast.error(errorMessage(e)),
  });

  if (secret) return <Modal title="Webhook creato" onClose={onClose}><SecretOnce label="Segreto di firma (HMAC)" value={secret} onDone={onClose}/></Modal>;

  return (
    <Modal title="Nuovo webhook" onClose={onClose}>
      <form className="p-5 space-y-4" onSubmit={e => { e.preventDefault(); mut.mutate(); }}>
        <div>
          <label className="form-label" htmlFor="wh-name">Nome *</label>
          <input id="wh-name" className="form-input" maxLength={80} autoFocus placeholder="es. Gestionale offerte"
            value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}/>
        </div>
        <div>
          <label className="form-label" htmlFor="wh-url">URL (https) *</label>
          <input id="wh-url" className="form-input font-mono text-sm" maxLength={500}
            value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}/>
          <p className="text-xs text-gray-400 mt-1">Indirizzi interni o privati non sono ammessi.</p>
        </div>
        <div>
          <label className="form-label">Eventi *</label>
          <CheckList options={events} labels={EVENT_LABELS} value={form.events} onChange={v => setForm(f => ({ ...f, events: v }))}/>
        </div>
        <div className="flex gap-3">
          <button type="button" className="btn btn-md btn-secondary flex-1" onClick={onClose}>Annulla</button>
          <button type="submit" className="btn btn-md btn-primary flex-1" disabled={mut.isPending || form.name.trim().length < 2 || !form.events.length}>
            {mut.isPending ? "..." : "Crea webhook"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeliveriesModal({ webhook, onClose }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["integrations", "deliveries", webhook.id],
    queryFn: () => integrationsAPI.deliveries(webhook.id).then(r => r.data.deliveries),
  });
  return (
    <Modal title={`Invii — ${webhook.name}`} onClose={onClose}>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {isLoading && <div className="p-6 text-center text-gray-400 text-sm">Caricamento...</div>}
        {!isLoading && !data.length && <div className="p-6 text-center text-gray-400 text-sm">Nessun invio negli ultimi 7 giorni.</div>}
        {data.map(d => (
          <div key={d._id} className="px-5 py-2.5 flex items-center gap-3 text-sm">
            <span className={clsx("badge", d.ok ? "badge-green" : "badge-red")}>{d.status}</span>
            <span className="font-mono text-xs flex-1 truncate">{d.event}{d.attempt > 1 ? ` · tentativo ${d.attempt}` : ""}</span>
            <span className="text-xs text-gray-400 tabular-nums">{d.durationMs} ms · {fmt(d.at)}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function WebhooksSection({ events }) {
  const qc = useQueryClient();
  const [modal, setModal] = useState(null);   // "new" | { deliveries: webhook }
  const { data: hooks = [], isLoading } = useQuery({
    queryKey: ["integrations", "webhooks"],
    queryFn: () => integrationsAPI.webhooks().then(r => r.data.webhooks),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["integrations", "webhooks"] });
  const toggle = useMutation({
    mutationFn: (w) => integrationsAPI.updateWebhook(w.id, { active: !w.active }),
    onSuccess: refresh, onError: e => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id) => integrationsAPI.deleteWebhook(id),
    onSuccess: () => { refresh(); toast.success("Webhook eliminato"); }, onError: e => toast.error(errorMessage(e)),
  });
  const test = useMutation({
    mutationFn: (id) => integrationsAPI.testWebhook(id),
    onSuccess: (res) => {
      const r = res.data.result;
      r.ok ? toast.success(`Ricevuto (${r.status}, ${r.durationMs} ms)`) : toast.error(`Non riuscito: ${r.status}`);
      refresh();
    },
    onError: e => toast.error(errorMessage(e)),
  });

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3 gap-4">
        <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Webhook size={16}/> Webhook</h2>
        <button className="btn btn-sm btn-primary gap-1.5" onClick={() => setModal("new")}><Plus size={14}/> Nuovo webhook</button>
      </div>
      <div className="card divide-y divide-gray-100 dark:divide-gray-800">
        {isLoading && <div className="p-6 text-center text-gray-400 text-sm">Caricamento...</div>}
        {!isLoading && !hooks.length && <div className="p-6 text-center text-gray-400 text-sm">Nessun webhook. Servono per avvisare subito il gestionale (es. scorta bassa).</div>}
        {hooks.map(w => (
          <div key={w.id} className={clsx("px-4 py-3 flex gap-3 items-start", !w.active && "opacity-60")}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-gray-900 dark:text-white">{w.name}</span>
                <span className={clsx("badge", w.active ? "badge-green" : "badge-gray")}>{w.active ? "Attivo" : "Disattivato"}</span>
                {w.consecutiveFailures > 0 && <span className="badge badge-red">{w.consecutiveFailures} errori</span>}
              </div>
              <p className="font-mono text-xs text-gray-500 truncate mt-1">{w.url}</p>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {w.events.map(e => <span key={e} className="badge badge-blue font-mono">{e}</span>)}
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                Ultimo invio {fmt(w.lastDeliveryAt)}{w.lastStatus ? ` · ${w.lastStatus}` : ""}
                {w.disabledReason ? ` · ${w.disabledReason}` : ""}
              </p>
            </div>
            <div className="flex gap-1 shrink-0">
              <button className="btn btn-ghost btn-sm p-1.5" title="Invia un test" aria-label="Invia un test"
                disabled={test.isPending} onClick={() => test.mutate(w.id)}><Send size={14}/></button>
              <button className="btn btn-ghost btn-sm p-1.5" title="Storico invii" aria-label="Storico invii"
                onClick={() => setModal({ deliveries: w })}><History size={14}/></button>
              <button className={clsx("btn btn-ghost btn-sm p-1.5", w.active ? "text-red-500" : "text-green-600")}
                title={w.active ? "Disattiva" : "Riattiva"} aria-label={w.active ? "Disattiva" : "Riattiva"}
                disabled={toggle.isPending} onClick={() => toggle.mutate(w)}><Power size={14}/></button>
              <button className="btn btn-ghost btn-sm p-1.5 text-red-500" title="Elimina" aria-label="Elimina"
                disabled={remove.isPending}
                onClick={() => { if (confirm(`Eliminare il webhook "${w.name}"?`)) remove.mutate(w.id); }}><Trash2 size={14}/></button>
            </div>
          </div>
        ))}
      </div>
      <AnimatePresence>
        {modal === "new" && <WebhookModal events={events} onClose={() => setModal(null)}/>}
        {modal?.deliveries && <DeliveriesModal webhook={modal.deliveries} onClose={() => setModal(null)}/>}
      </AnimatePresence>
    </section>
  );
}

export default function IntegrationsPage() {
  const { data: meta } = useQuery({
    queryKey: ["integrations", "meta"],
    queryFn: () => integrationsAPI.meta().then(r => r.data),
    staleTime: Infinity,
  });

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Integrazioni</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Collega il gestionale offerte o un ERP: leggono articoli e disponibilità, prenotano materiale per le offerte
          e ricevono notifiche. Indirizzo dell'API: <span className="font-mono">/api/v1</span> del backend.
        </p>
      </div>
      {meta && <KeysSection scopes={meta.scopes}/>}
      {meta && <WebhooksSection events={meta.events}/>}
    </div>
  );
}
