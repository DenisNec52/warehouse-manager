import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { authAPI } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import toast from "react-hot-toast";

export default function SettingsPage() {
  const { user } = useAuthStore();
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
