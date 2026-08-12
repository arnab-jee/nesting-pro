from __future__ import annotations
from dataclasses import dataclass, field
from typing import Literal, Optional, TypedDict

Grain = Literal["none", "length", "width"]
Orientation = Literal["horizontal", "vertical"]
TargetMachine = Literal["saw", "nanxing"]

class EdgeSet(TypedDict):
    l1: str
    l2: str
    w1: str
    w2: str

@dataclass
class Part:
    id: str
    posId: str
    name: str
    cutLength: float
    cutWidth: float
    finishedLength: float
    finishedWidth: float
    thickness: float
    qty: int
    material: str
    grain: Grain
    edges: EdgeSet
    faceTop: Optional[str] = None
    faceBottom: Optional[str] = None
    core: Optional[str] = None
    customer: Optional[str] = None

    def area(self) -> float:
        return self.cutLength * self.cutWidth

    def can_rotate(self) -> bool:
        return self.grain == "none"

@dataclass
class StockBoard:
    material: str
    length: float
    width: float
    thickness: float
    grain: Grain = "none"

@dataclass
class Margin:
    top: float
    right: float
    bottom: float
    left: float

@dataclass
class OptRequest:
    parts: list[Part]
    stock: list[StockBoard]
    kerf: float
    toolDiameter: float
    partSpacing: float
    margin: Margin
    allowRotation: bool
    target: TargetMachine

@dataclass
class PlacedPart:
    partId: str
    x: float
    y: float
    rotated: bool
    w: float
    h: float
    name: str
    material: str
    thickness: float
    grain: Grain

@dataclass
class Offcut:
    x: float
    y: float
    w: float
    h: float

@dataclass
class Sheet:
    index: int
    material: str
    boardL: float
    boardW: float
    thickness: float
    placed: list[PlacedPart]
    offcuts: list[Offcut]
    utilizationPct: float

@dataclass
class CutInstruction:
    orientation: Orientation
    offset: float
    length: float
    sheetIndex: int

@dataclass
class OptResult:
    sheets: list[Sheet]
    unplaced: list[Part]
    cuts: list[CutInstruction] = field(default_factory=list)
