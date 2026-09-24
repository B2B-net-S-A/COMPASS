# Wymagania obecności i zastępstwa

Migracja `20260922141958_academy_session_obligations.sql` zamraża listę wymaganych sesji przy publikacji edycji. Zamknięty program i jego kryteria ukończenia pochodzą z przypiętej wersji kursu. Edycja opublikowana nie może wrócić do szkicu ani zmienić przypiętej wersji.

- Zmiana daty przyszłej sesji zachowuje jej identyfikator i obowiązek obecności. Wysłane wcześniej zaproszenie firmowe aktualizuje worker; użytkownik linku zewnętrznego aktualizuje termin także u organizatora i pobiera ponownie ICS.
- Po publikacji nie można zmienić pola „wymagana” ani dodać nowego obowiązku. Dodatkowe zwykłe spotkania są opcjonalne; inny wymagany program potrzebuje nowej edycji.
- Odwołana wymagana sesja pozostaje niespełnionym obowiązkiem. Jej usunięcie lub wznowienie pod tym samym identyfikatorem jest blokowane. Odwołanie całej edycji nie daje zaliczenia.
- `replaceAcademySession` / `academy_replace_session` tworzy jawne zastępstwo z uzasadnieniem. Nowa sesja dziedziczy obowiązek; poprzednia zachowuje historię. Kolejne zastępstwa nadal realizują jeden pierwotny obowiązek. Wcześniejsze decyzje obecności nie są kopiowane.
- Zastępstwo firmowego Teams jest dostępne po potwierdzeniu odwołania starego spotkania przez worker i zakończeniu jego kolejki. Brak uprawnień Graph, błąd odczytu lub niejednoznaczna synchronizacja blokuje ten krok. Błąd aktualizacji istniejącego wydarzenia nie wywołuje utworzenia nowego. Identyfikator transakcji i odzyskanie wydarzenia po znaczniku nadal zabezpieczają ponawianie tego samego zadania.
- Dla linku zewnętrznego prowadzący potwierdza odwołanie poprzedniego spotkania u organizatora. Compass zapisuje potwierdzenie i uzasadnienie; nie może sprawdzić cudzej skrzynki ani anulować wydarzenia bez dostępu.
- Istniejący mechanizm powiadomień wysyła uczestnikom zmianę/odwołanie oraz nowy termin w aplikacji. Nie dodano automatycznych wiadomości email.
- Operacje sesji blokują edycję przed sesją i zapisem uczestnika. Unikalne powiązanie zastępstwa i atomowe przeniesienie obowiązku zapobiegają dwóm zastępstwom dla tej samej sesji. Wystawione zaliczenie nadal blokuje zwykłą zmianę sesji; jego unieważnienie ma osobny audytowany proces.

Odczyt edycji zawiera `replacesSessionId`, `replacementSessionId`, `canReplace` oraz własne `completionRevokedAt` / `completionRevokedReason`. UI pokazuje brakujący termin zastępczy; nie pokazuje certyfikatu dla unieważnionego ukończenia.

Weryfikacja: `scripts/test-academy-session-obligations-db.mjs` sprawdza SQL/RLS, próby ominięcia niezmienności, odwołanie jednej z kilku wymaganych sesji, rescheduling, łańcuch zastępstw, brak transferu obecności, audyt i blokadę przejścia z błędu Graph do ręcznego linku. W hosted PostgreSQL dodatkowo uruchamia dwie równoległe próby zastępstwa. PGlite lokalnie nie stanowi dowodu współbieżności. Testy komponentów i workera sprawdzają tę samą ścieżkę użytkownika oraz brak ponownego create przy błędzie update/cancel. Testy nie tworzą spotkań M365.
