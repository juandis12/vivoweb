import http.client
import json
import urllib.parse
import sys
import codecs
import re

# Configuración de salida UTF-8 para Windows
if sys.stdout.encoding != 'utf-8':
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.detach())

TMDB_API_KEY = "743275e25bcea0a320b87d2af271a136"

movies_list = [
     {
        "title": "En busca de la felicidad (2025)",
        "embed_url": "https://vimeos.net/embed-u5p3pn9ktqu1.html"
    },
    {
        "title": "La dolce casa (2025)",
        "embed_url": "https://vimeos.net/embed-mrifun5zbdr5.html"
    },
    {
        "title": "Pídeme lo que quieras (2024)",
        "embed_url": "https://vimeos.net/embed-jos3jun8ifim.html"
    },
    {
        "title": "Tiger: Tanque de guerra (2025)",
        "embed_url": "https://vimeos.net/embed-tt656uew159s.html"
    },
    {
        "title": "Regalo maldito (2025)",
        "embed_url": "https://vimeos.net/embed-0q0jak53txsm.html"
    },
    {
        "title": "Rippy (2024)",
        "embed_url": "https://vimeos.net/embed-ufsy1ivk4nbi.html"
    },
    {
        "title": "Alarum: Código Letal (2025)",
        "embed_url": "https://vimeos.net/embed-x2dwm12825bq.html"
    },
    {
        "title": "Drop: Amenaza anónima (2025)",
        "embed_url": "https://vimeos.net/embed-w10upk2hwr17.html"
    },
    {
        "title": "Alerta Amber (2024)",
        "embed_url": "https://vimeos.net/embed-yvtldhzha8w5.html"
    },
    {
        "title": "So Fades the Light (2025)",
        "embed_url": "https://vimeos.net/embed-v3uhoyhokqvw.html"
    },
    {
        "title": "Un día fuera de control (2025)",
        "embed_url": "https://vimeos.net/embed-erbu1wnxq49z.html"
    },
    {
        "title": "Thi Yot 2 - Susurros Mortales 2 (2024)",
        "embed_url": "https://vimeos.net/embed-wwllczyir02s.html"
    },
    {
        "title": "Una boda en las bahamas con madea (2025)",
        "embed_url": "https://vimeos.net/embed-0nzj3bpidx92.html"
    },
    {
        "title": "Drácula (2025)",
        "embed_url": "https://vimeos.net/embed-162wzuryvd2c.html"
    },
    {
        "title": "Atrapado robando (2025)",
        "embed_url": "https://vimeos.net/embed-kb2ttpk87rva.html"
    },
    {
        "title": "Séance Games: Metaxu (2024)",
        "embed_url": "https://vimeos.net/embed-q04zrmxf8exg.html"
    },
    {
        "title": "Crescent City (2024)",
        "embed_url": "https://vimeos.net/embed-xe321cg0q9t3.html"
    },
    {
        "title": "Viaje de fin de curso: Mallorca (2025)",
        "embed_url": "https://vimeos.net/embed-p16g7qab87x5.html"
    },
    {
        "title": "Los huérfanos (2025)",
        "embed_url": "https://vimeos.net/embed-nrr9e1794ypn.html"
    },
    {
        "title": "Trust (2025)",
        "embed_url": "https://vimeos.net/embed-cozbbsxc76c9.html"
    },
    {
        "title": "La mujer de las sombras (2025)",
        "embed_url": "https://vimeos.net/embed-ctumgfmqirz9.html"
    },
    {
        "title": "LOOK BACK: Continúa Dibujando (2024)",
        "embed_url": "https://vimeos.net/embed-qg4wxh53j7lw.html"
    },
    {
        "title": "Asesinos Sadicos 2 Hermanos Hambrientos (2024)",
        "embed_url": "https://vimeos.net/embed-r72nqxdvmaem.html"
    },
    {
        "title": "Canta y no llores (2024)",
        "embed_url": "https://vimeos.net/embed-34i0mcv4m60j.html"
    },
    {
        "title": "El tour universitario con Joe (2026)",
        "embed_url": "https://vimeos.net/embed-npwekogzfd6j.html"
    },
    {
        "title": "María (2024)",
        "embed_url": "https://vimeos.net/embed-35ejzk76ijxl.html"
    },
    {
        "title": "Z-O-M-B-I-E-S 4: El origen de los vampiros (2025)",
        "embed_url": "https://vimeos.net/embed-0qlsq4muguuc.html"
    },
    {
        "title": "H Is for Hawk (2025)",
        "embed_url": "https://vimeos.net/embed-gi27l6om5jmf.html"
    },
    {
        "title": "Depredador: Tierras salvajes (2025)",
        "embed_url": "https://vimeos.net/embed-gifb0mvp14aw.html"
    },
    {
        "title": "One More Shot (2025)",
        "embed_url": "https://vimeos.net/embed-495snhoasgi4.html"
    },
    {
        "title": "Mr. K (2025)",
        "embed_url": "https://vimeos.net/embed-2i5vmcebs2ln.html"
    },
    {
        "title": "Icefall (2025)",
        "embed_url": "https://vimeos.net/embed-g4vqyhnyw6af.html"
    },
    {
        "title": "Del cielo al infierno (2025)",
        "embed_url": "https://vimeos.net/embed-yj28nqqoistv.html"
    },
    {
        "title": "Regarde (2025)",
        "embed_url": "https://vimeos.net/embed-2r8vapc469hs.html"
    },
    {
        "title": "Un Buen Ladrón (2025)",
        "embed_url": "https://vimeos.net/embed-fc4eufatv3cp.html"
    },
    {
        "title": "Steve (2025)",
        "embed_url": "https://vimeos.net/embed-cv2kv13dygwx.html"
    },
    {
        "title": "La red antisocial: De los memes al caos (2024)",
        "embed_url": "https://vimeos.net/embed-p8bb1bvkzybl.html"
    },
    {
        "title": "Together: Juntos hasta la muerte (2025)",
        "embed_url": "https://vimeos.net/embed-bctb56wi6xca.html"
    },
    {
        "title": "Sueños de trenes (2025)",
        "embed_url": "https://vimeos.net/embed-i14yhbo6r95l.html"
    },
    {
        "title": "Moana 2 (2024)",
        "embed_url": "https://vimeos.net/embed-b7o6j67cn5pr.html"
    },
    {
        "title": "Policías de la mafia (2025)",
        "embed_url": "https://vimeos.net/embed-gjcr5l0zjxz1.html"
    },
    {
        "title": "El gran viaje de tu vida (2025)",
        "embed_url": "https://vimeos.net/embed-x6rs1ymcd9o4.html"
    },
    {
        "title": "Candlewood (2025)",
        "embed_url": "https://vimeos.net/embed-txkc3kzdgazw.html"
    },
    {
        "title": "Saiyaara (2025)",
        "embed_url": "https://vimeos.net/embed-4bkyailjsrb8.html"
    },
    {
        "title": "Osiris (2025)",
        "embed_url": "NOT_FOUND"
    },
    {
        "title": "Tiempo de guerra (2025)",
        "embed_url": "NOT_FOUND"
    },
    {
        "title": "Rehenes en la noche (2024)",
        "embed_url": "https://vimeos.net/embed-wzrsmdk0gae3.html"
    },
    {
        "title": "Friendship (2025)",
        "embed_url": "https://vimeos.net/embed-2xaeh00lp8pm.html"
    },
    {
        "title": "Megamente contra el sindicato de la perdición (2024)",
        "embed_url": "https://vimeos.net/embed-0g4ctifm8d0n.html"
    },
    {
        "title": "Acto encubierto (2025)",
        "embed_url": "https://vimeos.net/embed-tcuw1d1b0rqb.html"
    },
    {
        "title": "El Pájaro Loco se va de campamento (2024)",
        "embed_url": "https://vimeos.net/embed-iww59cbo9c1h.html"
    },
    {
        "title": "Warlord (2025)",
        "embed_url": "https://vimeos.net/embed-hdcjlyz7908p.html"
    },
    {
        "title": "Lo Mejor Que Puedas (2025)",
        "embed_url": "https://vimeos.net/embed-un9joi8xi5en.html"
    },
    {
        "title": "Masameer Junior (2025)",
        "embed_url": "https://vimeos.net/embed-riqu1fzaguvm.html"
    },
    {
        "title": "Kindred (2025)",
        "embed_url": "https://vimeos.net/embed-n9juk4kpfkw8.html"
    },
    {
        "title": "El cautivo (2025)",
        "embed_url": "https://vimeos.net/embed-ae6r0l44zkyi.html"
    },
    {
        "title": "Los desfiles (2024)",
        "embed_url": "https://vimeos.net/embed-gggrvi84wvf6.html"
    },
    {
        "title": "Runt (2024)",
        "embed_url": "https://vimeos.net/embed-6kth48u58zc0.html"
    },
    {
        "title": "31 Minutos: Calurosa Navidad (2025)",
        "embed_url": "https://vimeos.net/embed-z31m3zho0x3v.html"
    },
    {
        "title": "Cumpleanos sangriento (2025)",
        "embed_url": "https://vimeos.net/embed-g1hsocn16czo.html"
    },
    {
        "title": "A través del fuego (2025)",
        "embed_url": "https://vimeos.net/embed-427ti7qei95w.html"
    },
    {
        "title": "Pharrell Williams: Pieza por pieza (2024)",
        "embed_url": "https://vimeos.net/embed-f978f307d8vn.html"
    },
    {
        "title": "Wolves Against the World (2024)",
        "embed_url": "https://vimeos.net/embed-na1afjpztl21.html"
    },
    {
        "title": "Juegos de Seducción (2025)",
        "embed_url": "https://vimeos.net/embed-ai6xd9mi1e32.html"
    },
    {
        "title": "Sin piedad (2026)",
        "embed_url": "https://vimeos.net/embed-7bplwv3deni4.html"
    },
    {
        "title": "Yo no soy esa (2024)",
        "embed_url": "https://vimeos.net/embed-drkh2a0hd77m.html"
    },
    {
        "title": "Muerte en invierno (2025)",
        "embed_url": "https://vimeos.net/embed-jt0wegwrhje8.html"
    },
    {
        "title": "Mercato (2025)",
        "embed_url": "https://vimeos.net/embed-1msiryzhm9zk.html"
    },
    {
        "title": "La Última Gran Actuación (2024)",
        "embed_url": "https://vimeos.net/embed-caib3gu0u6rl.html"
    },
    {
        "title": "La pire mère au monde (2025)",
        "embed_url": "https://vimeos.net/embed-t4bol3ghsvm4.html"
    },
    {
        "title": "Wormtown (2025)",
        "embed_url": "https://goodstream.one/embed-dgxuf6amjon7.html"
    },
    {
        "title": "Jurassic World: Renace (2025)",
        "embed_url": "https://vimeos.net/embed-r5xuubxljw1k.html"
    }
]

conn = http.client.HTTPSConnection("api.themoviedb.org")

sql_buffer = "-- SQL Insert Script para video_sources\n-- Generado automáticamente por Vivotv Helper\n\n"

for movie in movies_list:
    if movie.get("embed_url") == "NOT_FOUND" or movie.get("embed") == "NOT_FOUND":
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
    embed_val = movie.get("embed_url") or movie.get("embed")
    
    # Intento 1: Con año
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
with open("d:/vivoweb/tools/import_movies.sql", "w", encoding="utf-8") as f:
    f.write(sql_buffer)

print("Done")
