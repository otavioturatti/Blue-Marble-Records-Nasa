# SI disclosure: parts of this file were drafted with an AI coding assistant and reviewed by Arthur.
"""The named places offered in the UI (exported to web/data/places.json).

How they were chosen (2026-11-15): every place was scored against every 1-degree cell of the
decoded NASA records (SST anomaly over 30 months, fire over 23). Ocean places sit among the
cells that change or persist most (for example the Equatorial Pacific, top 1% for the
2025 -> 2026 change; the North Pacific heatwave and the North Atlantic cold blob, the most
persistent warm and cold anomalies on Earth in the record), plus one calm control (Amazon
plume) for the Compare unison. Land places have a clear fire season in the record, in different
months around the world, and avoid static heat sources (gas flares, industry) that VIIRS also
detects. Uberlandia is the challenge's local event; the Brazil places cover the local story.

Coordinates sit at or near 1-degree cell centers where it matters (the needle reads the cell that
contains the point, docs/DATA-FORMAT.md 2.4). `surface` says whether the cell is land or ocean. It is checked against the
real land mask by `make_landmask.py --check`; ocean points sit far enough offshore
that their 1-degree cell is fully ocean.
"""

PLACES = [
    # --- Brazil first: the local story (fire record) and the coast (SST record)
    {"id": "uberlandia", "name": "Uberlândia, Brazil", "lat": -18.92, "lon": -48.28, "surface": "land"},
    {"id": "cerrado", "name": "Cerrado, Tocantins, Brazil (Jalapão)", "lat": -10.5, "lon": -46.5, "surface": "land"},
    {"id": "roraima", "name": "Roraima savanna, Brazil", "lat": 3.5, "lon": -60.5, "surface": "land"},
    {"id": "amazon", "name": "Amazon rainforest, Brazil", "lat": -3.5, "lon": -62.0, "surface": "land"},
    {"id": "sao-paulo", "name": "São Paulo, Brazil", "lat": -23.55, "lon": -46.63, "surface": "land"},
    {"id": "off-santos", "name": "Atlantic Ocean off Santos, Brazil", "lat": -25.5, "lon": -45.0, "surface": "ocean"},
    {"id": "off-recife", "name": "Atlantic Ocean off Recife, Brazil", "lat": -8.0, "lon": -33.0, "surface": "ocean"},
    {"id": "amazon-plume", "name": "Atlantic Ocean off the Amazon mouth", "lat": 3.0, "lon": -47.0, "surface": "ocean"},
    # --- The global story (SST record): El Nino region and other oceans
    {"id": "equatorial-pacific", "name": "Equatorial Pacific (near 0°, 140°W)", "lat": -0.5, "lon": -139.5, "surface": "ocean"},
    {"id": "off-peru", "name": "Pacific Ocean off Peru", "lat": -8.0, "lon": -84.0, "surface": "ocean"},
    {"id": "off-california", "name": "Pacific Ocean off California", "lat": 34.0, "lon": -125.0, "surface": "ocean"},
    {"id": "gulf-of-alaska", "name": "Gulf of Alaska", "lat": 55.0, "lon": -145.0, "surface": "ocean"},
    {"id": "gulf-of-mexico", "name": "Gulf of Mexico", "lat": 25.0, "lon": -90.0, "surface": "ocean"},
    {"id": "north-atlantic-cold-blob", "name": "North Atlantic cold blob, south of Greenland", "lat": 59.5, "lon": -43.5, "surface": "ocean"},
    {"id": "north-atlantic", "name": "North Atlantic Ocean", "lat": 40.0, "lon": -40.0, "surface": "ocean"},
    {"id": "mediterranean", "name": "Mediterranean Sea", "lat": 34.5, "lon": 18.0, "surface": "ocean"},
    {"id": "off-namibia", "name": "Atlantic Ocean off Namibia", "lat": -22.0, "lon": 11.0, "surface": "ocean"},
    {"id": "indian-ocean", "name": "Indian Ocean", "lat": -10.0, "lon": 80.0, "surface": "ocean"},
    {"id": "north-pacific-heatwave", "name": "North Pacific marine heatwave, east of Japan", "lat": 41.5, "lon": 163.5, "surface": "ocean"},
    {"id": "off-japan", "name": "Pacific Ocean off Japan", "lat": 35.0, "lon": 145.0, "surface": "ocean"},
    {"id": "coral-sea", "name": "Coral Sea, east of the Great Barrier Reef", "lat": -18.0, "lon": 149.0, "surface": "ocean"},
    {"id": "southern-ocean", "name": "Southern Ocean south of Africa", "lat": -50.0, "lon": 20.0, "surface": "ocean"},
    # --- Land places around the world (fire record)
    {"id": "gran-chaco", "name": "Gran Chaco, Paraguay", "lat": -22.0, "lon": -61.0, "surface": "land"},
    {"id": "los-angeles", "name": "Los Angeles, USA", "lat": 34.05, "lon": -118.25, "surface": "land"},
    {"id": "saskatchewan", "name": "Boreal forest, Saskatchewan, Canada", "lat": 55.0, "lon": -105.0, "surface": "land"},
    {"id": "northern-nigeria", "name": "Savanna, northern Nigeria (Kaduna)", "lat": 11.0, "lon": 8.0, "surface": "land"},
    {"id": "angola", "name": "Miombo woodlands, Angola", "lat": -12.0, "lon": 19.0, "surface": "land"},
    {"id": "borneo", "name": "Peatlands of Central Kalimantan, Borneo", "lat": -2.5, "lon": 113.5, "surface": "land"},
    {"id": "northern-australia", "name": "Northern Australia", "lat": -14.0, "lon": 133.0, "surface": "land"},
    {"id": "northern-thailand", "name": "Northern Thailand (Chiang Mai)", "lat": 19.0, "lon": 99.0, "surface": "land"},
]


if __name__ == "__main__":
    # python pipeline/places.py  -> rewrites web/data/places.json only
    from common import WEB_DATA, write_json
    write_json(WEB_DATA / "places.json", PLACES)
    print(f"places.json: {len(PLACES)} places")
