import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Trash2, CheckCheck, Trash, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";
import { notificationsAPI } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import clsx from "clsx";

const TYPE_ICON = { low_stock:"⚠️", movement:"📦", login:"🔐", system:"ℹ️", warning:"⚡" };

export default function NotificationsPage() {
  const qc = useQueryClient();
  const { setUnread } = useAuthStore();
  const [clearOpen, setClearOpen] = useState(false);
  const { data } = useQuery({ queryKey:["notifications"], queryFn: () => notificationsAPI.list().then(r=>r.data) });
  const readAll = useMutation({ mutationFn: () => notificationsAPI.readAll(), onSuccess: () => { qc.invalidateQueries({queryKey:["notifications"]}); setUnread(0); } });
  const del = useMutation({ mutationFn: id => notificationsAPI.delete(id), onSuccess: () => qc.invalidateQueries({queryKey:["notifications"]}) });
  const read = useMutation({ mutationFn: id => notificationsAPI.read(id), onSuccess: () => qc.invalidateQueries({queryKey:["notifications"]}) });
  const clear = useMutation({
    mutationFn: (opts) => notificationsAPI.clear(opts),
    onSuccess: (r) => { qc.invalidateQueries({queryKey:["notifications"]}); setUnread(0); toast.success(`${r.data?.deleted || 0} notifiche eliminate`); setClearOpen(false); },
    onError: (e) => toast.error(e.response?.data?.message || "Errore"),
  });
  const doClear = (opts, label) => { if (confirm(`Eliminare ${label}? L'operazione non è reversibile.`)) clear.mutate(opts); };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-white">Notifiche</h1><p className="text-sm text-gray-500 mt-0.5">{data?.unread||0} non lette</p></div>
        <div className="flex gap-2">
          {data?.unread > 0 && <button className="btn btn-md btn-secondary gap-2" onClick={() => readAll.mutate()}><CheckCheck size={14}/> Segna tutte lette</button>}
          {data?.notifications?.length > 0 && (
            <div className="relative">
              <button className="btn btn-md btn-secondary gap-2" onClick={() => setClearOpen(o => !o)}><Trash size={14}/> Pulisci <ChevronDown size={13}/></button>
              {clearOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setClearOpen(false)}/>
                  <div className="absolute right-0 mt-1 z-20 w-56 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-md shadow-modal py-1 text-sm">
                    <button className="w-full text-left px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800" onClick={() => doClear({ type:"login" }, "tutte le notifiche di accesso")}>🔐 Solo accessi</button>
                    <button className="w-full text-left px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800" onClick={() => doClear({ onlyRead:true }, "tutte le notifiche già lette")}>✓ Solo già lette</button>
                    <button className="w-full text-left px-4 py-2 text-red-500 hover:bg-gray-50 dark:hover:bg-gray-800" onClick={() => doClear({ type:"all" }, "TUTTE le notifiche")}>🗑 Tutte</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="space-y-2">
        {(data?.notifications||[]).map(n => (
          <div key={n._id} className={clsx("card p-4 flex items-start gap-3", !n.read && "border-l-2 border-l-(--brand-500)")}>
            <span className="text-xl shrink-0 mt-0.5">{TYPE_ICON[n.type]||"📢"}</span>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 dark:text-white text-sm">{n.title}</p>
              <p className="text-sm text-gray-500 mt-0.5">{n.message}</p>
              <p className="text-xs text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString("it-IT")}</p>
            </div>
            <div className="flex gap-1 shrink-0">
              {!n.read && <button className="btn btn-ghost btn-sm p-1.5 text-green-500" onClick={() => read.mutate(n._id)}><Check size={13}/></button>}
              <button className="btn btn-ghost btn-sm p-1.5 text-red-400" onClick={() => del.mutate(n._id)}><Trash2 size={13}/></button>
            </div>
          </div>
        ))}
        {!data?.notifications?.length && (
          <div className="card p-12 text-center">
            <Bell size={32} className="mx-auto text-gray-300 mb-3"/>
            <p className="text-gray-500 font-medium">Nessuna notifica</p>
          </div>
        )}
      </div>
    </div>
  );
}
