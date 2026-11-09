import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { materialRejectionMessage } from './material-errors'
import { MaterialRejected } from './material-validation'
import { Mp4StreamValidator } from './mp4-validation'

export const MAX_MP4_BYTES = 1024 ** 3

export type Mp4CheckResult = { ok: true; size: number } | { ok: false; code: string; message: string }

/**
 * Runs the same parser as the server-side scanner on a local file, so a recording
 * that would be rejected after a gigabyte upload is caught on the author's laptop.
 */
export async function checkMp4File(path: string): Promise<Mp4CheckResult> {
    const { size } = await stat(path)
    if (size <= 0) return { ok: false, code: 'incomplete_mp4', message: materialRejectionMessage('incomplete_mp4') }
    if (size > MAX_MP4_BYTES) return { ok: false, code: 'file_too_large', message: 'Plik przekracza 1 GiB. Podziel nagranie na części: uruchom normalizator z opcją --part-minutes 45.' }
    try {
        const parser = new Mp4StreamValidator(size)
        for await (const chunk of createReadStream(path, { highWaterMark: 1024 ** 2 })) parser.push(chunk as Buffer)
        parser.finish()
        return { ok: true, size }
    } catch (cause) {
        if (!(cause instanceof MaterialRejected)) throw cause
        return { ok: false, code: cause.code, message: materialRejectionMessage(cause.code) }
    }
}
