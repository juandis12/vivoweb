import http.client
import json
import urllib.parse
import sys
import codecs
import re
import os
import config_loader

# Configuración de salida UTF-8 para Windows
if sys.stdout.encoding != 'utf-8':
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.detach())

TMDB_API_KEY = config_loader.get_tmdb_key()

# Cargar lista de la biblioteca desde JSON externo
DATA_FILE = "d:/vivoweb/tools/library_data.json"
try:
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        library_list = json.load(f)
except FileNotFoundError:
    print(f"Error: {DATA_FILE} not found.")
    sys.exit(1)

conn = http.client.HTTPSConnection("api.themoviedb.org")

sql_buffer = "-- SQL Insert Script para VivoTV Library\n-- Generado automáticamente\n\n"

for item in library_list:
    title = item.get("title")
    item_type = item.get("type", "movie")
    embed_val = item.get("embed_url") or item.get("embed")
    
    if not embed_val or embed_val == "NOT_FOUND":
        continue
        
    # Extraer año del título si existe en formato "(YYYY)"
    match = re.search(r'(.*?)\s*\((\d{4})\)', title)
    if match:
        title_clean = match.group(1).strip()
        year = match.group(2)
    else:
        title_clean = title.strip()
        year = item.get("year", "None")
        
    query = urllib.parse.quote(title_clean)
    
    # Búsqueda en TMDB
    search_path = f"/3/search/{item_type}?api_key={TMDB_API_KEY}&query={query}&language=es-ES"
    if year != "None":
        search_path += f"&{'year' if item_type == 'movie' else 'first_air_date_year'}={year}"
        
    conn.request("GET", search_path)
    res = conn.getresponse()
    data = json.loads(res.read())
    
    tmdb_id = None
    if data.get("results"):
        tmdb_id = data["results"][0]["id"]
    
    if not tmdb_id:
        sql_buffer += f"-- NOT FOUND: {title} ({item_type})\n"
        continue

    if item_type == "movie":
        sql_buffer += f"INSERT INTO video_sources (tmdb_id, stream_url) VALUES ({tmdb_id}, '{embed_val}') ON CONFLICT (tmdb_id) DO NOTHING; -- {title}\n"
    elif item_type == "tv":
        # Para SERIES, obtenemos detalles para saber temporadas
        conn.request("GET", f"/3/tv/{tmdb_id}?api_key={TMDB_API_KEY}&language=es-ES")
        res = conn.getresponse()
        tv_details = json.loads(res.read())
        
        seasons = tv_details.get("seasons", [])
        total_eps = 0
        for season in seasons:
            s_num = season.get("season_number")
            if s_num == 0: continue # Ignorar especiales por ahora
            
            # Obtener episodios de la temporada
            conn.request("GET", f"/3/tv/{tmdb_id}/season/{s_num}?api_key={TMDB_API_KEY}&language=es-ES")
            res = conn.getresponse()
            season_data = json.loads(res.read())
            
            episodes = season_data.get("episodes", [])
            for ep in episodes:
                e_num = ep.get("episode_number")
                total_eps += 1
                # Generar INSERT para series_episodes
                sql_buffer += f"INSERT INTO series_episodes (tmdb_id, season_number, episode_number, stream_url) VALUES ({tmdb_id}, {s_num}, {e_num}, '{embed_val}') ON CONFLICT (tmdb_id, season_number, episode_number) DO NOTHING;\n"
        sql_buffer += f"-- Serie {title} cargada con {len(seasons)} temporadas y {total_eps} episodios.\n"

conn.close()

# Escribir el archivo con encoding UTF-8 explícito
OUTPUT_FILE = "d:/vivoweb/tools/import_library.sql"
with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    f.write(sql_buffer)

print(f"Done. Processed {len(library_list)} items. Output: {OUTPUT_FILE}")
