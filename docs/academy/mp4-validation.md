# Weryfikacja nagrań MP4

## Przygotowanie nagrania (normalizator)

Jedna komenda, z katalogu `COMPASS/`, na laptopie:

```bash
scripts/academy-normalize-video.sh /sciezka/nagranie.mp4
```

Wymaga `ffmpeg` (`brew install ffmpeg`) i `npm ci` w `COMPASS/`. Wynik to `nagranie.normalized.mp4` obok oryginału: H.264 8-bit 4:2:0, AAC-LC, `faststart`, przeplot co sekundę, bez metadanych źródła. Plik dostaje tę nazwę dopiero po przejściu `Mp4StreamValidator`, czyli tego samego parsera co skaner po uploadzie. Sam walidator: `npx tsx scripts/academy-validate-mp4.ts plik.mp4`.

Gdy wynik przekracza 1 GiB, podziel nagranie: `scripts/academy-normalize-video.sh --part-minutes 45 nagranie.mp4` tworzy `nagranie.part01.normalized.mp4` i kolejne części.

Reguła kopii: na SharePoint trafiają oba pliki, oryginał i wersja znormalizowana. Do Akademii wgrywa się tylko `.normalized.mp4`.

Transkodowania nie uruchamiamy na serwerze. CAX21 jest jednocześnie produkcją i build-hostem, więc skrypt odmawia pracy na hoście `compass-prod` i w kontenerach Coolify.

`-chunk_duration 1000000` jest w skrypcie celowo. Domyślnie ffmpeg przeplata ścieżki niemal co próbkę, a parser przyjmuje najwyżej 100 tys. zakresów chunków.

## Zasady parsera

Skaner weryfikuje strukturę całego pliku i konfigurację zadeklarowanych kodeków przed nadaniem `ready`. Nie dekoduje każdej klatki ani próbki audio; odtworzenie i przewijanie rzeczywistego nagrania w przeglądarce pozostaje osobnym testem odbioru.

Obsługiwany profil: zwykły, niesegmentowany MP4; dokładnie jedna ścieżka obrazu `avc1` (H.264 Baseline/Main/High, 8-bit 4:2:0, poziomy do 5.2) i opcjonalnie jedna ścieżka `mp4a` z AAC-LC. Sam napis `mp4a` nie wystarcza: deskryptory ESDS/AudioSpecificConfig muszą wskazywać AAC-LC. Parametry AVC wymagają poprawnych granic i obecności SPS/PPS. Szyfrowanie, zewnętrzne referencje, inne kodeki, dodatkowe ścieżki oraz fragmentowane `moof`/`mvex` są odrzucane z polskim komunikatem ponownego eksportu. Napisy należy przesłać osobno jako VTT.

Parser dostaje te same bajty, które trafiają do ClamAV i SHA-256, ze stałego, autoryzowanego źródła Storage. Nie wykonuje dodatkowych żądań, nie rozwiązuje URL z MP4, nie zapisuje plików tymczasowych ani nie korzysta z FFmpeg. Buforuje najwyżej 8 MiB metadanych `moov`, nagłówek do 16 bajtów i `ftyp` do 4 KiB; pomija payload `mdat`. Dopuszcza do 256 boxów na parsowany poziom, 128 zakresów `mdat`, milion próbek na ścieżkę oraz 100 tys. zakresów chunków łącznie. Liczby próbek nie tworzą tablic obiektów; liczność i długość tablic są weryfikowane przed iteracją. Rozmiary 64-bitowe muszą być bezpiecznymi liczbami całkowitymi JavaScript i mieścić się w pliku do 1 GiB.

Warunki akceptacji: kompletny transfer i granice boxów; jedno `ftyp` i `moov`; spójne `stsz`, `stts`, `stsc`, `stco`/`co64`, opcjonalne `ctts`/`stss`; każda niepusta próbka mieści się w `mdat`, a zakresy chunków nie nakładają się. Metadane mogą występować przed lub po danych. Sam 24-bajtowy nagłówek `ftyp` zawsze jest odrzucany. Zgoda AV i poprawność MP4 są wymagane niezależnie; błąd parsera nie może wysłać ACK z pozytywnym SHA.

Testy używają niewielkich rzeczywistych [plików WPT z licencją i hashami](../../COMPASS/lib/academy/__tests__/fixtures/mp4/README.md): poprawne AVC Baseline/High z AAC-LC, rzeczywisty AVC z MP3 jako przypadek negatywny, oraz uszkodzenia tworzone w pamięci. Obejmują granice strumienia po jednym bajcie, ucięte dane, fałszywe rozmiary/liczniki/offsety, nakładające się próbki, HEVC/AV1/szyfrowanie, HE-AAC, referencje zewnętrzne i brak pozytywnego ACK skanera po błędzie. Nie zastępują produkcyjnego uploadu ani testu dekodera przeglądarki.

Źródła formatu: [W3C ISO BMFF Byte Stream Format](https://www.w3.org/TR/mse-byte-stream-format-isobmff/), [RFC 6381 — identyfikatory kodeków](https://www.rfc-editor.org/rfc/rfc6381), [GPAC AVC configuration parser](https://github.com/gpac/mp4box.js/blob/main/src/boxes/avcC.ts). Własny parser celowo ogranicza obsługiwany profil; nie jest ogólnym demukserem ani transkoderem.
