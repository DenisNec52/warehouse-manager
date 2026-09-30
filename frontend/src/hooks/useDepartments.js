/**
 * hooks/useDepartments.js — reparti visibili all'utente + reparto selezionato
 *
 * Il filtro vero lo applica il backend; qui serve per i menu. Il reparto scelto
 * viene ricordato per pagina (localStorage), e di default è il primo del gruppo dell'utente.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { departmentsAPI } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

export function useDepartmentList() {
  return useQuery({
    queryKey: ["departments"],
    queryFn: () => departmentsAPI.list().then(r => r.data.departments),
    staleTime: 5 * 60_000,
  });
}

/** Reparti attivi che l'utente può vedere (tutti per admin/supervisore o se non assegnato). */
export function useVisibleDepartments() {
  const { user } = useAuthStore();
  const { data: all = [], isLoading } = useDepartmentList();
  const visible = useMemo(() => {
    const ids = user?.visibleDepartmentIds;
    const active = all.filter(d => d.isActive);
    if (!ids) return active;
    // Prima i reparti del gruppo dell'utente, nell'ordine configurato
    return active.filter(d => ids.includes(d._id));
  }, [all, user?.visibleDepartmentIds]);
  return { departments: visible, all, isLoading };
}

const storageKey = (scope) => `wh-department:${scope}`;
function readStored(scope) {
  try { return localStorage.getItem(storageKey(scope)); } catch { return null; }
}

/** Reparto selezionato per una pagina (scope), sempre tra quelli visibili. */
export function useSelectedDepartment(scope) {
  const { user } = useAuthStore();
  const { departments, isLoading } = useVisibleDepartments();
  const [selected, setSelected] = useState(() => readStored(scope));

  useEffect(() => {
    if (!departments.length) return;
    if (departments.some(d => d._id === selected)) return;
    // Default: primo reparto del gruppo dell'utente, altrimenti il primo visibile
    const mine = departments.find(d => (user?.departments || []).map(String).includes(d._id));
    setSelected((mine || departments[0])._id);
  }, [departments, selected, user?.departments]);

  const select = (id) => {
    setSelected(id);
    try { localStorage.setItem(storageKey(scope), id); } catch { /* storage non disponibile */ }
  };

  const department = departments.find(d => d._id === selected) || null;
  return { departments, department, departmentId: department?._id || null, select, isLoading };
}
