import { checkMp4File } from '../lib/academy/mp4-local-check'

// Lokalny krok kontrolny: ten sam parser co skaner po uploadzie.
// Użycie: npx tsx scripts/academy-validate-mp4.ts <plik.mp4>
async function main() {
    const path = process.argv[2]
    if (!path) {
        process.stderr.write('Użycie: academy-validate-mp4 <plik.mp4>\n')
        process.exit(2)
    }
    const result = await checkMp4File(path)
    if (!result.ok) {
        process.stderr.write(`ODRZUCONY [${result.code}]: ${result.message}\n`)
        process.exit(1)
    }
    process.stdout.write(`OK: ${path} (${result.size} bajtów)\n`)
}

main().catch((cause: unknown) => {
    process.stderr.write(`Nie udało się sprawdzić pliku: ${cause instanceof Error ? cause.message : String(cause)}\n`)
    process.exit(2)
})
