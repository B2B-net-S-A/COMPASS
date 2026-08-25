# docs/modules — specyfikacje sprzed wdrożenia (ARCHIWUM)

> **To NIE jest opis tego, co działa w COMPASS.** To 13 specyfikacji produktowych z lutego 2025 /
> lutego 2026, napisanych **przed** implementacją, dla produktu o ówczesnej nazwie **„Qualrix by
> B2B.net S.A."**. Razem ~1,1 MB tekstu. Od `chore: initial import` (2026-04-21) nikt ich nie
> tknął — nie były aktualizowane ani razu przez 54 fazy wdrożenia, które faktycznie zbudowały
> aplikację.

**Zanim uznasz cokolwiek z tego katalogu za stan faktyczny — sprawdź w kodzie.** Rozjazdy, które
widać gołym okiem:

- **Nazwa produktu.** Dziś aplikacja nazywa się **COMPASS** (wielkimi literami), nie „Qualrix".
- **Moduły, których nigdy nie zbudowano.** `DOC-M12_Right_to_Hire` i `DOC-M13_Alumni_Management`
  nie mają w kodzie **ani jednego** trafienia (`grep -ril "alumni\|right.to.hire" COMPASS/{app,lib,components}`
  → 0 plików). `DOC-M2_Marketplace_Projektow` ma jedno przypadkowe trafienie w słowie, nie w module.
- **Moduły, które zbudowano inaczej niż w specyfikacji.** Np. `DOC-M3_Program_Lojalnosciowy`
  odpowiada dzisiejszej **Lidze** (`app/(protected)/league/`), a nie temu, co opisuje dokument.
- **Stos.** Specyfikacje zakładają m.in. `next-intl` (PL+EN) — aplikacja jest jednojęzyczna.

**Do czego to się nadaje:** kontekst „co pierwotnie planowano i dlaczego", gdy projektujesz nową
funkcję w tym obszarze. **Do czego się nie nadaje:** ustalanie, jak coś działa dziś, jakie są
nazwy tabel, jakie trasy istnieją.

**Gdzie szukać stanu faktycznego:**

| Pytanie | Źródło |
|---|---|
| „Jak tego nie zepsuć" — żywe reguły | `CLAUDE.md` (root repo) |
| „Dlaczego to tak wygląda" — historia 54 faz | `docs/historia-faz.md` |
| „Co jest zepsute / do naprawy" | `docs/audyt-2026-08-plan-naprawy.md` |
| Co realnie istnieje w kodzie | sam kod — `ls`, `grep` |

Ta sama uwaga dotyczy `docs/architecture/DOC-0_Architektura_i_Fundament.md` (86 KB, ten sam import,
ta sama nazwa produktu) oraz `docs/prototypes/Qualrix_Architecture_Map.html`.

> Katalog zostaje świadomie — decyzja, czy specyfikacje usunąć, czy przenieść do `docs/archiwum/`,
> należy do właściciela produktu. Do tego czasu ten plik ma zapobiegać czytaniu ich jak dokumentacji.
