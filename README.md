# Tennisclip-knipper

Tennisvideo's analyseren in je browser: slagen taggen en knippen, een skeletmodel over je slagen leggen, je techniek meten, en de bal volgen (experimenteel).

**Starten:** open de GitHub Pages-link van deze repository in Chrome of Edge op een computer. Je video wordt **niet** geüpload: alles draait lokaal in je browser.

## Wat het kan
- **Knippen:** tag slagen met een sneltoets op het raakmoment (F forehand, B backhand, S service, V volley, X overig). Exporteer daarna een montage, losse clips als zip, of ffmpeg-commando's.
- **Speler kiezen (W):** alle spelers in beeld krijgen een nummer; klik op wie gevolgd moet worden.
- **Skelet (K)** en **slaganalyse:** kniehoek, romphelling, elleboog, indraaien, hoogtecurve, handsnelheid en afmaken. Raakmomenten loop je langs met N en zet je vast met T. De uitkomsten exporteer je als analyseblad (png) of als csv.
- **Bal-tracking (experimenteel):** kalibreer de baan met 4 klikken. Daarna geeft de app per slag het stuitpunt, de diepte, de kant, of de bal in of uit was, en de gemiddelde snelheid, plus een plattegrond van alle stuitpunten.

Alle sneltoetsen staan in de app onder *Sneltoetsen & werkwijze*.

## Lokaal draaien
De app moet via een webserver geopend worden; dubbelklikken op `index.html` werkt niet.
```
python -m http.server 8000
```
Ga daarna naar http://localhost:8000.

## Opbouw
| Bestand | Wat |
|---|---|
| `index.html` | de app (HTML, CSS en JS in één bestand) |
| `vision_bundle.mjs`, `wasm/` | MediaPipe Tasks Vision (bibliotheek en WebAssembly) |
| `pose_model.wasm` | MediaPipe-model *pose_landmarker_full* (hernoemd van `.task`) |

## Licenties
MediaPipe-bibliotheek en -model: Apache License 2.0, © Google.
Metingen zijn 2D-schattingen vanuit één camerahoek en niet wetenschappelijk gevalideerd. Ze zijn bedoeld om je eigen slagen met elkaar te vergelijken.
