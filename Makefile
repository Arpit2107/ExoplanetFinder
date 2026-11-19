# Exoplanet Finder - Makefile
# Ordered commands for the full ML pipeline
# Run with: make <target>
# Default target shows help

.PHONY: help setup prepare-data download build-dataset train-baseline train-cnn evaluate export-dashboard start-backend start-frontend demo-clean clean

# Default: show help
help:
	@echo "Exoplanet Finder - Available Commands:"
	@echo ""
	@echo "  setup              Install all Python dependencies (root + backend + frontend)"
	@echo "  prepare-data       Download DR24 TCE CSV from NASA Exoplanet Archive and create tce_labeled.parquet"
	@echo "  download           Download Kepler light curves for TCE stars (resumable)"
	@echo "  build-dataset      Build views.npz from TCEs and cached light curves"
	@echo "  train-baseline     Train Gradient Boosting baseline on period/duration/depth"
	@echo "  train-cnn          Train Two-View 1D CNN on global/local views"
	@echo "  evaluate           Evaluate CNN and baseline on test set"
	@echo "  export-dashboard   Export metrics and data for dashboard (no-op, reads from results/)"
	@echo "  start-backend      Start FastAPI backend server (port 8000)"
	@echo "  start-frontend     Start Vite frontend dev server (port 5173)"
	@echo "  demo               Run demo: compare_plot or kepler90_demo"
	@echo "  clean              Remove generated data, results, and cache"
	@echo ""
	@echo "Full pipeline: make setup && make prepare-data && make download && make build-dataset && make train-baseline && make train-cnn && make evaluate"
	@echo ""
	@echo "After pipeline: make start-backend && make start-frontend (in separate terminals)"

# Install dependencies
setup:
	pip install -r requirements.txt
	pip install -r dashboard/backend/requirements.txt
	cd dashboard/frontend && npm install

# Prepare initial data: download DR24 TCE CSV from NASA Exoplanet Archive
# Manual step: download "Q1-Q17 DR24 TCE table" CSV from https://exoplanetarchive.ipac.caltech.edu/cgi-bin/TblView/nph-tblView?app=ExoTbls&config=keplertce
# Place it at data/raw/dr24_tce.csv, then run this target to create tce_labeled.parquet
prepare-data:
	@echo "Step 1: Download 'Q1-Q17 DR24 TCE table' CSV from NASA Exoplanet Archive"
	@echo "        URL: https://exoplanetarchive.ipac.caltech.edu/cgi-bin/TblView/nph-tblView?app=ExoTbls&config=keplertce"
	@echo "        Save as: data/raw/dr24_tce.csv"
	@echo ""
	@echo "Step 2: Run this target to process it into tce_labeled.parquet"
	python -c "from src.data import load_tce_table; df = load_tce_table(); df.to_parquet('data/processed/tce_labeled.parquet', index=False); print(f'Saved {len(df)} TCEs to data/processed/tce_labeled.parquet')"

# Download Kepler light curves (resumable, skips cached)
# Usage: make download LIMIT=100 (for testing with 100 stars)
download:
	python -m src.download $(if $(LIMIT),--limit $(LIMIT))

# Build dataset: create views.npz from TCEs and light curves
# Usage: make build-dataset WORKERS=8 LIMIT=1000
build-dataset:
	python -m src.build_dataset $(if $(WORKERS),--workers $(WORKERS)) $(if $(LIMIT),--limit $(LIMIT))

# Train Gradient Boosting baseline
# Usage: make train-baseline RUN_NAME=my_baseline
train-baseline:
	python -m src.baseline $(if $(RUN_NAME),--run-name $(RUN_NAME))

# Train Two-View 1D CNN
# Usage: make train-cnn RUN_NAME=my_cnn BATCH_SIZE=64 EPOCHS=50 PATIENCE=8 AUGMENT=1 WORKERS=4
train-cnn:
	python -m src.train $(if $(RUN_NAME),--run-name $(RUN_NAME)) $(if $(BATCH_SIZE),--batch-size $(BATCH_SIZE)) $(if $(EPOCHS),--epochs $(EPOCHS)) $(if $(PATIENCE),--patience $(PATIENCE)) $(if $(AUGMENT),--augment) $(if $(WORKERS),--workers $(WORKERS))

# Evaluate on test set
# Usage: make evaluate CNN_CHECKPOINT=results/cnn_best.pt BASELINE_MODEL=results/gb_baseline.joblib RUN_NAME=my_eval
evaluate:
	python -m src.evaluate $(if $(CNN_CHECKPOINT),--cnn-checkpoint $(CNN_CHECKPOINT)) $(if $(BASELINE_MODEL),--baseline-model $(BASELINE_MODEL)) $(if $(RUN_NAME),--run-name $(RUN_NAME))

# Export dashboard data (placeholder - dashboard reads directly from results/)
export-dashboard:
	@echo "Dashboard reads directly from results/ and data/processed/"
	@echo "No separate export step needed. Run evaluate first to generate metrics."

# Run demo
# Usage: make demo MODE=compare|kepler90|both CNN_CHECKPOINT=results/cnn_best.pt
demo:
	python -m src.demo $(if $(MODE),$(MODE),compare) $(if $(CNN_CHECKPOINT),--checkpoint $(CNN_CHECKPOINT))

# Start FastAPI backend
start-backend:
	cd dashboard/backend && uvicorn main:app --port 8000

# Start Vite frontend
start-frontend:
	cd dashboard/frontend && npm run dev

# Clean demo plots only
demo-clean:
	rm -f results/plots/planet_vs_eb.png results/plots/kepler90_demo.png

# Clean generated files
clean:
	rm -rf data/lightcurves data/processed results/plots results/*.csv results/*.joblib results/*.pt results/*.md
	rm -rf dashboard/frontend/node_modules dashboard/frontend/dist
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -name "*.pyc" -delete 2>/dev/null || true
	find . -name "*.pyo" -delete 2>/dev/null || true