// Phase 17 — Polityka monitoringu czasu pracy (KP art. 22³ §2, RODO).
// Wersja MVP. Treść zostanie potwierdzona przez prawnika przed produkcyjnym
// uruchomieniem feature'u (zob. plan implementacji, "Otwarte action items").

export const metadata = {
    title: 'Polityka monitoringu czasu pracy | COMPASS',
}

export default function WorkMonitoringPolicyPage() {
    return (
        <main className="max-w-3xl mx-auto px-6 py-12 prose prose-invert">
            <h1>Polityka monitoringu czasu pracy</h1>
            <p className="text-sm text-muted-foreground">
                Wersja: <strong>v3-2026-05-10</strong> · Obowiązuje pracowników z rolą{' '}
                <code>internal</code> oraz <code>admin</code>. Wersja v2 dodała wykrywanie
                aktywnych calli (R7), wersja v3 dodaje opcjonalny AI Timeline tracking trasy
                (R12) — obie wymagają ponownej akceptacji zgody.
            </p>

            <h2>1. Cel monitoringu</h2>
            <p>
                Funkcja Smart Work Clock w COMPASS służy wyłącznie do ewidencji czasu pracy zgodnie
                z art. 94⁴ Kodeksu Pracy. Pomiar opiera się na świadomej zgodzie pracownika
                udzielonej przed pierwszym uruchomieniem zegara (art. 22³ §2 KP).
            </p>

            <h2>2. Zakres zbieranych danych</h2>
            <ul>
                <li>Czas rozpoczęcia i zakończenia każdej sesji pracy.</li>
                <li>
                    Sygnał aktywności (true/false) co 30 sekund w czasie aktywnej sesji — generowany
                    na podstawie zdarzeń klawiatury, myszy i dotyku <strong>w obrębie przeglądarki</strong>.
                </li>
                <li>Etykieta urządzenia (np. &bdquo;Chrome on macOS&rdquo;).</li>
                <li>Strefa czasowa klienta (np. &bdquo;Europe/Warsaw&rdquo;).</li>
                <li>Lokalizacja pracy: <em>onsite</em> lub <em>remote</em> (z profilu pracownika).</li>
                <li>
                    Adres IP i identyfikator User-Agent <strong>tylko w momencie udzielania
                    zgody</strong> (audit trail RODO art. 7 ust. 1).
                </li>
            </ul>

            <h2>3. Czego NIE zbieramy</h2>
            <ul>
                <li>
                    <strong>Treści</strong> — żadnych tekstów, plików, e-maili, komunikatorów ani
                    zawartości stron internetowych.
                </li>
                <li>
                    <strong>Zrzutów ekranu</strong> ani nagrań video/audio z urządzenia.
                </li>
                <li>
                    <strong>Lokalizacji geograficznej</strong> (GPS/IP poza initial consent capture).
                </li>
                <li>
                    <strong>Aktywności poza przeglądarką</strong> — praca w aplikacjach natywnych
                    (Excel, IDE, etc.) nie jest mierzona.
                </li>
            </ul>

            <h2>4. Logika idle detection</h2>
            <p>
                Po 20 minutach bez zdarzeń aktywności w przeglądarce, czas przerwy nie jest
                zaliczany do godzin pracy. Po 50 minutach pojawia się ostrzeżenie
                <em>&bdquo;Czy wciąż pracujesz?&rdquo;</em> — możesz kliknąć aby kontynuować.
                Po 60 minutach sustained idle sesja jest automatycznie zamykana, a pracownik
                otrzymuje powiadomienie e-mail. Po powrocie do pracy zobaczysz dialog z 4 opcjami:
                kontynuować, odrzucić, dodać manualnie lub odrzucić i rozpocząć nową sesję.
            </p>

            <h2>4a. Pauza (Twoja kontrola nad pomiarem)</h2>
            <p>
                W każdej chwili możesz kliknąć przycisk <strong>&bdquo;Pauza&rdquo;</strong> i
                wybrać 30, 60 lub 120 minut. W tym czasie zegar nie liczy aktywności — idealne
                na wizytę u lekarza, prywatną rozmowę, lunch poza biurkiem. Po upływie czasu
                pauza automatycznie się kończy. Każda pauza jest zapisywana w historii sesji
                (dla audytu KP art. 94⁴), ale czas pauzy NIE jest zaliczany do godzin pracy.
            </p>

            <h2>4b. Aktywność dzienna (tylko dla Ciebie)</h2>
            <p>
                W sekcji &bdquo;Strefa wewnętrzna → Zegar&rdquo; widzisz wykres swojej aktywności
                w 10-minutowych slotach (procent czasu z aktywnością klawiatury/myszy).
                <strong> Ten wykres jest tylko dla Ciebie — administrator nie widzi tych danych.</strong>
                {' '}Admin widzi wyłącznie sumę godzin w timesheet.
            </p>

            <h2>5. Retencja danych</h2>
            <ul>
                <li>
                    <strong>Sesje pracy:</strong> 5 lat (KP art. 94⁴ pkt 9a).
                </li>
                <li>
                    <strong>Heartbeats (audit trail):</strong> 90 dni od zakończenia sesji.
                </li>
                <li>
                    <strong>Audyt zmian:</strong> 5 lat zgodnie z polityką COMPASS.
                </li>
            </ul>

            <h2>6. Prawa pracownika</h2>
            <ul>
                <li>
                    <strong>Cofnięcie zgody:</strong> w każdej chwili w ustawieniach. Cofnięcie nie
                    wpływa na legalność wcześniejszych pomiarów. Zegar przestaje działać natychmiast.
                </li>
                <li>
                    <strong>Wgląd:</strong> pracownik widzi wszystkie swoje sesje w sekcji &bdquo;Strefa
                    wewnętrzna → Zegar&rdquo;.
                </li>
                <li>
                    <strong>Korekta:</strong> jeżeli pomiar nie odpowiada rzeczywistości, pracownik
                    może wpisać do timesheetu manualne godziny — różnica zostanie oflagowana do
                    decyzji administratora.
                </li>
                <li>
                    <strong>Sprzeciw RODO:</strong> art. 21 RODO — kontakt: artur@dynaminds.pl.
                </li>
            </ul>

            <h2>7. Bezpieczeństwo</h2>
            <p>
                Dane przechowywane są w bazie Supabase (region EU, Frankfurt). Dostęp ograniczony
                Row-Level Security: pracownik widzi wyłącznie własne sesje, administrator widzi
                wszystkie. Eksport danych zaszyfrowany TLS 1.2+.
            </p>

            <h2>8. Kontakt</h2>
            <p>
                W sprawach RODO i monitoringu czasu pracy: <a href="mailto:artur@dynaminds.pl">artur@dynaminds.pl</a>
            </p>
        </main>
    )
}
