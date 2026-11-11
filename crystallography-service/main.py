from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import spglib
import numpy as np
from typing import Optional

app = FastAPI(title="SAED spglib systematic-absence service", version="1.0.0")

class Reflection(BaseModel):
    h: int
    k: int
    l: int

class AbsenceRequest(BaseModel):
    space_group_number: int = Field(ge=1, le=230)
    space_group_symbol: str
    setting: str = "Standard"
    reflections: list[Reflection]

def phase_sum_is_allowed(rotations, translations, hkl, tol=1e-7):
    h = np.asarray(hkl, dtype=int)
    phases = []
    for rot, trans in zip(rotations, translations):
        # Operations mapping this reciprocal vector onto itself form its little group.
        if np.array_equal(np.asarray(rot, dtype=int).T @ h, h):
            phases.append(np.exp(2j * np.pi * float(np.dot(h, trans))))
    if not phases:
        return True
    return abs(sum(phases)) > tol

@app.get("/health")
def health():
    return {"ok": True, "spglib_version": spglib.__version__}

@app.post("/systematic-absences")
def systematic_absences(req: AbsenceRequest):
    candidates = []
    for hall_number in range(1, 531):
        sg = spglib.get_spacegroup_type(hall_number)
        if sg and sg.number == req.space_group_number:
            candidates.append((hall_number, sg))
    if not candidates:
        raise HTTPException(422, "Space group number not found in spglib database")
    # If caller provides a setting label, prefer matching HM symbol when possible.
    target = req.space_group_symbol.replace(" ", "").lower()
    matches = []
    for hall, sg in candidates:
        hm_short = (sg.international_short or "").replace(" ", "").lower()
        hm_full = (sg.international_full or "").replace(" ", "").lower()
        if target in (hm_short, hm_full):
            matches.append((hall, sg))
    if len(matches) == 1:
        selected = matches[0]
    elif len(matches) > 1:
        setting_key = req.setting.replace(" ", "").lower()
        setting_matches = [
            item for item in matches
            if setting_key in (item[1].hall_symbol or "").replace(" ", "").lower()
            or setting_key == str(item[0])
        ]
        if len(setting_matches) == 1:
            selected = setting_matches[0]
        else:
            raise HTTPException(422, "Ambiguous Hall setting. Supply the exact Hall symbol or Hall number in the Setting field.")
    elif len(candidates) == 1:
        selected = candidates[0]
    else:
        raise HTTPException(422, "Space-group symbol does not uniquely identify a Hall setting. Supply an exact setting.")
    hall, sg = selected
    sym = spglib.get_symmetry_from_database(hall)
    if sym is None:
        raise HTTPException(500, "Could not load symmetry operations")
    out=[]
    for ref in req.reflections:
        allowed=phase_sum_is_allowed(sym["rotations"], sym["translations"], (ref.h,ref.k,ref.l))
        out.append({"h":ref.h,"k":ref.k,"l":ref.l,"allowed":bool(allowed)})
    return {"space_group":{"number":sg.number,"international_short":sg.international_short,
            "international_full":sg.international_full,"hall_number":hall,"hall_symbol":sg.hall_symbol},
            "reflections":out}
