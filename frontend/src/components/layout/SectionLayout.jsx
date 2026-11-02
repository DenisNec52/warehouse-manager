/**
 * components/layout/SectionLayout.jsx
 *
 * Contenitore di una sezione (Magazzino, Produzione, ...): mostra le schede se sono più
 * di una e sotto la pagina corrente. L'indicatore scivola con una transizione CSS
 * (LazyMotion carica solo domAnimation, che non comprende le animazioni layoutId).
 */
import { useLayoutEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import clsx from "clsx";
import { useAuthStore } from "@/lib/store";
import { SECTIONS, canSeeTab, tabMatches } from "@/lib/navigation";

export default function SectionLayout({ section }) {
  const { user, settings } = useAuthStore();
  const { pathname } = useLocation();
  const tabs = SECTIONS.find((s) => s.id === section)?.tabs.filter((t) => canSeeTab(t, user, settings)) ?? [];
  const barRef = useRef(null);
  const [indicator, setIndicator] = useState(null);

  const activeIndex = tabs.findIndex((t) => tabMatches(t, pathname));

  useLayoutEffect(() => {
    const el = barRef.current?.querySelectorAll("[data-tab]")[activeIndex];
    if (!el) { setIndicator(null); return; }
    setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeIndex, tabs.length]);

  return (
    <>
      {tabs.length > 1 && (
        <div ref={barRef} role="tablist"
          className="relative flex gap-1 mb-6 -mx-1 px-1 overflow-x-auto border-b border-gray-200 dark:border-white/8 [scrollbar-width:none]">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.exact} data-tab role="tab"
              aria-selected={tabMatches(t, pathname)}
              className={({ isActive }) => clsx(
                "relative px-4 h-11 flex items-center text-sm font-semibold whitespace-nowrap transition-colors",
                isActive || tabMatches(t, pathname)
                  ? "text-gray-900 dark:text-white"
                  : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
              )}>
              {t.label}
            </NavLink>
          ))}
          {indicator && (
            <span aria-hidden className="absolute bottom-0 h-0.5 rounded-full bg-(--brand-500) transition-all duration-300 ease-out"
              style={{ left: indicator.left, width: indicator.width }}/>
          )}
        </div>
      )}
      <Outlet/>
    </>
  );
}
