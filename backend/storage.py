from __future__ import annotations
import os
import sqlite3
from dataclasses import dataclass

# Updates/update_004.md, scoped down via discussion before implementing (see CLAUDE.md):
# SQLite, single-tenant, no auth/login yet — this pass only persists Stock Boards and a
# Waste Placement default. Auth/tenancy/machine-availability/schema-template renaming are
# explicitly deferred to a later pass.

DB_PATH = os.environ.get("NESTING_PRO_DB_PATH", os.path.join(os.path.dirname(__file__), "nesting_pro.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS stock_boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material TEXT NOT NULL,
    length REAL NOT NULL,
    width REAL NOT NULL,
    thickness REAL NOT NULL,
    grain TEXT NOT NULL DEFAULT 'none'
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""

WASTE_STRATEGY_DEFAULT_KEY = "wasteStrategyDefault"
DEFAULT_WASTE_STRATEGY = "balanced"
VALID_WASTE_STRATEGIES = ("balanced", "edge")


def get_connection(db_path: str | None = None) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path or DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


@dataclass
class PersistedStockBoard:
    id: int
    material: str
    length: float
    width: float
    thickness: float
    grain: str


def list_stock_boards(conn: sqlite3.Connection) -> list[PersistedStockBoard]:
    rows = conn.execute(
        "SELECT id, material, length, width, thickness, grain FROM stock_boards ORDER BY id"
    ).fetchall()
    return [PersistedStockBoard(**dict(row)) for row in rows]


def create_stock_board(
    conn: sqlite3.Connection, material: str, length: float, width: float, thickness: float, grain: str = "none"
) -> PersistedStockBoard:
    cur = conn.execute(
        "INSERT INTO stock_boards (material, length, width, thickness, grain) VALUES (?, ?, ?, ?, ?)",
        (material, length, width, thickness, grain),
    )
    conn.commit()
    return PersistedStockBoard(id=cur.lastrowid, material=material, length=length, width=width, thickness=thickness, grain=grain)


def update_stock_board(
    conn: sqlite3.Connection, board_id: int, material: str, length: float, width: float, thickness: float, grain: str
) -> PersistedStockBoard | None:
    cur = conn.execute(
        "UPDATE stock_boards SET material=?, length=?, width=?, thickness=?, grain=? WHERE id=?",
        (material, length, width, thickness, grain, board_id),
    )
    conn.commit()
    if cur.rowcount == 0:
        return None
    return PersistedStockBoard(id=board_id, material=material, length=length, width=width, thickness=thickness, grain=grain)


def delete_stock_board(conn: sqlite3.Connection, board_id: int) -> bool:
    cur = conn.execute("DELETE FROM stock_boards WHERE id=?", (board_id,))
    conn.commit()
    return cur.rowcount > 0


def get_waste_strategy_default(conn: sqlite3.Connection) -> str:
    row = conn.execute("SELECT value FROM settings WHERE key=?", (WASTE_STRATEGY_DEFAULT_KEY,)).fetchone()
    return row["value"] if row else DEFAULT_WASTE_STRATEGY


def set_waste_strategy_default(conn: sqlite3.Connection, value: str) -> str:
    if value not in VALID_WASTE_STRATEGIES:
        raise ValueError(f"invalid waste strategy: {value!r} (must be one of {VALID_WASTE_STRATEGIES})")
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (WASTE_STRATEGY_DEFAULT_KEY, value),
    )
    conn.commit()
    return value
