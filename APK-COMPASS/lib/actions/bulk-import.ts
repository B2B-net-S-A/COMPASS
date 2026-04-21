'use server'

import { createClient } from '@/lib/supabase/server'
import { parseFile } from '@/lib/files/parsers'
import { generateEmbedding } from '@/lib/ai/embeddings'
import { revalidatePath } from 'next/cache'
import { processDataWithAI } from '@/lib/ai/processor'

// --- Bulk Candidate Import (File) ---

export async function importCandidate(formData: FormData, batchId?: string) {
    const file = formData.get('file') as File
    if (!file) throw new Error('No file')

    const validationError = validateFile(file)
    if (validationError) {
        return { success: false, name: file.name, message: validationError }
    }

    const supabase = createClient()

    const fileExt = file.name.split('.').pop()
    const filePath = `candidates/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

    const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file)

    if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`)
    }

    const text = await parseFile(file)
    const data = await processDataWithAI(text, 'candidate')

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    let avatarUrl = null
    try {
        const { extractImagesFromDocx, extractImagesFromPdf } = await import('@/lib/files/image-parser')
        let imageBuffer: Buffer | null = null
        if (file.name.endsWith('.docx')) imageBuffer = await extractImagesFromDocx(buffer)
        else if (file.name.endsWith('.pdf')) imageBuffer = await extractImagesFromPdf(buffer)

        if (imageBuffer) {
            const avatarPath = `profiles/extracted-${Date.now()}.png`
            const { error: avatarUploadError } = await supabase.storage
                .from('avatars')
                .upload(avatarPath, imageBuffer, { contentType: 'image/png' })

            if (!avatarUploadError) {
                const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(avatarPath)
                avatarUrl = publicUrl
            }
        }
    } catch { /* image extraction optional */ }

    return saveCandidate(data, text, filePath, avatarUrl, file.name, batchId)
}

// --- Import from Text ---
export async function importFromText(text: string, type: 'candidate' | 'project') {
    const data = await processDataWithAI(text, type)
    if (type === 'candidate') {
        return saveCandidate(data, text)
    } else {
        return saveProject(data, text)
    }
}

// --- Import from Link ---
export async function importFromLink(url: string, type: 'candidate' | 'project') {
    // In a real scenario, we would use a scraper tool or fetch the page content
    // For now, we simulate by fetching and taking a portion of the text or suggesting the user paste it
    try {
        const response = await fetch(url)
        const html = await response.text()
        const text = html.replace(/<[^>]*>?/gm, ' ').slice(0, 10000) // Simple tag removal

        const data = await processDataWithAI(text, type)
        if (type === 'candidate') return saveCandidate(data, text)
        return saveProject(data, text)
    } catch (error) {
        console.error('Link import error:', error)
        throw new Error('Could not fetch link content. Try Copy-Paste mode.')
    }
}

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

function validateFile(file: File): string | null {
    if (file.size > MAX_FILE_SIZE) return `Plik za duzy (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!ext || !['pdf', 'docx'].includes(ext)) return 'Dozwolone formaty: PDF, DOCX'
    return null
}

async function saveCandidate(
    data: any,
    rawText: string,
    cvUrl?: string,
    avatarUrl?: string | null,
    originalFilename?: string,
    batchId?: string
) {
    const supabase = createClient()

    if (data.email) {
        const { data: existing } = await supabase
            .from('candidates')
            .select('id, full_name, candidate_status')
            .eq('email', data.email)
            .single()

        if (existing) {
            if (existing.candidate_status === 'kandydat' && cvUrl) {
                const { data: current } = await supabase
                    .from('candidates')
                    .select('cv_versions')
                    .eq('id', existing.id)
                    .single()

                const versions = current?.cv_versions || []
                versions.push({
                    url: cvUrl,
                    filename: originalFilename,
                    uploaded_at: new Date().toISOString(),
                })

                await supabase.from('candidates').update({ cv_versions: versions }).eq('id', existing.id)
            }
            return { success: false, name: data.full_name, message: 'Duplikat (Email) -- wersja CV dodana' }
        }
    }

    if (data.full_name) {
        const { data: nameMatches } = await supabase
            .from('candidates')
            .select('id')
            .ilike('full_name', data.full_name.trim())
            .eq('candidate_status', 'kandydat')

        if (nameMatches && nameMatches.length > 0 && !data.email) {
            const embedding = await generateEmbedding(rawText)
            const { error } = await supabase.from('candidates').insert({
                full_name: data.full_name || 'Unknown Candidate',
                email: data.email,
                phone: data.phone,
                skills: data.skills || [],
                bio: data.bio_summary,
                experience_years: data.experience_years,
                previous_clients: data.previous_clients || [],
                cv_url: cvUrl,
                avatar_url: avatarUrl,
                embedding,
                status: 'new',
                candidate_status: 'duplicate',
                source: 'import',
                import_batch_id: batchId,
                original_filename: originalFilename,
                raw_text: rawText?.substring(0, 50000),
                cv_parsed: true,
            })
            if (error) throw new Error(`DB Error: ${error.message}`)
            revalidatePath('/admin/candidates')
            return { success: true, name: data.full_name, message: 'Potencjalny duplikat nazwy -- do weryfikacji' }
        }
    }

    const embedding = await generateEmbedding(rawText)
    const { error } = await supabase.from('candidates').insert({
        full_name: data.full_name || 'Unknown Candidate',
        email: data.email,
        phone: data.phone,
        skills: data.skills || [],
        bio: data.bio_summary,
        experience_years: data.experience_years,
        previous_clients: data.previous_clients || [],
        cv_url: cvUrl,
        avatar_url: avatarUrl,
        embedding,
        status: 'new',
        candidate_status: 'kandydat',
        source: 'import',
        import_batch_id: batchId,
        original_filename: originalFilename,
        raw_text: rawText?.substring(0, 50000),
        cv_parsed: true,
    })

    if (error) throw new Error(`DB Error: ${error.message}`)
    revalidatePath('/admin/candidates')
    return { success: true, name: data.full_name, message: 'Sukces' }
}

// --- Bulk Project Import (File) ---

export async function importProject(formData: FormData) {
    const file = formData.get('file') as File
    if (!file) throw new Error('No file')

    const supabase = createClient()
    const filePath = `projects/${Date.now()}-${file.name}`
    await supabase.storage.from('documents').upload(filePath, file)

    const text = await parseFile(file)
    const data = await processDataWithAI(text, 'project')

    return saveProject(data, text, filePath)
}

// --- Helper: Save Project ---
async function saveProject(data: any, rawText: string, fileUrl?: string) {
    const supabase = createClient()
    const embedding = await generateEmbedding(`${data.title} ${data.description}`)

    const { error } = await supabase.from('projects').insert({
        title: data.title || 'New Project',
        description: data.description,
        description_pl: data.description_pl,
        required_skills: data.required_skills || [],
        budget_range: data.budget_range || data.max_rate,
        position: data.position,
        max_rate: data.max_rate,
        location: data.location,
        work_type: data.work_type,
        required_languages: data.required_languages || [],
        start_date: data.start_date,
        recommendation_deadline: data.recommendation_deadline,
        manager_name: data.manager_name,
        file_url: fileUrl,
        embedding
    })

    if (error) throw new Error(`DB Error: ${error.message}`)
    revalidatePath('/admin/projects')
    return { success: true, title: data.title }
}
