/**
 * pages/HomePage.jsx — Scelta tra Magazzino e 5S
 */
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Package, ClipboardCheck } from "lucide-react";
import { useAuthStore } from "@/lib/store";

export default function HomePage() {
  const { user } = useAuthStore();
  const nav = useNavigate();

  const cards = [
    {
      title: "Magazzino",
      desc:  "Gestisci prodotti, registra entrate e uscite, visualizza lo storico movimenti.",
      icon:  Package,
      color: "#3b82f6",
      path:  "/warehouse",
      emoji: "📦",
    },
    {
      title: "Pulizia 5S",
      desc:  "Compila la checklist di autovalutazione 5S a fine turno.",
      icon:  ClipboardCheck,
      color: "#10b981",
      path:  "/checklist",
      emoji: "🧹",
    },
  ];

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center py-12">
      <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} className="text-center mb-10">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Ciao, {user?.name?.split(" ")[0]} 👋
        </h1>
        <p className="text-gray-500 dark:text-gray-400">Cosa vuoi fare oggi?</p>
      </motion.div>

      <div className="grid sm:grid-cols-2 gap-5 w-full max-w-xl px-4">
        {cards.map((c, i) => (
          <motion.button key={c.title}
            initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ delay: i * 0.1 }}
            onClick={() => nav(c.path)}
            className="card p-8 text-left hover:shadow-card-hover hover:-translate-y-1 transition-all duration-200 group cursor-pointer">
            <div className="w-14 h-14 rounded-[var(--radius)] flex items-center justify-center text-3xl mb-4 transition-transform group-hover:scale-110"
              style={{ background: c.color + "20" }}>
              {c.emoji}
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{c.title}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{c.desc}</p>
            <div className="mt-4 text-sm font-semibold flex items-center gap-1" style={{ color: c.color }}>
              Vai → 
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
