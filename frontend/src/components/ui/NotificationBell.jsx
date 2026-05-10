/**
 * components/ui/NotificationBell.jsx
 *
 * Campanellina con badge notifiche non lette.
 * Click → naviga alla pagina notifiche.
 */
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/lib/store";

export default function NotificationBell() {
  const { unread } = useAuthStore();
  const nav = useNavigate();

  return (
    <button className="btn btn-ghost btn-sm p-2 relative rounded-[var(--radius-sm)]"
      onClick={() => nav("/notifications")} title="Notifiche">
      <Bell size={16}/>
      {unread > 0 && (
        <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}
