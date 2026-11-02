/**
 * components/layout/CommandPalette.jsx — ricerca rapida (Ctrl+K / ⌘K).
 *
 * Trova pagine (solo quelle visibili all'utente) e articoli di magazzino; frecce + Invio
 * per aprire, Esc per chiudere. La ricerca articoli parte a fine digitazione (debounce).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { m as motion } from "framer-motion";
import { Search, CornerDownLeft, Package, Moon, Sun } from "lucide-react";
import clsx from "clsx";
import { productsAPI } from "@/lib/api";
import { useAuthStore, useThemeStore } from "@/lib/store";
import { visibleSections } from "@/lib/navigation";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function CommandPalette({ onClose }) {
  const nav = useNavigate();
  const { user, settings } = useAuthStore();
  const { mode, setMode } = useThemeStore();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const q = useDebouncedValue(query.trim(), 250);

  const { data: products = [], isFetching } = useQuery({
    queryKey: ["palette-products", q],
    queryFn: () => productsAPI.list({ search: q, limit: 6 }).then((r) => r.data.products || []),
    enabled: q.length > 1,
    staleTime: 30_000,
  });

  const items = useMemo(() => {
    const needle = norm(query.trim());
    const pages = visibleSections(user, settings).flatMap((s) =>
      s.tabs.map((t) => ({
        id: "p" + t.to, group: "Pagine", icon: s.icon,
        title: s.tabs.length > 1 ? `${s.label} · ${t.label}` : s.label,
        run: () => nav(t.to),
      })))
      .filter((p) => !needle || norm(p.title).includes(needle));
    const actions = [{
      id: "theme", group: "Azioni", icon: mode === "dark" ? Sun : Moon,
      title: mode === "dark" ? "Passa al tema chiaro" : "Passa al tema scuro",
      run: () => setMode(mode === "dark" ? "light" : "dark"),
    }].filter((a) => !needle || norm(a.title).includes(needle));
    const found = (q.length > 1 ? products : []).map((p) => ({
      id: "a" + p._id, group: "Articoli", icon: Package,
      title: p.name, sub: `${p.code} · ${p.quantity} ${p.unit || ""}`.trim(),
      low: p.quantity <= p.minQuantity,
      run: () => nav(`/products/${p._id}`),
    }));
    return [...found, ...pages, ...actions];
  }, [query, q, products, user, settings, mode, nav, setMode]);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (item) => { if (!item) return; onClose(); item.run(); };

  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(items[active]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  let lastGroup = null;
  return (
    <motion.div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-gray-950/40 backdrop-blur-sm" onClick={onClose}/>
      <motion.div role="dialog" aria-modal="true" aria-label="Ricerca rapida"
        className="relative w-full max-w-xl card shadow-modal overflow-hidden"
        initial={{ opacity: 0, y: -12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }} transition={{ duration: 0.16 }}>
        <div className="flex items-center gap-3 px-4 border-b border-gray-100 dark:border-white/8">
          <Search size={18} className={clsx("shrink-0", isFetching ? "text-(--brand-500) animate-pulse" : "text-gray-400")}/>
          <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey}
            placeholder="Cerca un articolo, una pagina…" aria-label="Cerca"
            className="flex-1 h-14 bg-transparent outline-hidden text-[15px] text-gray-900 dark:text-white placeholder:text-gray-400"/>
          <span className="kbd">Esc</span>
        </div>
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
          {items.length === 0 && (
            <p className="py-10 text-center text-sm text-gray-400">
              {q.length > 1 && isFetching ? "Ricerca…" : "Nessun risultato"}
            </p>
          )}
          {items.map((it, i) => {
            const Icon = it.icon;
            const header = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <div key={it.id}>
                {header && <p className="px-3 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{header}</p>}
                <button data-index={i} onMouseMove={() => setActive(i)} onClick={() => choose(it)}
                  className={clsx("w-full flex items-center gap-3 px-3 h-12 rounded-(--radius) text-left transition-colors",
                    i === active ? "bg-(--brand-50) text-(--brand-600)" : "text-gray-700 dark:text-gray-300")}>
                  <Icon size={17} className="shrink-0 opacity-80"/>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{it.title}</span>
                    {it.sub && <span className={clsx("block text-xs truncate", it.low ? "text-red-500" : "text-gray-400")}>{it.sub}</span>}
                  </span>
                  {i === active && <CornerDownLeft size={14} className="shrink-0 opacity-60"/>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="hidden sm:flex items-center gap-4 px-4 h-10 border-t border-gray-100 dark:border-white/8 text-[11px] text-gray-400">
          <span className="flex items-center gap-1.5"><span className="kbd">↑</span><span className="kbd">↓</span> scegli</span>
          <span className="flex items-center gap-1.5"><span className="kbd">↵</span> apri</span>
        </div>
      </motion.div>
    </motion.div>
  );
}
