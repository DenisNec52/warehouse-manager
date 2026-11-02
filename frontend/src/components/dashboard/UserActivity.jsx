/**
 * components/dashboard/UserActivity.jsx — movimenti per utente (solo admin), sugli ultimi 200.
 */
import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { movementsAPI, usersAPI } from "@/lib/api";

export default function UserActivity() {
  const { data: movData } = useQuery({
    queryKey: ["movements-activity"],
    queryFn: () => movementsAPI.list({ limit: 200 }).then((r) => r.data),
  });
  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: () => usersAPI.list().then((r) => r.data.users),
  });

  const byUser = {};
  (movData?.movements || []).forEach((m) => {
    const name = m.performedBy?.name || m.performedByName || "Sconosciuto";
    const a = (byUser[name] ??= { name, total: 0, IN: 0, OUT: 0, lastSeen: null });
    a.total++; a[m.type]++;
    if (!a.lastSeen || m.createdAt > a.lastSeen) a.lastSeen = m.createdAt;
  });
  const activity = Object.values(byUser).sort((a, b) => b.total - a.total);
  const maxTotal = Math.max(...activity.map((a) => a.total), 1);
  const activeNames = new Set(activity.map((a) => a.name));
  const inactive = (usersData || []).filter((u) => u.isActive && !activeNames.has(u.name));

  return (
    <div className="card">
      <div className="flex items-center gap-2 px-5 h-14 border-b border-gray-100 dark:border-white/6">
        <Activity size={16} className="text-(--brand-500)"/>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Utilizzo per utente</h2>
        <span className="text-xs text-gray-400 ml-auto">ultimi 200 movimenti</span>
      </div>
      <div className="p-5 space-y-4">
        {activity.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Nessun movimento registrato</p>}
        {activity.map((a) => (
          <div key={a.name}>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-7 h-7 rounded-full bg-(--brand-50) text-(--brand-600) flex items-center justify-center text-xs font-bold shrink-0">
                {a.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{a.name}</span>
              <span className="ml-auto flex items-center gap-3 text-xs tabular-nums">
                <span className="text-emerald-600 font-semibold">↓{a.IN}</span>
                <span className="text-rose-500 font-semibold">↑{a.OUT}</span>
                <span className="text-gray-400 hidden sm:inline">{a.lastSeen ? new Date(a.lastSeen).toLocaleDateString("it-IT") : "—"}</span>
              </span>
            </div>
            <div className="h-1.5 bg-gray-100 dark:bg-white/6 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-(--brand-500) transition-all duration-700"
                style={{ width: `${Math.round((a.total / maxTotal) * 100)}%` }}/>
            </div>
          </div>
        ))}
        {inactive.length > 0 && (
          <div className="pt-4 border-t border-gray-100 dark:border-white/6">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Nessuna attività</p>
            <div className="flex flex-wrap gap-1.5">
              {inactive.map((u) => <span key={u._id} className="badge-gray">{u.name}</span>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
