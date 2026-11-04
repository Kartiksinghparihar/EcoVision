
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


# All animal classes supported by the wildlife model.
# Tiger is included in the schema, but must only come
# from the dedicated tiger model in inference.py.

SpeciesId = Literal[
    "tiger",
    "zebra",
    "lion",
    "leopard",
    "cheetah",
    "bear",
    "butterfly",
    "canary",
    "crocodile",
    "bull",
    "camel",
    "centipede",
    "caterpillar",
    "duck",
    "squirrel",
    "spider",
    "ladybug",
    "elephant",
    "horse",
    "fox",
    "tortoise",
    "frog",
    "kangaroo",
    "deer",
    "eagle",
    "monkey",
    "snake",
    "owl",
    "swan",
    "goat",
    "rabbit",
    "giraffe",
    "goose",
    "polar_bear",
    "raven",
    "hippopotamus",
    "brown_bear",
    "rhinoceros",
    "woodpecker",
    "sheep",
    "magpie",
    "ostrich",
    "jaguar",
    "hedgehog",
    "turkey",
    "raccoon",
    "worm",
    "panda",
    "red_panda",
    "otter",
    "lynx",
    "scorpion",
    "koala",
    "unknown",
]


PRIORITY = {"tiger", "leopard", "dhole"}


class DetectionEvent(BaseModel):
    """Payload published by the edge device."""

    device_id: str = Field(
        min_length=3,
        max_length=64,
        pattern=r"^[a-z0-9_-]+$"
    )

    species: SpeciesId

    confidence: float = Field(ge=0, le=1)

    timestamp: datetime

    temperature: Optional[float] = Field(
        default=None,
        ge=-20,
        le=60
    )

    humidity: Optional[float] = Field(
        default=None,
        ge=0,
        le=100
    )

    motion_detected: bool = True

    bbox: Optional[list[float]] = None

    clip_id: Optional[str] = None

    @field_validator("bbox")
    @classmethod
    def check_bbox(cls, value):
        if value is not None:
            if len(value) != 4 or any(
                not 0 <= coordinate <= 1
                for coordinate in value
            ):
                raise ValueError(
                    "bbox must be 4 normalised floats"
                )

        return value


class SensorEvent(BaseModel):
    device_id: str
    timestamp: datetime

    temperature: Optional[float] = None
    humidity: Optional[float] = None

    motion_detected: bool = False


class StatusEvent(BaseModel):
    device_id: str

    state: Literal[
        "offline",
        "idle",
        "recording",
        "live"
    ]

    battery: Optional[int] = None
    signal: Optional[int] = None
    storage_pct: Optional[float] = None

    buffered_events: int = 0
