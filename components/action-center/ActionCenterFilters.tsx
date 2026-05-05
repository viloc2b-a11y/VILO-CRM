"use client";

import { cn } from "@/lib/cn";
import { useEffect, useRef, useState } from "react";

export type ActionCenterFilterValues = {
  bu: string;
  priority: string;
  status: string;
  search: string;
};

export const ACTION_CENTER_FILTERS_DEFAULT: ActionCenterFilterValues = {
  bu: "all",
  priority: "all",
  status: "pending",
  search: "",
};

const DEBOUNCE_MS = 300;

export type ActionCenterFiltersProps = {
  onChange: (filters: ActionCenterFilterValues) => void;
  className?: string;
  /** Si se define, el selector de UE se oculta y este valor se envía en `onChange`. */
  externalBu?: string;
  /** Con `externalBu`, "Limpiar" delega aquí (p. ej. resetear UE a `all` en el padre). */
  onClearAll?: () => void;
  /** Valor inicial del buscador (`?search=` o `?record=` desde enlaces externos). */
  initialSearch?: string;
};

/**
 * Filtros del Action Center. Notifica `onChange` con debounce 300ms cuando
 * cambia cualquier campo; "Limpiar" notifica al instante.
 * Estado inicial: pendientes (`status: pending`), sin búsqueda.
 */
export default function ActionCenterFilters({
  onChange,
  className,
  externalBu,
  onClearAll,
  initialSearch = "",
}: ActionCenterFiltersProps) {
  const [internalBu, setInternalBu] = useState(ACTION_CENTER_FILTERS_DEFAULT.bu);
  const [priority, setPriority] = useState(ACTION_CENTER_FILTERS_DEFAULT.priority);
  const [status, setStatus] = useState(ACTION_CENTER_FILTERS_DEFAULT.status);
  const [search, setSearch] = useState(() => initialSearch.trim());

  const bu = externalBu !== undefined ? externalBu : internalBu;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onChangeRef.current({ bu, priority, status, search });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [bu, priority, status, search]);

  function clearFilters() {
    const next = { ...ACTION_CENTER_FILTERS_DEFAULT };
    if (externalBu !== undefined) {
      onClearAll?.();
      setPriority(next.priority);
      setStatus(next.status);
      setSearch(next.search);
      onChangeRef.current({ ...next });
      return;
    }
    setInternalBu(next.bu);
    setPriority(next.priority);
    setStatus(next.status);
    setSearch(next.search);
    onChangeRef.current(next);
  }

  return (
    <div
      className={cn(
        "mb-4 grid grid-cols-1 gap-3 rounded-lg border border-clinical-line bg-clinical-paper p-4",
        externalBu !== undefined ? "md:grid-cols-3" : "md:grid-cols-4",
        className
      )}
    >
      {externalBu === undefined ? (
        <select
          value={internalBu}
          onChange={(e) => setInternalBu(e.target.value)}
          className="rounded-lg border border-clinical-line bg-white px-3 py-2 text-sm text-clinical-ink shadow-sm outline-none focus:border-vilo-400 focus:ring-2 focus:ring-vilo-200"
        >
          <option value="all">Todas las UEs</option>
          <option value="vilo_research">Vilo Research</option>
          <option value="vitalis">Vitalis</option>
          <option value="hazloasiya">HazloAsíYa</option>
        </select>
      ) : null}

      <select
        value={priority}
        onChange={(e) => setPriority(e.target.value)}
        className="rounded-lg border border-clinical-line bg-white px-3 py-2 text-sm text-clinical-ink shadow-sm outline-none focus:border-vilo-400 focus:ring-2 focus:ring-vilo-200"
      >
        <option value="all">Todas las prioridades</option>
        <option value="critical">🔴 Crítica</option>
        <option value="high">🟠 Alta</option>
        <option value="medium">🟡 Media</option>
        <option value="low">🟢 Baja</option>
      </select>

      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="rounded-lg border border-clinical-line bg-white px-3 py-2 text-sm text-clinical-ink shadow-sm outline-none focus:border-vilo-400 focus:ring-2 focus:ring-vilo-200"
      >
        <option value="pending">⏳ Pendientes</option>
        <option value="overdue">🚨 Vencidos</option>
        <option value="in_progress">🔄 En progreso</option>
      </select>

      <div className="flex gap-2 md:col-span-1">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por título o registro…"
          className="min-w-0 flex-1 rounded-lg border border-clinical-line bg-white px-3 py-2 text-sm text-clinical-ink shadow-sm outline-none placeholder:text-clinical-muted/70 focus:border-vilo-400 focus:ring-2 focus:ring-vilo-200"
          type="search"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={clearFilters}
          className="shrink-0 rounded-lg border border-clinical-line bg-white px-3 py-2 text-sm font-medium text-clinical-ink hover:bg-vilo-50"
        >
          Limpiar
        </button>
      </div>
    </div>
  );
}
