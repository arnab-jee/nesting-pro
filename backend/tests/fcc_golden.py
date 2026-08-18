from __future__ import annotations
from pathlib import Path

from optimizer.import_xml import parse_fcc_xml


def load_golden_fcc(path: Path):
    """Parse a real machine-cut FccRoot XML directly into exporter inputs (parts_by_id,
    OptResult, margin, tool_diameter, part_spacing), bypassing the optimizer entirely.
    This exists purely to drive the round-trip fidelity test (spec §7.1): the geometry
    and metadata come straight from the golden file, so feeding them back into
    generate_fcc_xml tests the *serializer*, not the nesting algorithm.

    Thin wrapper around optimizer/import_xml.py's parse_fcc_xml — the same parser behind the
    real "import an existing Nanxing XML" feature (Updates/update_006.md) — kept here as a
    separate entry point only because callers expect this specific 5-tuple shape rather than
    the ImportedJob dataclass parse_fcc_xml returns.
    """
    job = parse_fcc_xml(path.read_bytes())
    return job.parts_by_id, job.result, job.margin, job.tool_diameter, job.part_spacing
