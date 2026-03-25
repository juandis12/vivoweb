import http.client
import json
import urllib.parse
import sys
import codecs

# Configuración de salida UTF-8 para Windows
if sys.stdout.encoding != 'utf-8':
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.detach())

TMDB_API_KEY = "743275e25bcea0a320b87d2af271a136"

movies_list = [
    {"title": "Finge Estar Muerta", "year": "2025", "embed": "https://vimeos.net/embed-e1eyigr6twqi.html"},
    {"title": "A Timeless Christmas", "year": "2020", "embed": "https://vimeos.net/embed-tip5lqrd9mzc.html"},
    {"title": "El grillo y la hormiga", "year": "2023", "embed": "https://vimeos.net/embed-jlukge766tm2.html"},
    {"title": "Bad Cat", "year": "2016", "embed": "https://vimeos.net/embed-kur3mys3rioo.html"},
    {"title": "Boyfriends of Christmas Past", "year": "2021", "embed": "https://vimeos.net/embed-owjvnsivrk18.html"},
    {"title": "Algea: God of Pain", "year": "2024", "embed": "https://vimeos.net/embed-xaua1uibo44t.html"},
    {"title": "Atrapada en Mi Propia Casa", "year": "2024", "embed": "NOT_FOUND"},
    {"title": "Bibi", "year": "2023", "embed": "NOT_FOUND"},
    {"title": "De sombra y silencio", "year": "2023", "embed": "https://vimeos.net/embed-ox49bxcr99xi.html"},
    {"title": "Odd Thomas: Cazador de fantasmas", "year": "2013", "embed": "https://vimeos.net/embed-1yye772oo0hg.html"},
    {"title": "Fackham Hall", "year": "2025", "embed": "https://goodstream.one/embed-x05fkx4utrzo.html"},
    {"title": "Soundtrack to Sixteen", "year": "2020", "embed": "https://vimeos.net/embed-h7n3unh07xq5.html"},
    {"title": "La Night Del Fantasma", "year": "2013", "embed": "https://vimeos.net/embed-gb1vtvo1zq3n.html"},
    {"title": "El Guardián: Último refugio", "year": "2026", "embed": "https://vimeos.net/embed-wzzqe2tyb7t3.html"},
    {"title": "El granero Parte 2", "year": "2022", "embed": "https://vimeos.net/embed-3of7etg2it5i.html"},
    {"title": "The Breach", "year": "2022", "embed": "https://vimeos.net/embed-46y2h9njoopv.html"},
    {"title": "Parque Lezama", "year": "2026", "embed": "https://vimeos.net/embed-fimx9yhvhv9b.html"},
    {"title": "Nuremberg: El juicio del siglo", "year": "2025", "embed": "https://vimeos.net/embed-gnqfef0trvy9.html"},
    {"title": "Matar Vengar Repetir", "year": "2026", "embed": "https://vimeos.net/embed-qk5s8kjebp3g.html"},
    {"title": "Vida privada", "year": "2025", "embed": "https://vimeos.net/embed-16v8pago5fds.html"},
    {"title": "Amor en Costa Rica", "year": "2025", "embed": "https://vimeos.net/embed-o8hyi7o9f88e.html"},
    {"title": "Las Chicas de Wall", "year": "2025", "embed": "https://vimeos.net/embed-xhn9zpxkp58b.html"},
    {"title": "Catch Me If You Claus", "year": "2023", "embed": "https://vimeos.net/embed-t1kvgcy60fhc.html"},
    {"title": "A Fabled Holiday", "year": "2022", "embed": "https://vimeos.net/embed-h8hk7wrdv85u.html"},
    {"title": "Paradise Cove", "year": "2021", "embed": "https://vimeos.net/embed-3f7abafqf273.html"},
    {"title": "Amor Fuera De Tiempo", "year": "2025", "embed": "https://vimeos.net/embed-xhwzjz4gx6h3.html"},
    {"title": "Las Chicas Superpoderosas: La película", "year": "2002", "embed": "https://vimeos.net/embed-7iubbgskwuzp.html"},
    {"title": "Terror en Silent Hill: Regreso al infierno", "year": "2026", "embed": "https://vimeos.net/embed-2hyj4sw0xcor.html"},
    {"title": "El Plan Perfecto", "year": "2006", "embed": "https://vimeos.net/embed-xsowbcd6l7lf.html"},
    {"title": "Jinxed: Cuestión de Suerte", "year": "2013", "embed": "https://vimeos.net/embed-3mad2lf9eh1j.html"},
    {"title": "Venganza", "year": "2026", "embed": "https://vimeos.net/embed-edo65cxw6aj9.html"},
    {"title": "过家家", "year": "2026", "embed": "https://vimeos.net/embed-wbsmaefe1st1.html"},
    {"title": "Twenty One Pilots: More Than We Ever Imagined", "year": "2026", "embed": "https://vimeos.net/embed-p21de333e6vu.html"},
    {"title": "El umbral", "year": "2005", "embed": "https://vimeos.net/embed-vqm42cwpd3po.html"},
    {"title": "The Observance", "year": "2026", "embed": "https://vimeos.net/embed-4vk1ic1yupl1.html"},
    {"title": "The Dreadful", "year": "2026", "embed": "https://vimeos.net/embed-4w41obx2zm2n.html"},
    {"title": "¡La novia!", "year": "2026", "embed": "https://vimeos.net/embed-nt0d365ljgls.html"},
    {"title": "Psycho Killer", "year": "2026", "embed": "https://vimeos.net/embed-zjvvwgcblrim.html"},
    {"title": "Petaka Gunung Gede", "year": "2025", "embed": "https://vimeos.net/embed-7b0eesrrcka0.html"},
    {"title": "Minnie’s Midnight Massacre", "year": "2026", "embed": "https://vimeos.net/embed-ccjdhb2blgww.html"},
    {"title": "Midwinter Break", "year": "2026", "embed": "https://vimeos.net/embed-wb6th9djg844.html"},
    {"title": "Herman", "year": "2025", "embed": "https://vimeos.net/embed-o8ys4dqqt2p2.html"},
    {"title": "I Can Only Imagine 2", "year": "2026", "embed": "NOT_FOUND"},
    {"title": "Jugada maestra", "year": "2026", "embed": "https://vimeos.net/embed-8lrj7v4ityix.html"},
    {"title": "Haunters of the Silence", "year": "2025", "embed": "https://vimeos.net/embed-g1av6i9q2ewv.html"},
    {"title": "Hellfire", "year": "2026", "embed": "https://vimeos.net/embed-vxskgknibeqw.html"},
    {"title": "Couture", "year": "2026", "embed": "https://vimeos.net/embed-66w4of4lun7s.html"},
    {"title": "By Design", "year": "2026", "embed": "https://vimeos.net/embed-tkwsgo2xy5oq.html"},
    {"title": "Un destino en Corea", "year": "2026", "embed": "https://vimeos.net/embed-u2grzqtc9mej.html"},
    {"title": "Ba", "year": "2024", "embed": "https://vimeos.net/embed-3q5of6liuvce.html"},
    {"title": "Tears to a Glass Eye", "year": "2025", "embed": "https://vimeos.net/embed-qm2c19wn5cs9.html"},
    {"title": "¡Uf! ¿Solo amigos?", "year": "2026", "embed": "https://vimeos.net/embed-ist3euogtfle.html"},
    {"title": "The Knock Knock Man", "year": "2026", "embed": "https://vimeos.net/embed-bdgtwq945aw9.html"},
    {"title": "Repay It in Blood", "year": "2026", "embed": "https://vimeos.net/embed-kls9bp0yg1ag.html"},
    {"title": "Una última aventura: Detrás de cámaras de Stranger Things 5", "year": "2026", "embed": "https://vimeos.net/embed-g7hk87zoiahr.html"},
    {"title": "Mama's Little Murderer", "year": "2026", "embed": "https://vimeos.net/embed-iikuprszf2xr.html"},
    {"title": "De las cenizas: Bajo tierra", "year": "2026", "embed": "https://vimeos.net/embed-uqru7gfswitn.html"},
    {"title": "Enter Sanctum", "year": "None", "embed": "https://vimeos.net/embed-ugqp1etaa8bd.html"},
    {"title": "Una carta a mi juventud", "year": "2026", "embed": "https://vimeos.net/embed-pn1u1x5yvhfu.html"},
    {"title": "Oscar Shaw", "year": "2026", "embed": "https://vimeos.net/embed-22rgbjfcgosd.html"},
    {"title": "La celda de los milagros", "year": "2025", "embed": "https://vimeos.net/embed-ujjph6iacbsm.html"},
    {"title": "You're All Doomed", "year": "2026", "embed": "https://vimeos.net/embed-bctxby7n02uk.html"},
    {"title": "Pandora: Fire and Ice", "year": "2025", "embed": "https://vimeos.net/embed-gtimiknub5tj.html"},
    {"title": "La hora de los valientes", "year": "2025", "embed": "https://vimeos.net/embed-0yj58dbp5kr8.html"},
    {"title": "A Town Called Purgatory", "year": "2025", "embed": "https://vimeos.net/embed-swrl10mxl91n.html"},
    {"title": "El paseo 8", "year": "2025", "embed": "https://vimeos.net/embed-sj8tiqndeumt.html"},
    {"title": "Borrón y Vida Nueva", "year": "2025", "embed": "https://vimeos.net/embed-w1gj8yijn2jc.html"},
    {"title": "The Caretaker", "year": "2025", "embed": "https://vimeos.net/embed-79wpwzg7xrsq.html"},
    {"title": "Down River", "year": "2025", "embed": "https://vimeos.net/embed-s8co3hiidczk.html"},
    {"title": "The Dreamer Cinderella", "year": "2025", "embed": "https://vimeos.net/embed-ojhp860yys9o.html"},
    {"title": "Amorosa", "year": "2025", "embed": "https://vimeos.net/embed-bccqu0zyxpx7.html"},
    {"title": "Nadie sabe quién soy yo", "year": "2025", "embed": "https://vimeos.net/embed-wh852ci18dlb.html"},
    {"title": "Ojalá me lo hubieras dicho", "year": "2025", "embed": "https://vimeos.net/embed-7zmhgziq8zws.html"},
    {"title": "Tormento", "year": "2025", "embed": "https://vimeos.net/embed-54w9vgf7bb7o.html"},
    {"title": "La princesa Kaguya del cosmos", "year": "2026", "embed": "https://vimeos.net/embed-v8vsx7w3g0bc.html"},
    {"title": "Inthralled", "year": "2025", "embed": "https://vimeos.net/embed-zrzr8tcv6gf5.html"},
    {"title": "Las Ratas: Una historia de The Witcher", "year": "2025", "embed": "https://vimeos.net/embed-v6gi9jxwlh5k.html"},
    {"title": "Ahí estoy yo", "year": "2026", "embed": "https://vimeos.net/embed-duqdcx9fndgi.html"},
    {"title": "La primera nevada en Fraggle Rock", "year": "2025", "embed": "https://vimeos.net/embed-iohebpkjg37z.html"},
    {"title": "VHS Summer Camp", "year": "2026", "embed": "https://vimeos.net/embed-91hv31bica3a.html"},
    {"title": "Luderdale", "year": "2025", "embed": "https://vimeos.net/embed-kui8vy4ab8kt.html"},
    {"title": "Parking", "year": "2025", "embed": "https://vimeos.net/embed-kxdbdsf2usgw.html"},
    {"title": "Hogar siniestro", "year": "2025", "embed": "https://vimeos.net/embed-7phb5kakaw42.html"},
    {"title": "Baramulla", "year": "2025", "embed": "https://vimeos.net/embed-1bomg53826d9.html"},
    {"title": "Stephen", "year": "2025", "embed": "https://vimeos.net/embed-u36uv5a6w5jp.html"},
    {"title": "The Roughneck", "year": "2025", "embed": "https://vimeos.net/embed-4ebo9kbs48cu.html"},
    {"title": "Lost Horizon", "year": "2025", "embed": "https://vimeos.net/embed-4pahvxfpu00m.html"},
    {"title": "Signing Tony Raymond", "year": "2026", "embed": "https://vimeos.net/embed-8uyo0qs0nbms.html"},
    {"title": "The Raven", "year": "2025", "embed": "https://vimeos.net/embed-6obv9gcke10g.html"},
    {"title": "Patrulla de aterrizaje: Operación bola de nieve", "year": "2025", "embed": "https://vimeos.net/embed-85ysydkiinju.html"},
    {"title": "El tiempo que nos queda", "year": "2025", "embed": "https://vimeos.net/embed-d269wmafeier.html"},
    {"title": "Blindly in Love", "year": "2025", "embed": "https://vimeos.net/embed-kcvy399fctl5.html"},
    {"title": "LEGO Frozen: Operation Puffins", "year": "2025", "embed": "https://vimeos.net/embed-kxp0rwzrivfs.html"},
    {"title": "Los Muppets: Un show especial", "year": "2026", "embed": "https://vimeos.net/embed-ee3taj6t7twz.html"},
    {"title": "Rockstar: DUKI desde el fin del mundo", "year": "2025", "embed": "https://vimeos.net/embed-964qodko8dxu.html"},
    {"title": "Lone Samurai", "year": "2025", "embed": "https://vimeos.net/embed-6cizz3m1vi70.html"},
    {"title": "LO QUE SE OCULTA EN LAS SOMBRAS", "year": "2025", "embed": "https://vimeos.net/embed-q0r02ppktrpx.html"},
    {"title": "Speed Train", "year": "2025", "embed": "https://vimeos.net/embed-8iei5dkoe566.html"},
    {"title": "La huésped", "year": "2025", "embed": "https://vimeos.net/embed-m2zlmp8tds6g.html"},
    {"title": "Reinas de la Noche", "year": "2025", "embed": "https://vimeos.net/embed-jgcmh4l0c52i.html"}
]

conn = http.client.HTTPSConnection("api.themoviedb.org")

sql_buffer = "-- SQL Insert Script para video_sources\n-- Generado automáticamente por Vivotv Helper\n\n"

for movie in movies_list:
    if movie["embed"] == "NOT_FOUND":
        continue
        
    query = urllib.parse.quote(movie["title"])
    year = movie["year"]
    
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
        sql_buffer += f"INSERT INTO video_sources (tmdb_id, stream_url) VALUES ({tmdb_id}, '{movie['embed']}') ON CONFLICT (tmdb_id) DO NOTHING; -- {movie['title']} ({year})\n"
    else:
        sql_buffer += f"-- NOT FOUND: {movie['title']} ({year})\n"

conn.close()

# Escribir el archivo con encoding UTF-8 explícito
with open("d:/vivoweb/tools/import_movies.sql", "w", encoding="utf-8") as f:
    f.write(sql_buffer)

print("Done")
