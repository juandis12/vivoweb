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

# Cargar lista de películas desde JSON externo
DATA_FILE = "d:/vivoweb/tools/movies_data.json"
try:
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        movies_list = json.load(f)
except FileNotFoundError:
    print(f"Error: {DATA_FILE} not found.")
    sys.exit(1)

conn = http.client.HTTPSConnection("api.themoviedb.org")

sql_buffer = "-- SQL Insert Script para video_sources\n-- Generado automáticamente por Vivotv Helper (Refactored)\n\n"

for movie in movies_list:
    # Soporte para 'embed_url' o 'embed'
    embed_val = movie.get("embed_url") or movie.get("embed")
    
    if not embed_val or embed_val == "NOT_FOUND":
        continue
        
    # Extraer año del título si existe en formato "(YYYY)"
    match = re.search(r'(.*?)\s*\((\d{4})\)', movie["title"])
    if match:
        title_clean = match.group(1).strip()
        year = match.group(2)
    else:
        title_clean = movie["title"].strip()
        year = movie.get("year", "None")
        
    query = urllib.parse.quote(title_clean)
    
    # Intento 1: Con año (si está disponible)
    url = f"/3/search/movie?api_key={TMDB_API_KEY}&query={query}&language=es-ES"
    if year != "None":
        url += f"&year={year}"
        
    conn.request("GET", url)
    res = conn.getresponse()
    data = json.loads(res.read())
    
    tmdb_id = None
    if data.get("results"):
        tmdb_id = data["results"][0]["id"]
    else:
        # Intento 2: Sin año (si falló con año)
        if year != "None":
            conn.request("GET", f"/3/search/movie?api_key={TMDB_API_KEY}&query={query}&language=es-ES")
            res = conn.getresponse()
            data = json.loads(res.read())
            if data.get("results"):
                tmdb_id = data["results"][0]["id"]

    if tmdb_id:
        sql_buffer += f"INSERT INTO video_sources (tmdb_id, stream_url) VALUES ({tmdb_id}, '{embed_val}') ON CONFLICT (tmdb_id) DO NOTHING; -- {movie['title']}\n"
    else:
        sql_buffer += f"-- NOT FOUND: {movie['title']} ({year})\n"

conn.close()

# Escribir el archivo con encoding UTF-8 explícito
OUTPUT_FILE = "d:/vivoweb/tools/import_movies.sql"
with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    f.write(sql_buffer)

print(f"Done. Processed {len(movies_list)} movies. Output: {OUTPUT_FILE}")
