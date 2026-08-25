// Polityka haseł — jedno miejsce, w którym zapisana jest reguła pokazywana
// użytkownikowi („min. 10 znaków, 1 wielka litera, 1 cyfra").
//
// Audyt 2026-08: reguła żyła wyłącznie w rejestracji (app/login/actions.ts).
// Samoobsługowa zmiana hasła (app/auth/update-password) miała `minLength={6}`
// i nic poza tym — czyli ścieżka resetu wpuszczała hasła SŁABSZE niż te, których
// wymagamy przy zakładaniu konta, a użytkownik dowiadywał się o polityce tylko
// z placeholdera mówiącego „Min. 6 znaków". Ten moduł jest czysty (bez importów
// serwerowych), więc wchodzi i do komponentu klienckiego, i do akcji serwerowej.

export const PASSWORD_MIN_LENGTH = 10

/** Min. 10 znaków, przynajmniej jedna wielka litera i jedna cyfra. */
export const PASSWORD_POLICY_REGEX = /^(?=.*[A-Z])(?=.*\d).{10,}$/

export const PASSWORD_POLICY_HINT_PL = 'Min. 10 znaków, 1 duża litera, 1 cyfra.'

export const PASSWORD_POLICY_ERROR_PL =
    'Hasło musi mieć min. 10 znaków, zawierać wielką literę i cyfrę.'

export function isPasswordStrongEnough(password: string): boolean {
    return PASSWORD_POLICY_REGEX.test(password)
}
