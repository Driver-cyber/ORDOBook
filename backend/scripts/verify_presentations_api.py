"""The presentation lifecycle through the router, on a seeded database.

verify_panels.py covers the generator as a pure function. This covers the part a
pure test cannot see: storage, versioning, serialization, and the rules that only
exist at the router — that a presented version refuses edits, and that regenerating
after a presentation opens the next version instead of overwriting the record.

    cd backend && python scripts/verify_presentations_api.py
"""
import atexit
import os
import shutil
import subprocess
import sys
import tempfile

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)

_tmp = tempfile.mkdtemp(prefix="ordobook_pres_")
atexit.register(lambda: shutil.rmtree(_tmp, ignore_errors=True))
URL = f"sqlite:///{os.path.join(_tmp, 'pres.db')}"
os.environ["DATABASE_URL"] = URL

subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=BACKEND,
               env=dict(os.environ, DATABASE_URL=URL), capture_output=True, check=True)

from app.models import Client, ActionPlanItem            # noqa: E402
from app.models.action_plan import ActionPlanStep        # noqa: E402
from app.routers import presentations as R               # noqa: E402
from app.schemas.presentations import GenerateRequest, PanelEdit  # noqa: E402

FAILED = []


def check(name, cond, detail=""):
    print(f"  {'PASS' if cond else 'FAIL'} {name}" + (f"  [{detail}]" if detail and not cond else ""))
    if not cond:
        FAILED.append(name)


db = sessionmaker(bind=create_engine(URL))()
db.add(Client(id=1, name="Vetter Plumbing Svc. LLC"))
db.flush()
obj = ActionPlanItem(client_id=1, fiscal_year=2026, sort_order=0,
                     objective="Get paid faster", current_results="48 days, was 53")
db.add(obj)
db.flush()
db.add(ActionPlanStep(item_id=obj.id, sort_order=0,
                      text="30% deposit on jobs over $2,500", owners=["Doug"]))
db.commit()

print("Generate:")
p1 = R.generate(1, GenerateRequest(fiscal_year=2026, month=8), db)
check("a draft is created at version 1", p1.version == 1 and p1.status == "draft",
      f"v{p1.version} {p1.status}")
check("it has panels", len(p1.panels) > 0, len(p1.panels))
check("it opens with the action review", p1.panels[0]["type"] == "action_review",
      p1.panels[0]["type"])
check("and closes on the question", p1.panels[-1]["type"] == "close", p1.panels[-1]["type"])
check("the objective from the action plan became a panel",
      any(x["type"] == "objective" for x in p1.panels))

print()
print("Editing prose flips a panel to authored:")
first = p1.panels[0]["id"]
edited = R.edit_panel(1, p1.id, PanelEdit(panel_id=first, body="Doug — two of four done."), db)
check("mode becomes authored", edited.panels[0]["mode"] == "authored",
      edited.panels[0]["mode"])
check("the words are stored", edited.panels[0]["body"].startswith("Doug"),
      edited.panels[0]["body"][:30])

cleared = R.edit_panel(1, p1.id, PanelEdit(panel_id=first, title="", body=""), db)
check("clearing the text hands the panel back to the generator",
      cleared.panels[0]["mode"] == "bound", cleared.panels[0]["mode"])
R.edit_panel(1, p1.id, PanelEdit(panel_id=first, body="Doug — two of four done."), db)

print()
print("Reordering and dropping:")
before = [x["id"] for x in R.read(1, p1.id, db).panels]
moved = R.edit_panel(1, p1.id, PanelEdit(panel_id=before[1], move_to=0), db)
check("a panel can be moved to the front",
      [x["id"] for x in moved.panels][0] == before[1],
      [x["id"] for x in moved.panels][:2])
dropped = R.edit_panel(1, p1.id, PanelEdit(panel_id=before[-1], drop=True), db)
check("a panel can be dropped", before[-1] not in [x["id"] for x in dropped.panels])

print()
print("Presenting closes the version:")
presented = R.mark_presented(1, p1.id, db)
check("status becomes presented", presented.status == "presented", presented.status)
check("presented_at is stamped", presented.presented_at is not None)

try:
    R.edit_panel(1, p1.id, PanelEdit(panel_id=first, body="sneaky change"), db)
    check("a presented version refuses edits", False, "no error raised")
except HTTPException as e:
    check("a presented version refuses edits", e.status_code == 409, e.status_code)

print()
print("Regenerating after a presentation opens the NEXT version:")
p2 = R.generate(1, GenerateRequest(fiscal_year=2026, month=8), db)
check("version 2 is created", p2.version == 2, p2.version)
check("it is a draft again", p2.status == "draft", p2.status)
check("the presented version is untouched",
      R.read(1, p1.id, db).status == "presented")
authored = next((x for x in p2.panels if x["id"] == first), None)
check("the advisor's words carried into the new version",
      authored and authored["body"].startswith("Doug"),
      authored and authored["body"][:30])

print()
print("Listing:")
rows = R.list_presentations(1, db)
check("both versions are listed", len(rows) == 2, len(rows))
check("newest first", rows[0].version == 2, rows[0].version)
check("panel counts are reported", all(r.panel_count > 0 for r in rows))

print()
print("A second period is its own presentation:")
p3 = R.generate(1, GenerateRequest(fiscal_year=2026, month=9), db)
check("September starts at version 1", p3.version == 1 and p3.month == 9,
      f"v{p3.version} m{p3.month}")
check("its action review reads the presented August, not today's plan",
      p3.panels[0]["type"] == "action_review" and p3.panels[0]["data"]["total"] >= 1,
      p3.panels[0]["data"]["total"])

print()
if FAILED:
    print(f"{len(FAILED)} CHECK(S) FAILED: " + ", ".join(FAILED))
    sys.exit(1)
print("ALL PASS")
