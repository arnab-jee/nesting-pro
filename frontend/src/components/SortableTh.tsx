interface Props {
  label: string;
  sortKey: string;
  activeKey: string | null;
  dir: 1 | -1;
  onSort: (key: string) => void;
}

export function SortableTh({ label, sortKey, activeKey, dir, onSort }: Props) {
  const active = sortKey === activeKey;
  return (
    <th className="th-sortable" onClick={() => onSort(sortKey)} aria-sort={active ? (dir === 1 ? "ascending" : "descending") : "none"}>
      {label}
      <span className="th-sortable__arrow">{active ? (dir === 1 ? " ▲" : " ▼") : ""}</span>
    </th>
  );
}
