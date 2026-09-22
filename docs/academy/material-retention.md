# Retencja niedokończonych i odrzuconych uploadów Akademii

Domyślnie endpoint /api/cron/academy-material-cleanup wykonuje tylko raport.
Tryb wykonania wymaga świadomie ustawionego ACADEMY_MATERIAL_CLEANUP_ENABLED=true
po zatwierdzeniu polityki i zakresu usuwania. Sam deploy nie uruchamia usuwania.

Parametry: ACADEMY_UPLOAD_RETENTION_HOURS=48 (minimum 48),
ACADEMY_REJECTED_RETENTION_DAYS=30 (minimum 30). Zbyt krótka lub błędna
konfiguracja kończy się błędem, a nie agresywnym domyślnym czyszczeniem.

Kandydaci: stare niedokończone rezerwacje, odrzucone materiały i gotowe pliki
bez żadnego odwołania w lekcjach. Gotowe pliki edycji mogą być czyszczone tylko
po odrzuceniu moderacji. Opublikowane i wycofane materiały edycji są zachowane,
podobnie jak wszystkie odwołania dowolnej historycznej wersji programu.

Worker obsługuje jeden plik na wywołanie. Proponowany scheduler: co 5 minut,
z istniejącym Bearer CRON_SECRET, bez sekretu w URL. Na produkcji najpierw
potwierdzić wynik report oraz politykę; nie wywoływać trybu wykonania w ramach
samego testu dostępności. Każde wywołanie rejestruje heartbeat.

Claim blokuje późniejszą finalizację i wykorzystanie pliku. Lease trwa 15 minut;
maksymalnie 5 prób, potem administrator może ponowić w panelu integracji.
Usuwanie dotyczy wyłącznie serwerowo zarezerwowanej ścieżki w academy-materials.
Sukces Storage jest potwierdzany brakiem rekordu storage.objects w ACK.
Dopiero ACK ustawia purged_at i uwalnia quota. Tombstone oraz audyt pozostają.
Powtórzenie lub stary token nie uwalnia limitu ponownie.

Nie obejmuje to usuwania opublikowanych nagrań po 12 miesiącach ani polityki
archiwizacji certyfikatów/Q&A. Te rekordy pozostają zachowane do osobnej,
zatwierdzonej polityki. Raport i brak aktywnego schedulera nie dowodzą, że
faktyczne usuwanie zostało uruchomione.

Weryfikacja: test SQL sprawdza odmowy ról, lease, opóźnione finalizacje,
brak ACK przed usunięciem, historyczne referencje, retry i faktyczną możliwość
rezerwacji po wyczerpaniu 10 GB. Test jednostkowy sprawdza report bez mutacji,
złą politykę, scope bucket/path, błąd Storage i brak potwierdzenia ACK.
Rzeczywisty Storage oraz hosted PostgreSQL pozostają osobnymi bramkami.
