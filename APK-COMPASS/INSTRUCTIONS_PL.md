# 🛠️ Instrukcja Naprawy Bazy Danych

Twoja baza danych w Supabase ma braki w strukturze, przez co rejestracja użytkownika nie działa. Przygotowałem skrypt, który to naprawi automatycznie.

## Wykonaj te kroki

1. Otwórz **Terminal** w VS Code (naciśnij `Ctrl` + `~` lub wybierz z menu `Terminal` -> `New Terminal`).

2. Wpisz w terminalu poniższą komendę i naciśnij **Enter**:

    ```bash
    node scripts/fix_db_interactive.js
    ```

3. Skrypt zapyta Cię o **Hasło do Bazy Danych** (Database Password).
    * Jest to hasło, które ustawiłeś/aś podczas tworzenia projektu w Supabase.
    * *Uwaga:* Podczas wpisywania hasła nic się nie wyświetli na ekranie – to normalne zabezpieczenie. Po prostu wpisz hasło i naciśnij **Enter**.

4. Jeśli zobaczysz zielony komunikat `✅ Fix Applied Successfully!`, naprawa się udała.

## Co dalej?

1. Wróć do przeglądarki na stronę logowania.
2. Wybierz opcję **Zarejestruj się** (Register) – *nie logowanie, bo Twój użytkownik jeszcze nie istnieje!*.
3. Zarejestruj się ponownie, używając swojego adresu email: `zbigniew.twardowski@b2bnetwork.pl`.

Teraz wszystko powinno działać! 🚀
