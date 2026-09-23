# Akademia: kontrola odtworzenia bazy i plików

To narzędzie **nie wykonuje backupu ani restore**. Nie łączy się z siecią, nie czyta poświadczeń i nie modyfikuje bazy ani obiektów. Porównuje dwa dostarczone lokalnie zrzuty: źródłowy manifest z niezależnie zachowanym SHA-256 oraz eksport i pliki odtworzonego, odizolowanego środowiska. Uruchomienie samego testu na syntetycznych danych nie dowodzi odtwarzalności produkcji.

Hosted CI (`academy-storage.yml`) wykonuje osobny **syntetyczny test odtworzenia** po teście prawdziwego Supabase Auth/Storage. Na jednorazowym runnerze eksportuje 39 tabel Akademii i pobiera rzeczywiste bajty przez Storage API, zapisuje manifest, robi `pg_dump` pełnej bazy lokalnego Supabase, odtwarza go przez `pg_restore` do nowej bazy i przesyła pliki do nowego prywatnego bucketu przez Storage API. Porównuje odtworzone metadane `storage.objects`, ponownie pobiera pliki i sprawdza eksport tym weryfikatorem. Test wymaga istniejących kursów, zapisów, ukończenia, obecności, uruchomień, sesji i gotowych materiałów; nie akceptuje pustego snapshotu. Skrypt działa tylko w GitHub-hosted Linux CI, usuwa lokalne zrzuty i nie publikuje ich jako artefaktów.

Ten gate dowodzi działania ścieżki narzędziowej dla danych testowych. Docelowe bajty Storage są odtwarzane w osobnym bucketcie **tego samego jednorazowego projektu**, a baza w osobnej bazie tego samego klastra. Nie jest to próba odtworzenia do niezależnego projektu, pomiar RPO/RTO ani dowód, że produkcyjne kopie bazy i plików istnieją i dają się odtworzyć. Te warunki nadal wymagają odrębnego ćwiczenia operacyjnego.

## Zakres i warunki

- Źródło i odtworzenie muszą reprezentować **ten sam punkt czasu**. Pliki `export.json` i obiekty Storage trzeba zebrać ze spójnego, zatrzymanego lub inaczej skoordynowanego snapshotu. Dwa niezależne odczyty żywego systemu mogą dać fałszywy błąd albo nie uchwycić utraty danych.
- Manifest źródłowy oraz **jego SHA-256 poza tym samym backupem** należy zapisać przed testem restore. Zbudowanie manifestu dopiero z odtworzonej kopii byłoby porównaniem danych z samymi sobą.
- Kopia docelowa musi być izolowana od produkcyjnych cronów, Graph/Teams, poczty, webhooków i klientów. Przywracanie bazy do projektu produkcyjnego nie jest częścią testu. Koszt nowego projektu i docelowe RPO/RTO wymagają odrębnej decyzji operacyjnej.
- W katalogach testowych mogą znaleźć się dane osobowe i treść materiałów. Dopuszczaj tylko upoważnionych operatorów; przechowuj je na chronionym dysku i usuń według zaakceptowanej polityki po odbiorze. Manifest zawiera ścieżki plików, lecz nie treść wierszy bazy; raport błędów używa hashy kluczy obiektów.

## Wejścia

`export.sql` wykonuje pojedynczą transakcję `REPEATABLE READ READ ONLY` i eksportuje 39 wskazanych tabel `public`/`academy_private` jako JSON. Wymaga konta uprawnionego do odczytu tych tabel **na odizolowanej kopii**, nie służy do pobierania produkcyjnej bazy. Eksport obejmuje m.in. kursy, wersje, lekcje, quizy, zapisy, ukończenia i snapshoty certyfikatów, nagrody Akademii, sesje, obecność, surowe raporty, kolejki, audyt oraz prywatne tabele kontrybutorów. Zawiera też listę faktycznych tabel Akademii z katalogu PostgreSQL; dodatkowa lub brakująca tabela zatrzymuje test. Po zmianie schematu lista i test muszą zostać zaktualizowane przed użyciem.

Eksport jest jednym dokumentem JSON. Weryfikator odmawia odczytu pliku większego niż **128 MiB** przed załadowaniem go do pamięci; to narzędzie do pierwszych prób pilotażowych, a nie strumieniowy weryfikator pełnych, rosnących backupów enterprise. Przekroczenie limitu kończy test kodem 1 i wymaga zaprojektowania eksportu oraz porównania strumieniowego. Nie dziel tego samego snapshotu na niepowiązane fragmenty tylko po to, by uzyskać zielony wynik.

Struktura katalogów obiektów dla obu kopii:

```text
objects/
  academy-materials/<dokładna ścieżka obiektu>
  documents/courses/<dokładna historyczna ścieżka obiektu>
```

Katalogi `academy-materials` i `documents` są obowiązkowe, również przy zerowej liczbie plików. Materiały z innych ścieżek `documents` są poza zakresem. Kopiuj **bajty obiektów** przez obsługiwany interfejs Storage i zachowaj nazwy; sam dump tabel `storage.objects` nie przywraca plików. Nie zapisuj metadanych Storage przez ręczne `INSERT` jako substytutu uploadu.

Przykładowa kolejność dla już przygotowanych dwóch izolowanych kopii, przy dostępie `psql` skonfigurowanym poza tym narzędziem:

```bash
PGSERVICE=academy_restore_source psql -X -q -t -A -v ON_ERROR_STOP=1 \
  -f ops/academy/restore/export.sql > /secure/source/export.json
node ops/academy/restore/verify.mjs seal \
  --export /secure/source/export.json --objects /secure/source/objects \
  --manifest /secure/source-manifest.json --snapshot-id academy-20260923T120000Z
# Zapisz manifestSha256 z wyniku w niezależnym rejestrze dowodów.

PGSERVICE=academy_restore_target psql -X -q -t -A -v ON_ERROR_STOP=1 \
  -f ops/academy/restore/export.sql > /secure/restored/export.json
node ops/academy/restore/verify.mjs verify \
  --manifest /secure/source-manifest.json --expected-sha256 <SHA256_Z_REJESTRU> \
  --export /secure/restored/export.json --objects /secure/restored/objects
```

Przed wykonaniem eksportu operator potwierdza adresy obu izolowanych baz i przypisanie usług `PGSERVICE`; narzędzie nie dobiera połączenia. Pole `ok:true` i kod wyjścia 0 oznaczają zgodność wszystkich wymienionych wierszy oraz każdego obiektu w dwóch bucketach na poziomie rozmiaru i SHA-256. Dodatkowo sprawdzane są bajty gotowych materiałów i referencje w lekcjach; brak pliku lub niezgodność ze skanerskim `course_materials.sha256` kończy test błędem. Kod 1 oznacza niezgodność albo niekompletne wejście. W raporcie zapisz źródłowy punkt czasu, ostatni udany backup, najstarszy/najnowszy dostępny punkt odtworzenia, rzeczywisty czas wykonania, wynik testu oraz właściciela decyzji.

To **nie jest test całej instancji Compass**: nie sprawdza kont `auth.users`, profili, wspólnego salda loyalty, wszystkich tabel spoza Akademii, konfiguracji Auth/Storage, sekretów, działania skanera, zdarzeń istniejących u Microsoft ani logowania i przepływu UI. Po zgodności offline należy na odizolowanym środowisku przejść dostęp uprawnionego i nieuprawnionego użytkownika, pobranie pliku przez Storage, ukończenie szkolenia oraz status certyfikatu. Próba odtworzenia musi też zmierzyć RPO/RTO. Dla pierwotnej produkcji należy osobno potwierdzić harmonogram i ostatnie sukcesy kopii bazy oraz trwałe, niezależne kopie bajtów Storage. [Supabase potwierdza, że backup bazy nie zawiera plików Storage](https://supabase.com/docs/guides/platform/backups); [odtworzenie do nowego projektu także wymaga osobnego przeniesienia obiektów i ustawień Storage](https://supabase.com/docs/guides/platform/clone-project).
