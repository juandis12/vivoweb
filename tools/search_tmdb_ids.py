import http.client
import json
import urllib.parse

TMDB_API_KEY = "743275e25bcea0a320b87d2af271a136"

movies_list = [
    {"title": "Terror En Shelby Oaks", "year": "2025", "embed": "https://vimeos.net/embed-q1txx3dj0dhi.html"},
    {"title": "Girl in the Attic", "year": "2025", "embed": "https://vimeos.net/embed-n4frr7wsn662.html"},
    {"title": "Lindas y Letales", "year": "2026", "embed": "https://vimeos.net/embed-8p4p9m6wn8u3.html"},
    {"title": "A Podcast to Die For", "year": "2023", "embed": "https://vimeos.net/embed-x5knt02a7jrh.html"},
    {"title": "Cradle of Deception", "year": "2024", "embed": "https://vimeos.net/embed-jgd6hb47owtq.html"},
    {"title": "¡Quieren volverme loco!", "year": "2005", "embed": "https://vimeos.net/embed-86qa5nh7dfnb.html"},
    {"title": "Una casa patas arriba", "year": "2007", "embed": "https://vimeos.net/embed-khimiv2s3dqa.html"},
    {"title": "GOAT: La cabra que cambió el juego", "year": "2026", "embed": "https://vimeos.net/embed-hnhtrfi1rvxl.html"},
    {"title": "Los Calienta Bancas", "year": "2006", "embed": "https://vimeos.net/embed-jpd1dzqt6uss.html"},
    {"title": "Un detective suelto en Hollywood", "year": "1984", "embed": "https://vimeos.net/embed-50i2c3h29cmj.html"},
    {"title": "Gelbe Briefe", "year": "2026", "embed": "https://vimeos.net/embed-cx367qx3x8ii.html"},
    {"title": "The Napa Boys", "year": "2026", "embed": "https://vimeos.net/embed-zm7pmeo9mp5m.html"},
    {"title": "undertone", "year": "2026", "embed": "https://vimeos.net/embed-6ok64frs18i8.html"},
    {"title": "The Gates", "year": "2026", "embed": "https://vimeos.net/embed-qtx5ld3g11ue.html"},
    {"title": "Slanted", "year": "2026", "embed": "https://vimeos.net/embed-11gwiz534f0x.html"},
    {"title": "Kalevala: Kullervon tarina", "year": "2026", "embed": "https://vimeos.net/embed-loon4zlgd3kv.html"},
    {"title": "Ach, diese Lücke, diese entsetzliche Lücke", "year": "2026", "embed": "https://vimeos.net/embed-ecrj82dkhzso.html"},
    {"title": "Proyecto Fin del Mundo", "year": "2026", "embed": "https://vimeos.net/embed-rnhi560mskuo.html"},
    {"title": "¡Ayuda!", "year": "2026", "embed": "https://vimeos.net/embed-2jjnlqpc06pr.html"},
    {"title": "बॉर्डर २", "year": "2026", "embed": "https://vimeos.net/embed-q4i73q8mq539.html"},
    {"title": "BTS: EL COMEBACK EN VIVO | ARIRANG", "year": "2026", "embed": "https://vimeos.net/embed-9lr6b2yfw313.html"},
    {"title": "El Viaje Del Divorcio", "year": "2023", "embed": "https://vimeos.net/embed-j2ywo19cbuai.html"},
    {"title": "El Día del Fin del Mundo: Migración", "year": "2026", "embed": "https://vimeos.net/embed-7ntqznsbfu2j.html"},
    {"title": "Ceguera", "year": "2008", "embed": "https://vimeos.net/embed-jl216bzxp0tz.html"},
    {"title": "Máquina de guerra", "year": "2026", "embed": "https://vimeos.net/embed-gu0ui9l378lj.html"},
    {"title": "Peaky Blinders: El hombre inmortal", "year": "2026", "embed": "https://vimeos.net/embed-8epeo5kvvb7e.html"},
    {"title": "Avatar: Fuego y ceniza", "year": "2025", "embed": "https://vimeos.net/embed-aibs2c6nsy1h.html"},
    {"title": "Si pudiera, te daría una patada", "year": "2025", "embed": "https://vimeos.net/embed-o1k2lx8m6r0r.html"},
    {"title": "Gladiator Underground", "year": "2025", "embed": "https://vimeos.net/embed-lwbjcacaplby.html"},
    {"title": "Noche De Paz, Noche De Horror", "year": "2025", "embed": "https://vimeos.net/embed-05l1ujzvixnb.html"},
    {"title": "Zeta", "year": "2026", "embed": "https://vimeos.net/embed-7msjvajelmhg.html"},
    {"title": "La séptima profecía", "year": "1988", "embed": "https://vimeos.net/embed-nrtt3td7twgm.html"},
    {"title": "La Pantera Rosa", "year": "2006", "embed": "https://vimeos.net/embed-b60pihoqjbf2.html"},
    {"title": "101 dálmatas: ¡Ahora la magia es real!", "year": "1996", "embed": "https://vimeos.net/embed-m5sduokyv551.html"},
    {"title": "Detox de plásticos", "year": "2026", "embed": "https://vimeos.net/embed-an1m0gmw2agt.html"},
    {"title": "Antes Del Fin Del Mundo", "year": "2025", "embed": "https://vimeos.net/embed-drjmhuynh8f1.html"},
    {"title": "Terrestrial", "year": "2024", "embed": "https://vimeos.net/embed-g30jrmx51rw0.html"},
    {"title": "Pesadilla Jurásica", "year": "2012", "embed": "https://vimeos.net/embed-qjumwuo8pqhk.html"},
    {"title": "National Anthem", "year": "2024", "embed": "https://vimeos.net/embed-i6yni8kn51v0.html"},
    {"title": "Milagro en la Celda 7", "year": "2019", "embed": "https://vimeos.net/embed-9l051schfl7k.html"},
    {"title": "A Christmas Witness", "year": "2021", "embed": "https://vimeos.net/embed-xblfjehod6sx.html"},
    {"title": "Skate to Hell", "year": "2026", "embed": "https://vimeos.net/embed-0b1a2sd3y114.html"},
    {"title": "The Hermit", "year": "2025", "embed": "NOT_FOUND"},
    {"title": "Pushed Off a Plane and Survived", "year": "2026", "embed": "https://vimeos.net/embed-g9vluh0fnx7q.html"},
    {"title": "No te olvidaré", "year": "2026", "embed": "https://vimeos.net/embed-5prl996nqlxn.html"},
    {"title": "Instinto Implacable", "year": "2026", "embed": "https://vimeos.net/embed-awlfivhkr9ap.html"},
    {"title": "For Worse", "year": "2026", "embed": "https://vimeos.net/embed-f948ncvb9pag.html"},
    {"title": "DRAGN", "year": "2025", "embed": "https://vimeos.net/embed-ebqfsnz1qjs8.html"},
    {"title": "Dolly", "year": "2026", "embed": "https://vimeos.net/embed-w8cq4q7odfmx.html"},
    {"title": "Alerta Máxima 2", "year": "1995", "embed": "https://vimeos.net/embed-63huu9ozkvoj.html"},
    {"title": "Vecinos cercanos del 3er tipo", "year": "2012", "embed": "https://vimeos.net/embed-pl2jevm0jh6w.html"},
    {"title": "Sentencia De Muerte", "year": "1990", "embed": "https://vimeos.net/embed-v1dyfjcss5tv.html"},
    {"title": "La aparicion", "year": "2012", "embed": "https://vimeos.net/embed-cxxbgv4jtt8w.html"},
    {"title": "Locura en el paraíso", "year": "2012", "embed": "https://vimeos.net/embed-22cpsc2yqilo.html"},
    {"title": "Diario de un Rebelde", "year": "1995", "embed": "https://vimeos.net/embed-bkhtitl7h8vm.html"},
    {"title": "Hotel Transylvania 3: Monstruos de vacaciones", "year": "2018", "embed": "https://vimeos.net/embed-56o8i6xgc743.html"},
    {"title": "Vengador Anónimo", "year": "2011", "embed": "https://vimeos.net/embed-g1lpnfl0axu5.html"},
    {"title": "El maestro luchador", "year": "2012", "embed": "https://vimeos.net/embed-e63f9lg04amq.html"},
    {"title": "El Vuelo", "year": "2012", "embed": "https://vimeos.net/embed-y2givumlshgc.html"},
    {"title": "Ése es mi hijo", "year": "2012", "embed": "https://vimeos.net/embed-9o13zofi4fgh.html"},
    {"title": "El Cielo y la Tierra", "year": "1993", "embed": "https://vimeos.net/embed-wf0rzwqz2p2g.html"},
    {"title": "¿Qué Voy a Hacer con Mi Marido?", "year": "2012", "embed": "https://vimeos.net/embed-hv4w7t91rwf7.html"},
    {"title": "My Amish Double Life", "year": "2025", "embed": "https://vimeos.net/embed-w1xd0ivkbplt.html"},
    {"title": "Un hombre por semana", "year": "2026", "embed": "https://vimeos.net/embed-fd369lvyf040.html"},
    {"title": "Patrulla Nocturna", "year": "2026", "embed": "https://vimeos.net/embed-v0v2rophvk6q.html"},
    {"title": "Scream 7", "year": "2026", "embed": "https://vimeos.net/embed-zhjbp2ckgzms.html"}
]

conn = http.client.HTTPSConnection("api.themoviedb.org")

results = []

for movie in movies_list:
    query = urllib.parse.quote(movie["title"])
    year = movie["year"]
    conn.request("GET", f"/3/search/movie?api_key={TMDB_API_KEY}&query={query}&year={year}&language=es-ES")
    res = conn.getresponse()
    data = json.loads(res.read())
    
    if data.get("results"):
        best_match = data["results"][0]
        results.append({
            "title": movie["title"],
            "tmdb_id": best_match["id"],
            "embed": movie["embed"]
        })
    else:
        # Reintentar sin año si no se encuentra
        conn.request("GET", f"/3/search/movie?api_key={TMDB_API_KEY}&query={query}&language=es-ES")
        res = conn.getresponse()
        data = json.loads(res.read())
        if data.get("results"):
            best_match = data["results"][0]
            results.append({
                "title": movie["title"],
                "tmdb_id": best_match["id"],
                "embed": movie["embed"]
            })
        else:
            results.append({
                "title": movie["title"],
                "tmdb_id": "NOT_FOUND",
                "embed": movie["embed"]
            })

print(json.dumps(results, indent=2))
