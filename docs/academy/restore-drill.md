# Akademia: kontrola odtworzenia bazy i plików

`verify.mjs` **nie wykonuje backupu ani restore**. Nie łączy się z siecią, nie czyta poświadczeń i nie modyfikuje bazy ani obiektów. Porównuje dwa dostarczone lokalnie zrzuty: źródłowy manifest z niezależnie zachowanym SHA-256 oraz eksport i pliki odtworzonego, odizolowanego środowiska. Uruchomienie samego testu na syntetycznych danych nie dowodzi odtwarzalności produkcji.

`capture-storage.mjs` jest osobnym, opcjonalnym krokiem **tylko do odczytu** dla upoważnionego operatora. Poza offline verifierem pobiera faktyczne bajty obiektów wymienionych w dostarczonym eksporcie bazy przez prywatny endpoint Storage. Wymaga dokładnej zgodności `--project-ref` z adresem projektu, nowego katalogu wynikowego, klucza w zmiennej procesu oraz pełnej walidacji eksportu. Nie pobiera innych bucketów, nie publikuje artefaktów, nie wypisuje klucza ani ścieżek obiektów. Nie uruchamiaj go automatycznie w publicznym CI z danymi produkcyjnymi.

Hosted CI (`academy-storage.yml`) wykonuje osobny **syntetyczny test odtworzenia** po teście prawdziwego Supabase Auth/Storage. Na jednorazowym runnerze eksportuje 39 tabel Akademii i pobiera rzeczywiste bajty przez Storage API, zapisuje manifest, robi `pg_dump` pełnej bazy lokalnego Supabase i odtwarza go przez `pg_restore` do nowej bazy z właścicielami i uprawnieniami Storage. Uruchamia drugie Storage API, podłączone wyłącznie do odtworzonej bazy i pustego, osobnego katalogu plików. Odczyt z docelowego API pod oryginalną ścieżką musi przed przywróceniem odmówić pobrania (404 lub 500, gdy odtworzone metadane wskazują na brakujące bajty). Test przesyła do tego API bajty backupu, pobiera je spod oryginalnych ścieżek `academy-materials` i `documents/courses`, sprawdza SHA-256 oraz zgodność 39 tabel. Ponieważ pełny dump zawiera metadane `storage.objects`, tylko w jednorazowej bazie docelowej na czas uploadu wyłącza blokadę nadpisania gotowych materiałów; przed końcowym odczytem weryfikuje jej ponowne włączenie. Test wymaga istniejących kursów, zapisów, ukończenia, obecności, uruchomień, sesji i gotowych materiałów; nie akceptuje pustego snapshotu. Skrypt działa tylko w GitHub-hosted Linux CI, usuwa lokalne zrzuty i nie publikuje ich jako artefaktów.

Ten gate dowodzi działania ścieżki narzędziowej dla danych testowych, w tym odczytu pliku z **docelowego Storage API pod ścieżką aplikacji**. Docelowe API, baza i katalog plików są rozdzielone od źródła, lecz znajdują się na tym samym jednorazowym runnerze i w tym samym klastrze PostgreSQL. Nie jest to próba zarządzanego odtworzenia do niezależnego projektu Supabase, pomiar RPO/RTO ani dowód, że produkcyjne kopie bazy i plików istnieją i dają się odtworzyć. Te warunki nadal wymagają odrębnego ćwiczenia operacyjnego.

## Zakres i warunki

- Źródło i odtworzenie muszą reprezentować **ten sam punkt czasu**. Pliki `export.json` i obiekty Storage trzeba zebrać ze spójnego, zatrzymanego lub inaczej skoordynowanego snapshotu. Dwa niezależne odczyty żywego systemu mogą dać fałszywy błąd albo nie uchwycić utraty danych.
- Manifest źródłowy oraz **jego SHA-256 poza tym samym backupem** należy zapisać przed testem restore. Zbudowanie manifestu dopiero z odtworzonej kopii byłoby porównaniem danych z samymi sobą.
- Kopia docelowa musi być izolowana od produkcyjnych cronów, Graph/Teams, poczty, webhooków i klientów. Przywracanie bazy do projektu produkcyjnego nie jest częścią testu. Koszt nowego projektu i docelowe RPO/RTO wymagają odrębnej decyzji operacyjnej.
- W katalogach testowych mogą znaleźć się dane osobowe i treść materiałów. Dopuszczaj tylko upoważnionych operatorów; przechowuj je na chronionym dysku i usuń według zaakceptowanej polityki po odbiorze. Manifest zawiera ścieżki plików, lecz nie treść wierszy bazy; raport błędów używa hashy kluczy obiektów.

## Kontrolowane zebranie danych pilota po jego zakończeniu

Ta procedura nie jest teraz wykonywana: wymaga niepustych danych pilota, upoważnionego operatora oraz wskazanego, istniejącego celu izolowanego od produkcji. Nie tworzy nowego projektu, usługi ani płatnego backupu, ale pobranie plików zużywa egress Supabase. Jeśli brak izolowanego celu, zatwierdzonego sposobu obsługi danych osobowych poza produkcją lub potwierdzonego wolnego limitu egress i aktywnej kontroli kosztów, próbę zatrzymujemy na etapie przygotowania; zgodności produkcyjnego restore nie można wtedy oznaczyć jako zaliczonej.

1. Uzgodnij punkt czasu i zatrzymaj zmiany w Akademii na czas skoordynowanego snapshotu bazy i Storage. Zidentyfikuj źródłowy projekt i sprawdź, że wybrany cel odtworzenia nie ma połączenia z produkcyjnymi cronami, pocztą, Graph/Teams ani klientami. Nie kieruj `pg_restore` ani uploadu na produkcję.
2. Na uprawnionym, zabezpieczonym hoście przygotuj prywatny katalog **poza repozytorium i artefaktami CI**. Wyeksportuj bazę istniejącą procedurą backupu, zachowując `auth`, `storage`, `public` i `academy_private`; w tej samej spójnej kopii wykonaj `export.sql`. Ten plik eksportu służy do weryfikacji 39 tabel, nie zastępuje pełnego dumpu bazy.
3. Sprawdź bieżące zużycie egress organizacji, pozostały limit planu i Spend Cap; uwzględnij eksport bazy oraz późniejsze pobranie ze źródła i celu. Ustaw `ACADEMY_EGRESS_BUDGET_BYTES` na bezpieczną część potwierdzonego wolnego limitu. Skrypt wymaga tej wartości i przerywa przed pobraniem pliku z większym znanym `Content-Length` albo po przekroczeniu limitu w strumieniu; nie zastępuje to kontroli limitu całej organizacji. Pobierz bajty wymienione w `export.json`. Zasil `ACADEMY_RESTORE_STORAGE_KEY` bezpośrednio z istniejącego magazynu sekretów do środowiska procesu; nie wpisuj wartości w wierszu polecenia, pliku projektu ani logu. Przykład po ustawieniu obu zmiennych i katalogu źródła:

   ```bash
   umask 077
   ACADEMY_SOURCE_REF=shduiynzemftkqqefscd
   node ops/academy/restore/capture-storage.mjs \
     --export /secure/source/export.json \
     --objects /secure/source/objects \
     --source-url "https://${ACADEMY_SOURCE_REF}.supabase.co/" \
     --project-ref "$ACADEMY_SOURCE_REF" \
     --max-bytes "$ACADEMY_EGRESS_BUDGET_BYTES"
   node ops/academy/restore/verify.mjs seal \
     --export /secure/source/export.json --objects /secure/source/objects \
     --manifest /secure/source-manifest.json --snapshot-id academy-pilot-YYYYMMDD
   ```

   `ACADEMY_SOURCE_REF` to identyfikator rzeczywistego źródła; sprawdź go ponownie przed wykonaniem. `/secure/source/objects` musi **nie istnieć** przed startem. Nie zapisuj zrzutów ani manifestu w GitHub Actions artifacts. Zachowaj wypisany `manifestSha256` w niezależnym rejestrze dowodów. Skrypt usuwa częściowo pobrane pliki po błędzie i nie przechodzi przy brakującym obiekcie, błędnej ścieżce lub niezgodnym hashu gotowego materiału.
4. Odtwórz pełny dump do wcześniej wskazanego izolowanego celu. Przywróć bajty **przez jego Storage API**, do oryginalnych bucketów i ścieżek, uzgadniając metadane z odtworzoną bazą. Nie wstawiaj ręcznie rekordów `storage.objects` jako substytutu plików. Jeśli po odtworzeniu metadanych niezmienny materiał blokuje upload, użyj wyłącznie dedykowanego celu jednorazowego i kontrolowanej procedury jak w syntetycznym gate, z obowiązkowym ponownym włączeniem strażnika; na celu współdzielonym zatrzymaj próbę. Pobierz bajty z docelowego API tym samym `capture-storage.mjs`, używając docelowego URL, ref i klucza oraz osobnego, nowego katalogu `/secure/restored/objects`.
5. Wykonaj `export.sql` na docelowej bazie i `verify.mjs verify` z niezależnym SHA manifestu. Udokumentuj wynik, rzeczywisty czas przywrócenia, zakres danych, RPO/RTO i brak skutków w źródle. Przed uznaniem próby za zaliczoną sprawdź niepuste dane kursu, zapisu, ukończenia, obecności i materiału, a następnie odczyt pliku i przepływ uprawnień w docelowej aplikacji. Usuń kopie według zatwierdzonej retencji.

`capture-storage.mjs` nie robi snapshotu bazy ani uploadu do celu. Nie gwarantuje zgodności, jeśli baza i Storage zmienią się pomiędzy eksportem a pobraniem. Bez skoordynowanego punktu czasu, izolowanego celu i przywrócenia plików wynik pozostaje **niezweryfikowany**. [Supabase potwierdza osobny backup bajtów Storage](https://supabase.com/docs/guides/platform/backups), [pobieranie przez prywatny API](https://supabase.com/docs/guides/storage/serving/downloads) oraz [naliczanie egress po przekroczeniu limitu planu](https://supabase.com/docs/guides/platform/manage-your-usage/egress).

## Wejścia

`export.sql` wykonuje pojedynczą transakcję `REPEATABLE READ READ ONLY` i eksportuje 39 wskazanych tabel `public`/`academy_private` jako JSON. Wymaga konta uprawnionego do odczytu tych tabel oraz `storage.objects` **na odizolowanej kopii**, nie służy do pobierania produkcyjnej bazy. Eksport obejmuje m.in. kursy, wersje, lekcje, quizy, zapisy, ukończenia i snapshoty certyfikatów, nagrody Akademii, sesje, obecność, surowe raporty, kolejki, audyt oraz prywatne tabele kontrybutorów. Zawiera też listę faktycznych tabel Akademii z katalogu PostgreSQL i klucze obiektów w `academy-materials` oraz `documents/courses/`; dodatkowa lub brakująca tabela albo brak bajtów któregokolwiek z tych obiektów zatrzymuje test. Dotyczy to również plików jeszcze nieoznaczonych jako gotowe i plików bez powiązania z lekcją. Po zmianie schematu lista i test muszą zostać zaktualizowane przed użyciem. Format eksportu i manifestu ma wersję `compass-academy-restore-v2`; starsze manifesty trzeba wygenerować ponownie z odpowiadającego im snapshotu.

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
