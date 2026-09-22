# Pomocniczy odczyt istniejących ról Graph

Workflow `.github/workflows/academy-graph-readiness.yml` sprawdza cztery wskazane role Graph: trzy minimalne uprawnienia adaptera Academy oraz szersze uprawnienie odczytu i zapisu spotkań. Nie zmienia istniejącego raportu Coolify, nie otwiera procesu nadawania zgód i nie wykonuje operacji na skrzynkach ani spotkaniach. Uruchamia się na zaufanym hosted runnerze dla wskazanej gałęzi źródłowego repozytorium; lokalne uruchomienie lub PR z forka nie otrzyma dostępu przez helper.

1. Istniejący token wdrożeniowy Coolify wykonuje jeden GET `/applications/{uuid}/envs` do przypiętej domeny Compass. API dokumentuje `value` i `real_value`; wcześniejszy inventory wykazał skonfigurowane, nieredagowane wartości runtime trzech zmiennych Azure. Helper odrzuca maskowanie, nierozwiązane odwołania, duplikaty, konfigurację preview i brak `is_runtime: true`.
2. Tylko `AZURE_TENANT_ID`, `AZURE_CLIENT_ID` i `AZURE_CLIENT_SECRET` są używane dalej, w pamięci tego samego procesu. Nie trafiają do pliku, argumentów powłoki, `$GITHUB_ENV`, outputów ani artefaktu. Tenant i client muszą być UUID.
3. Jeden POST do `https://login.microsoftonline.com/{tenant-uuid}/oauth2/v2.0/token` z `client_credentials` i stałym `scope=https://graph.microsoft.com/.default` uzyskuje token dla już nadanych uprawnień. Przekierowania i retry są wyłączone. Odczyty odpowiedzi mają limit czasu i rozmiaru.
4. Jeśli odpowiedź zawiera czytelny JWT, diagnostyka sprawdza w pamięci `aud`, `iss`, `exp`, spójność tenant/client i brak delegated `scp`, a następnie zwraca wyłącznie poniższe klucze. Całe claims, token, identyfikatory, wartości konfiguracji i błędy dostawcy nigdy nie są wypisywane.

```json
{
  "Calendars.ReadWrite": null,
  "OnlineMeetings.Read.All": null,
  "OnlineMeetings.ReadWrite.All": null,
  "OnlineMeetingArtifact.Read.All": null
}
```

`true` oznacza obecność konkretnej roli w sprawdzonej odpowiedzi wystawcy, `false` jej brak, a `null` brak możliwości ustalenia wyniku. `null` obejmuje także brak credentials, odmowę API, token opaque lub zaszyfrowany, wygasły token i niezgodność claims. Zielony workflow nie zamienia `null` w potwierdzenie gotowości.

Wynik jest dosłowną obecnością grantów: `OnlineMeetings.Read.All: false` razem z `OnlineMeetings.ReadWrite.All: true` oznacza szerszy grant dopuszczany przez [Microsoft dla odczytu onlineMeeting](https://learn.microsoft.com/en-us/graph/api/onlinemeeting-get?view=graph-rest-1.0). Helper nie zamienia wtedy minimalnego grantu na `true` i nie wnioskuje o uprawnieniu `OnlineMeetingArtifact.Read.All`. [Historyczny run 35729914405](https://github.com/B2B-net-S-A/COMPASS/actions/runs/35729914405) pokazywał tylko trzy role; nie pozwala ustalić, czy szerszy grant był obecny.

To pomocnicza diagnostyka oparta na odpowiedzi bezpośredniego połączenia HTTPS z wystawcą. Nie jest kryptograficznym weryfikatorem JWT. Microsoft zastrzega, że format tokenów obcych API może się zmienić; aplikacja, jej autoryzacja i uruchomienie Academy nie zależą od możliwości ich odczytania. Ścieżka alternatywna `servicePrincipal/appRoleAssignments` wymaga uprawnień odczytu katalogu i celowo nie jest uruchamiana ani dodawana dla tej diagnostyki.

Nawet obecność wszystkich wymaganych ról nie potwierdza dostępu do konkretnej skrzynki, Exchange application scope, Teams application access policy, licencji, konfiguracji organizatora, prezentera zewnętrznego ani skutecznego pobrania obecności. Te dowody pozostają osobnymi warunkami z [runbooka Teams](teams-operations.md). Pobranie tokena może pozostawić zwykły ślad uwierzytelnienia aplikacji w Entra, ale nie nadaje zgód i nie wysyła zaproszeń.

Testy bez sieci: `node --test ops/academy/graph-grants-readonly.test.mjs`. Pokrywają ograniczenie wykonania do CI, adresy docelowe, kodowanie secretu, odrzucanie niejednoznacznej konfiguracji, granice claims, tokeny opaque i brak wycieku odpowiedzi błędów. Faktyczny wynik ról należy odczytać z konkretnego hosted run; testy syntetyczne go nie zastępują.

Źródła: [Coolify List Envs](https://coolify.io/docs/api/endpoints/applications/list-envs-by-application-uuid), [Microsoft client credentials i ograniczenia formatu tokenów](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-client-creds-grant-flow), [Microsoft list appRoleAssignments](https://learn.microsoft.com/en-us/graph/api/serviceprincipal-list-approleassignments?view=graph-rest-1.0).
