"""Script to update all pricing to INR values."""
import asyncio
from app.core.database import async_session_maker
from sqlalchemy import text

INR_MATERIALS = {
    'Aluminum 6061-T6': 700,
    'Aluminum 7075-T6': 1000,
    'Mild Steel 1018': 290,
    'Stainless Steel 304': 590,
    'Stainless Steel 316': 800,
    'Brass C360': 920,
    'POM / Delrin': 500,
    'PEEK': 8000,
    'Nylon 6/6': 670,
    'Titanium Grade 5': 3800,
}
INR_FINISHES = {
    'Bead Blasted': 1260,
    'Anodized Type II (Clear)': 2100,
    'Anodized Type II (Color)': 2940,
    'Anodized Type III (Hard)': 4200,
    'Powder Coated': 2520,
    'Electroless Nickel': 3360,
    'Passivated': 1680,
    'Polished (Mirror)': 3780,
}
INR_INSPECTIONS = {
    'Dimensional Inspection': 2100,
    'CMM Inspection': 6300,
    'First Article Inspection (FAI)': 12600,
}
INR_MACHINES = {
    'Standard 3-Axis CNC Mill': 6300,
    '5-Axis CNC Mill': 10500,
    'CNC Lathe': 5500,
}

async def update():
    async with async_session_maker() as db:
        for name, cost in INR_MATERIALS.items():
            await db.execute(text("UPDATE materials SET cost_per_kg=:cost WHERE name=:name"), {"cost": cost, "name": name})
        for name, cost in INR_FINISHES.items():
            await db.execute(text("UPDATE surface_finishes SET fixed_cost=:cost WHERE name=:name"), {"cost": cost, "name": name})
        for name, cost in INR_INSPECTIONS.items():
            await db.execute(text("UPDATE inspection_levels SET fixed_cost=:cost WHERE name=:name"), {"cost": cost, "name": name})
        for name, rate in INR_MACHINES.items():
            await db.execute(text("UPDATE machine_rates SET hourly_rate=:rate WHERE name=:name"), {"rate": rate, "name": name})
        await db.commit()
        print('All prices updated to INR successfully!')

if __name__ == "__main__":
    asyncio.run(update())
