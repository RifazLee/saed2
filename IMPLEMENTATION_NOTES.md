# SAED Material Reference Database – implementation notes

## Frontend
- Initial landing page is an empty Material Reference Database.
- Material input supports all seven crystal systems and metric-tensor d-spacing calculations.
- HKL candidates are generated automatically and CSV export is available.
- Diffraction Analysis material selector now requests only validated materials from `GET /api/materials/validated`.
- Analysis receives the selected material's persisted allowed d-spacing map through `AnalysisParams.referenceDnm`; existing ring detection/calibration pipeline is otherwise retained.
- Operator login uses the Express API and JWT held in sessionStorage.

## Backend
- Express API is in `backend/`, using mysql2 and MySQL.
- SQL migration: `backend/migrations/001_initial.sql`.
- Operator login, draft material creation, server-side HKL generation, spglib verification, validation, version history, and validated-material retrieval are implemented.
- A validated version is retained in `validated_version_id`; new revisions can be calculated and reviewed while the previous validated version remains selectable.
- No sample/demo material rows are seeded.
- The first operator is created manually with `backend/scripts/create-operator.js`.

## Crystallography engine
- Node.js service calculates d-spacing using the reciprocal metric tensor for all seven crystal systems.
- Python FastAPI microservice `crystallography-service/` uses spglib database symmetry operations to check systematic absences, including screw/glide conditions through symmetry-operation phase sums.
- The API refuses to mark a material validated if the spglib service is unavailable or any reflection remains unverified.
- Space-group symbol and setting ambiguity must be resolved; ambiguous settings are not silently selected.

## Deployment
See `DEPLOYMENT_NIAGAHOSTER.md` and `backend/README.md`. Node.js availability depends on the exact Niagahoster package/provider configuration. Python microservice generally needs a separate VPS/private runtime if shared hosting does not permit persistent Python services.

## Tests
- Backend JavaScript syntax checked with Node.
- Five unit tests pass: cubic Al d(111), cubic Al d(200), hexagonal ZnO d(100), zero-index rejection, lattice validation, and deterministic HKL ordering (the test suite contains five test cases; first case checks two values).
- Python microservice source compiles.
- Full dependency installation, full frontend typecheck/build, and live MySQL/spglib integration tests were not completed in this environment.
