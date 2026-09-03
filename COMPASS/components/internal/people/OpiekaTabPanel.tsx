import { listCareRoster, listTcmProfiles } from '@/lib/actions/contractors'
import { OpiekaPanel } from '@/components/internal/people/OpiekaPanel'

interface Props {
    currentUserId: string
}

// People Ops → Opieka: lista konsultantów pod opieką TCM + przypisanie opiekuna.
// Lista i słownik opiekunów są TREŚCIĄ ekranu — obie akcje rzucają przy awarii,
// więc błąd trafia do error boundary huba zamiast renderować pustą tabelę,
// która wyglądałaby jak „nikt tu nie pracuje".
export async function OpiekaTabPanel({ currentUserId }: Props) {
    const [roster, tcmOptions] = await Promise.all([
        listCareRoster(),
        listTcmProfiles(),
    ])

    return <OpiekaPanel roster={roster} tcmOptions={tcmOptions} currentUserId={currentUserId} />
}
