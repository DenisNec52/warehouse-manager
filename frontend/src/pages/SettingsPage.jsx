import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Eye, EyeOff, Nfc, Mail, Pencil, Check, X } from "lucide-react";
import { authAPI } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import BadgeManager from "@/components/ui/BadgeManager";
import toast from "react-hot-toast";

function EmailField({ user, setUser }) {
  const [editing, setEditing] = useState(false);
  const [value,   setValue]   = useState(user?.email || "");

  const mut = useMutation({
    mutationFn: (email) => authAPI.updateEmail(email),
    onSuccess: (res) => {
      setUser({ ...user, email: res.data.email });
      toast.success("Email aggiornata");
      setEditing(false);
    },
    onError: e => toast.error(e.response?.data?.message || "Errore"),
  });

  if (!editing) {
    return (
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <Mail size={14} className="text-gray-400"/>
          {user?.email || <span className="text-gray-400 italic">Nessuna email configurata</span>}
        </div>
        <button type="button" className="btn btn-ghost btn-sm p-1.5" title="Modifica email"
          onClick={() => { setValue(user?.email || ""); setEditing(true); }}>
          <Pencil size={13}/>
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
      <input className="form-input text-sm" type="email" placeholder="tua@email.com" autoFocus
        value={value} onChange={e => setValue(e.target.value)}/>
      <button type="button" className="btn btn-sm btn-primary p-2" disabled={mut.isPending || !value.trim()}
        onClick={() => mut.mutate(value.trim())}>
        <Check size={14}/>
      </button>
      <button type="button" className="btn btn-sm btn-secondary p-2" onClick={() => setEditing(false)}>
        <X size={14}/>
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const { user, setUser } = useAuthStore();
  const [form, setForm] = useState({ currentPassword:"", newPassword:"", confirm:"" });
  const [show, setShow] = useState(false);
  const mut = useMutation({
    mutationFn: d => authAPI.password(d),
    onSuccess: () => { toast.success("Password aggiornata"); setForm({currentPassword:"",newPassword:"",confirm:""}); },
    onError: e => toast.error(e.response?.data?.message || "Errore"),
  });
  const handlePw = e => {
    e.preventDefault();
    if (form.newPassword !== form.confirm) { toast.error("Le password non coincidono"); return; }
    mut.mutate({ currentPassword: form.currentPassword, newPassword: form.newPassword });
  };
  return (
    <div>
      <div className="mb-6"><h1 className="text-xl font-bold text-gray-900 dark:text-white">Impostazioni</h1></div>
      <div className="max-w-lg space-y-4">
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Profilo</h3>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-[var(--brand-500)] flex items-center justify-center text-white text-lg font-bold">{user?.name?.charAt(0)}</div>
            <div><p className="font-medium text-gray-900 dark:text-white">{user?.name}</p><p className="text-sm text-gray-500">{user?.username} · {user?.role}</p></div>
          </div>
          <EmailField user={user} setUser={setUser}/>
          <p className="text-xs text-gray-400 mt-2">Serve solo per "password dimenticata" — senza email dovrai rivolgerti a un admin se resti fuori.</p>
        </div>
        <BadgeManager
          badgeEnabled={user?.badgeEnabled}
          badgeIssuedAt={user?.badgeIssuedAt}
          onRegenerate={() => authAPI.regenerateBadge()}
          onToggle={(enabled) => authAPI.badgeStatus(enabled)}
          onRevoke={() => authAPI.revokeBadge()}
        />

        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Nfc size={16}/> Come programmare un tag NFC
          </h3>
          <ol className="text-sm text-gray-600 dark:text-gray-300 space-y-2 list-decimal list-inside">
            <li>Genera il badge qui sopra e copia il "Link da scrivere sul tag NFC".</li>
            <li>Installa un'app di scrittura NFC sullo smartphone: ad es. <strong>NFC Tools</strong> (gratuita, Android e iOS) oppure <strong>NFC TagWriter by NXP</strong>.</li>
            <li>Apri l'app → sezione <em>Scrivi</em> (Write) → aggiungi un record → scegli il tipo <strong>URL / URI</strong> (non "Testo" e non "Contatto").</li>
            <li>Incolla il link copiato, conferma e avvicina il telefono al tag NFC per scriverlo. Serve un tag vergine tipo NTAG213/215/216 (i più comuni, in vendita online a pochi centesimi l'uno).</li>
            <li>Testa subito: allontana e riavvicina il telefono al tag. Il browser deve aprirsi da solo su quel link ed effettuare l'accesso.</li>
          </ol>
          <p className="text-xs text-gray-400 mt-3">
            Non serve nessun tool oltre all'app: il tag va scritto una sola volta con un record NDEF di tipo URI,
            esattamente come si farebbe con un biglietto da visita "smart" o un cartellino di un varco. Se in
            futuro rigeneri il badge, il tag va riscritto con il nuovo link (quello vecchio smette subito di
            funzionare).
          </p>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Cambia password</h3>
          <form onSubmit={handlePw} className="space-y-3">
            {[["currentPassword","Password attuale"],["newPassword","Nuova password"],["confirm","Conferma password"]].map(([k,l]) => (
              <div key={k}>
                <label className="form-label">{l}</label>
                <div className="relative">
                  <input className="form-input pr-10" type={show?"text":"password"} value={form[k]} onChange={e => setForm(f=>({...f,[k]:e.target.value}))}/>
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" onClick={() => setShow(v=>!v)}>{show?<EyeOff size={14}/>:<Eye size={14}/>}</button>
                </div>
              </div>
            ))}
            <button type="submit" className="btn btn-md btn-primary w-full" disabled={mut.isPending}>{mut.isPending?"Aggiornamento...":"Aggiorna password"}</button>
          </form>
        </div>
      </div>
    </div>
  );
}
