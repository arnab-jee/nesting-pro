import { useMemo, useState } from "react";

interface Options<T> {
  searchText: (row: T) => string;
  sorters: Record<string, (a: T, b: T) => number>;
}

// Shared by the unplaced-parts table (Summary.tsx) and the Stock Board Library table — both
// need the same free-text search + click-to-sort behavior, which gets unwieldy at real job
// sizes (a 656-part job's unplaced table, for one). Reused rather than duplicated since both
// consumers already exist today, not a hypothetical third one.
export function useTableControls<T>(rows: T[], { searchText, sorters }: Options<T>) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(1);
    }
  }

  const rows_ = useMemo(() => {
    let out = rows;
    const q = query.trim().toLowerCase();
    if (q) {
      out = out.filter((r) => searchText(r).toLowerCase().includes(q));
    }
    if (sortKey && sorters[sortKey]) {
      const compare = sorters[sortKey];
      out = [...out].sort((a, b) => compare(a, b) * sortDir);
    }
    return out;
  }, [rows, query, sortKey, sortDir, searchText, sorters]);

  return { query, setQuery, rows: rows_, sortKey, sortDir, toggleSort };
}
