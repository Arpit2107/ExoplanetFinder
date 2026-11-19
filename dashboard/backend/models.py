"""
Pydantic models for the Exoplanet Finder dashboard API.
All numbers come from real exported artifacts. No placeholders.
"""
from typing import Optional, List, Literal
from pydantic import BaseModel, Field, ConfigDict


class HealthResponse(BaseModel):
    status: Literal["ok"]
    message: str


class SummaryMetrics(BaseModel):
    """Headline TEST metrics for CNN and baseline."""
    test_cnn_auc: float
    test_cnn_ap: float
    test_cnn_precision: float
    test_cnn_recall: float
    test_cnn_threshold: float
    test_cnn_n_samples: int
    test_cnn_n_positive: int
    test_gb_auc: float
    test_gb_ap: float
    test_gb_precision: float
    test_gb_recall: float
    test_gb_threshold: float
    test_gb_n_samples: int
    test_gb_n_positive: int
    val_cnn_auc: Optional[float] = None
    val_cnn_ap: Optional[float] = None
    val_cnn_precision: Optional[float] = None
    val_cnn_recall: Optional[float] = None
    val_cnn_threshold: Optional[float] = None
    val_gb_auc: Optional[float] = None
    val_gb_ap: Optional[float] = None
    val_gb_precision: Optional[float] = None
    val_gb_recall: Optional[float] = None
    val_gb_threshold: Optional[float] = None


class MetricRow(BaseModel):
    """Full metrics row from metrics.json."""
    model: Literal["cnn", "gb"]
    split: Literal["train", "val", "test"]
    auc: float
    ap: float
    precision: float
    recall: float
    f1: float
    threshold: float
    n_samples: int
    n_positive: int


class TCEBase(BaseModel):
    """Core TCE fields present in tces.json."""
    kepid: int
    tce_id: str
    split: Literal["train", "val", "test", "demo"]
    label: Literal["PC", "AFP", "NTP"]
    planet: int  # 1 for PC, 0 for AFP/NTP
    period_d: float
    duration_hr: float
    depth: float
    cnn_prob: float
    baseline_prob: float
    # Optional stellar params (only if present in original TCE CSV)
    ra: Optional[float] = None
    dec: Optional[float] = None
    kepmag: Optional[float] = None


class TCERecord(TCEBase):
    """Full TCE record with views for detail endpoint."""
    global_view: Optional[List[float]] = None  # 501 points, 4 decimals
    local_view: Optional[List[float]] = None   # 201 points, 4 decimals


class TCEListResponse(BaseModel):
    items: List[TCEBase]
    total: int
    page: int
    page_size: int
    total_pages: int


class TCEPointsResponse(BaseModel):
    """Compact arrays for sky view visualization."""
    tce_ids: List[str]
    kepids: List[int]
    ras: List[Optional[float]]
    decs: List[Optional[float]]
    labels: List[int]  # 1=PC, 0=AFP/NTP
    cnn_probs: List[float]
    baseline_probs: List[float]
    splits: List[str]


class ErrorItem(BaseModel):
    """Error analysis item from errors.json."""
    tce_id: str
    kepid: int
    label: Literal["PC", "AFP", "NTP"]
    planet: int
    cnn_prob: float
    error_type: Literal["FP", "FN"]
    secondary_eclipse_depth: float
    likely_label_error: bool


class ErrorsResponse(BaseModel):
    false_positives: List[ErrorItem]
    false_negatives: List[ErrorItem]


class CompareItem(BaseModel):
    """Record for compare endpoint."""
    tce_id: str
    kepid: int
    label: Literal["PC", "AFP", "NTP"]
    planet: int
    period_d: float
    duration_hr: float
    depth: float
    cnn_prob: float
    baseline_prob: float
    global_view: List[float]
    local_view: List[float]


class CompareResponse(BaseModel):
    a: CompareItem
    b: CompareItem


class Kepler90Planet(BaseModel):
    name: str
    period_d: float
    t0_bkjd: float
    duration_hr: float
    depth: float
    cnn_prob: float
    global_view: List[float]
    local_view: List[float]


class Kepler90Response(BaseModel):
    planets: List[Kepler90Planet]
    disclaimer: str = (
        "This is a one-star illustration, not evidence of model accuracy. "
        "Kepler-90 (KIC 11442793) was excluded from training."
    )


class ThresholdRequest(BaseModel):
    value: float = Field(..., ge=0.0, le=1.0, description="Classification threshold")
    split: Literal["train", "val", "test"] = Field(..., description="Split to evaluate on")


class ThresholdResponse(BaseModel):
    split: Literal["train", "val", "test"]
    threshold: float
    precision: float
    recall: float
    true_positives: int
    false_positives: int
    true_negatives: int
    false_negatives: int
    n_samples: int
    n_positive: int
    matches_metrics_json: bool = False


class PRPoint(BaseModel):
    recall: float
    precision: float


class ROCPoint(BaseModel):
    fpr: float
    tpr: float


class CurvesResponse(BaseModel):
    model: Literal["cnn", "gb"]
    split: Literal["train", "val", "test"]
    pr_curve: List[PRPoint]
    roc_curve: List[ROCPoint]
    auc: float
    ap: float


class SplitCounts(BaseModel):
    train: int
    val: int
    test: int
    demo: int


class ClassCounts(BaseModel):
    planet: int
    not_planet: int


class DatasetInfo(BaseModel):
    splits: SplitCounts
    classes: ClassCounts