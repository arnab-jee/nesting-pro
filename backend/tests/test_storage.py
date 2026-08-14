from __future__ import annotations

import pytest

import storage


@pytest.fixture
def conn():
    connection = storage.get_connection(db_path=":memory:")
    yield connection
    connection.close()


def test_list_stock_boards_starts_empty(conn):
    assert storage.list_stock_boards(conn) == []


def test_create_and_list_stock_board(conn):
    board = storage.create_stock_board(conn, material="MDF", length=2440, width=1220, thickness=18, grain="none")
    assert board.id is not None
    listed = storage.list_stock_boards(conn)
    assert listed == [board]


def test_create_stock_board_defaults_grain_to_none(conn):
    board = storage.create_stock_board(conn, material="MDF", length=2440, width=1220, thickness=18)
    assert board.grain == "none"


def test_update_stock_board(conn):
    board = storage.create_stock_board(conn, material="MDF", length=2440, width=1220, thickness=18)
    updated = storage.update_stock_board(conn, board.id, material="MDF", length=2440, width=1220, thickness=25, grain="length")
    assert updated.thickness == 25
    assert updated.grain == "length"
    assert storage.list_stock_boards(conn) == [updated]


def test_update_nonexistent_stock_board_returns_none(conn):
    assert storage.update_stock_board(conn, 999, material="MDF", length=1, width=1, thickness=1, grain="none") is None


def test_delete_stock_board(conn):
    board = storage.create_stock_board(conn, material="MDF", length=2440, width=1220, thickness=18)
    assert storage.delete_stock_board(conn, board.id) is True
    assert storage.list_stock_boards(conn) == []


def test_delete_nonexistent_stock_board_returns_false(conn):
    assert storage.delete_stock_board(conn, 999) is False


def test_waste_strategy_default_starts_balanced(conn):
    assert storage.get_waste_strategy_default(conn) == "balanced"


def test_set_and_get_waste_strategy_default(conn):
    assert storage.set_waste_strategy_default(conn, "edge") == "edge"
    assert storage.get_waste_strategy_default(conn) == "edge"


def test_set_waste_strategy_default_twice_overwrites(conn):
    storage.set_waste_strategy_default(conn, "edge")
    storage.set_waste_strategy_default(conn, "balanced")
    assert storage.get_waste_strategy_default(conn) == "balanced"


def test_set_invalid_waste_strategy_raises(conn):
    with pytest.raises(ValueError):
        storage.set_waste_strategy_default(conn, "not-a-real-strategy")
