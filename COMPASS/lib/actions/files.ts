'use server'

import { logCompat } from '@/lib/logger'

import { createClient } from '@/lib/supabase/server'
import { generateEmbedding } from '@/lib/ai/embeddings'
import { revalidatePath } from 'next/cache'
import { chatJSON } from '@/lib/ai/llm'

const MAX_AVATAR_SIZE = 5 * 1024 * 1024
const MAX_CV_SIZE = 20 * 1024 * 1024
const MAX_DOCUMENT_SIZE = 20 * 1024 * 1024

function assertFileSize(file: File, maxBytes: number, label: string) {
    if (file.size > maxBytes) {
        throw new Error(`${label}: plik jest za duży (max ${Math.round(maxBytes / 1024 / 1024)} MB)`)
    }
}

export async function uploadAvatar(formData: FormData) {
    const file = formData.get('file') as File
    if (!file) throw new Error('No file')
    assertFileSize(file, MAX_AVATAR_SIZE, 'Awatar')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Nie jesteś zalogowany')

    const fileExt = file.name.split('.').pop()
    const filePath = `profiles/${user.id}-${Date.now()}.${fileExt}`

    const { error } = await supabase.storage
        .from('avatars')
        .upload(filePath, file)

    if (error) {
        logCompat.error('Avatar upload error:', error)
        throw new Error('Upload failed')
    }

    const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

    await supabase
        .from('profiles')
        // Mark source as manual so m365 photo sync (lib/m365/people-sync.ts)
        // doesn't clobber this on next SSO login / weekly cron.
        .update({ avatar_url: publicUrl, avatar_source: 'manual' })
        .eq('id', user.id)

    revalidatePath('/profile')
    return { success: true, url: publicUrl }
}

export async function uploadCV(formData: FormData) {
    const file = formData.get('file') as File
    if (!file) throw new Error('Nie wybrano pliku')
    assertFileSize(file, MAX_CV_SIZE, 'CV')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Nie jesteś zalogowany')

    try {
        // 1. Upload file
        const fileExt = file.name.split('.').pop()
        const filePath = `cvs/${user.id}/${Date.now()}.${fileExt}`

        const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(filePath, file)

        if (uploadError) throw new Error('Nie udało się przesłać pliku')

        // 2. Prepare Buffer for Image Extraction
        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        // Image Extraction (DOCX and PDF)
        let extractedAvatarUrl = null
        try {
            const { extractImagesFromDocx, extractImagesFromPdf } = await import('@/lib/files/image-parser')
            let imageBuffer: Buffer | null = null

            if (file.name.endsWith('.docx')) {
                imageBuffer = await extractImagesFromDocx(buffer)
            } else if (file.name.endsWith('.pdf')) {
                imageBuffer = await extractImagesFromPdf(buffer)
            }

            if (imageBuffer) {
                const avatarPath = `profiles/${user.id}-extracted-${Date.now()}.png`
                const { error: avatarUploadError } = await supabase.storage
                    .from('avatars')
                    .upload(avatarPath, imageBuffer, { contentType: 'image/png' })

                if (!avatarUploadError) {
                    const { data: { publicUrl } } = supabase.storage
                        .from('avatars')
                        .getPublicUrl(avatarPath)
                    extractedAvatarUrl = publicUrl
                }
            }
        } catch (imgErr) {
            logCompat.error('Image extraction failed:', imgErr)
        }

        // 3. Update Profile with File Path
        const updateData: { cv_url: string; avatar_url?: string; avatar_source?: 'manual'; } = {
            cv_url: filePath,
        }

        if (extractedAvatarUrl) {
            updateData.avatar_url = extractedAvatarUrl
            // CV-extracted avatar is user-initiated → protect from m365 sync.
            updateData.avatar_source = 'manual'
        }

        const { error: updateError } = await supabase
            .from('profiles')
            .update(updateData)
            .eq('id', user.id)

        if (updateError) throw new Error('Failed to update profile: ' + updateError.message)

        // Phase 1.0 (2026-05-04): candidate-table sync removed (legacy ATS).
        revalidatePath('/profile')
        return { success: true }

    } catch (error: any) {
        logCompat.error('CV Upload Error:', error)
        return { success: false, error: error.message || 'Nie udało się przetworzyć CV' }
    }
}

export async function generateProfileFromCV(manualData?: any) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Nie jesteś zalogowany')

    try {
        // 1. Get current CV path from profile
        const { data: profile } = await supabase
            .from('profiles')
            .select('cv_url')
            .eq('id', user.id)
            .single()

        if (!profile?.cv_url) throw new Error('No CV uploaded')

        // 2. Download file
        const { data: fileBlob, error: downloadError } = await supabase.storage
            .from('documents')
            .download(profile.cv_url)

        if (downloadError || !fileBlob) throw new Error('Failed to download CV')

        // 3. Parse Text
        const buffer = Buffer.from(await fileBlob.arrayBuffer())
        const { parseBuffer } = await import('@/lib/files/parsers')

        const fileExt = profile.cv_url.split('.').pop()?.toLowerCase()
        let mimeType = fileBlob.type

        if (!mimeType || mimeType === 'application/octet-stream') {
            if (fileExt === 'pdf') mimeType = 'application/pdf'
            else if (fileExt === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }

        const text = await parseBuffer(buffer, mimeType, profile.cv_url)
        const sanitizedText = text.slice(0, 15000)

        // 4. AI Extraction
        const contextPrompt = manualData ? `
USER MANUAL INPUTS (Must be incorporated):
- Experience Level: ${manualData.experience} years
- Current Status: ${manualData.status}
- Capacity: ${manualData.capacity}%
- Project Sentiments: ${manualData.sentiments?.join(', ')}
- Additional Work Roles:
    - Verifier: ${manualData.verifier}
    - Ambassador: ${manualData.ambassador}
    - Sales Support: ${manualData.sales}
- Cover Letter / Additional Info: "${manualData.coverLetter || 'None'}"
` : ''

        const aiData = await chatJSON<Record<string, any>>({
            model: 'gpt-4o-mini',
            system: 'You are an HR expert. You must output a JSON object.',
            messages: [{
                role: 'user',
                content: `Analyze the CV text and the user's manual inputs to create a comprehensive profile.

${contextPrompt}

Extract the following fields in json format:
- full_name (string): The candidate's full name from CV.
- skills (array of strings): Technical skills, soft skills, tools.
- previous_clients (array of strings): Extract names of companies, clients, or projects the candidate worked for. Look for capitalized names associated with "Client", "Project for", "Worked at", etc.
- experience_years (number): Total years of professional experience in the IT industry. Output only the number. If not found, use ${manualData?.experience || 0}.
- bio (string): Write a professional summary (1st person view, e.g. "Jestem..."). Highlight key skills, experience, and roles.
  CRITICAL: You MUST explicitly mention their availability status ("${manualData?.status || ''}") and any additional roles they are interested in (Verifier, Ambassador, etc.) if specified in the manual inputs.
  Keep it under 1000 characters.

CV Text to analyze:
${sanitizedText.slice(0, 10000)}`,
            }],
        })
        const summary = aiData.bio || sanitizedText.slice(0, 500)
        const embedding = await generateEmbedding(summary)

        // 5. Update Auth Metadata (Name)
        if (aiData.full_name) {
            await supabase.auth.updateUser({
                data: { full_name: aiData.full_name }
            })
        }

        // 6. Update Profile
        const updateData: any = {
            bio: summary,
            embedding,
            skills: aiData.skills || [],
            previous_clients: aiData.previous_clients || [],
            experience_years: typeof aiData.experience_years === 'number' ? aiData.experience_years : (manualData?.experience || 0)
        }

        const { error: updateError } = await supabase
            .from('profiles')
            .update(updateData)
            .eq('id', user.id)

        if (updateError) throw new Error('Failed to update profile: ' + updateError.message)

        // Phase 1.0 (2026-05-04): candidate-table sync removed (legacy ATS).

        revalidatePath('/profile')
        return {
            success: true,
            data: {
                bio: summary,
                full_name: aiData.full_name,
                skills: aiData.skills,
                previous_clients: aiData.previous_clients
            }
        }

    } catch (error: any) {
        logCompat.error('AI Generation Error:', error)
        return { success: false, error: error.message || 'Nie udało się wygenerować profilu' }
    }
}

// --- Referral CV Upload ---

export async function uploadReferralCV(formData: FormData) {
    const file = formData.get('file') as File
    if (!file) return { success: false, error: 'Nie wybrano pliku' }
    if (file.size > MAX_CV_SIZE) {
        return { success: false, error: `Plik jest za duży (max ${Math.round(MAX_CV_SIZE / 1024 / 1024)} MB)` }
    }

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Nie jesteś zalogowany' }

    try {
        const fileExt = file.name.split('.').pop()
        const filePath = `referrals/${user.id}/${Date.now()}.${fileExt}`

        const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(filePath, file)

        if (uploadError) {
            logCompat.error('Referral CV upload error:', uploadError)
            return { success: false, error: 'Nie udało się przesłać pliku' }
        }

        return { success: true, path: filePath }
    } catch (error: any) {
        logCompat.error('Referral CV Upload Error:', error)
        return { success: false, error: error.message || 'Nie udało się przesłać CV' }
    }
}

// --- Admin Actions ---

export async function adminUploadCV(formData: FormData, candidateId: string) {
    const file = formData.get('file') as File
    if (!file) throw new Error('Nie wybrano pliku')
    assertFileSize(file, MAX_CV_SIZE, 'CV')

    const supabase = createClient()
    // Verify admin access here if roles are implemented
    // For now, assuming if they can call this, they are authorized or middleware handles it

    try {
        // 1. Upload file to candidate's folder
        const fileExt = file.name.split('.').pop()
        const filePath = `cvs/${candidateId}/${Date.now()}.${fileExt}`

        const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(filePath, file)

        if (uploadError) throw new Error('Nie udało się przesłać pliku')

        // 2. Prepare Buffer for Image Extraction (Optional but good to have)
        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        let extractedAvatarUrl = null

        try {
            const { extractImagesFromDocx, extractImagesFromPdf } = await import('@/lib/files/image-parser')
            let imageBuffer: Buffer | null = null

            if (file.name.endsWith('.docx')) {
                imageBuffer = await extractImagesFromDocx(buffer)
            } else if (file.name.endsWith('.pdf')) {
                imageBuffer = await extractImagesFromPdf(buffer)
            }

            if (imageBuffer) {
                const avatarPath = `profiles/${candidateId}-extracted-${Date.now()}.png`
                const { error: avatarUploadError } = await supabase.storage
                    .from('avatars')
                    .upload(avatarPath, imageBuffer, { contentType: 'image/png' })

                if (!avatarUploadError) {
                    const { data: { publicUrl } } = supabase.storage
                        .from('avatars')
                        .getPublicUrl(avatarPath)
                    extractedAvatarUrl = publicUrl
                }
            }
        } catch (imgErr) {
            logCompat.error('Image extraction failed:', imgErr)
        }

        // 3. Update Candidate Record
        const candidateUpdate: { cv_url: string; avatar_url?: string; } = {
            cv_url: filePath,
        }
        // profiles has the avatar_source column, candidates doesn't —
        // keep payloads separate to avoid PostgREST schema errors.
        const profileUpdate: { cv_url: string; avatar_url?: string; avatar_source?: 'manual'; } = {
            cv_url: filePath,
        }
        if (extractedAvatarUrl) {
            candidateUpdate.avatar_url = extractedAvatarUrl
            profileUpdate.avatar_url = extractedAvatarUrl
            // Admin-uploaded CV avatar → protect from m365 sync overwrite.
            profileUpdate.avatar_source = 'manual'
        }

        // Update candidates table directly since profiles table might be synonymous or synced
        // In the current architecture, 'profiles' is likely linked to auth.users, while 'candidates' is the admin view.
        // We should update both if possible, but 'candidates' is the primary view for admins.
        // Let's check if there is a profile for this candidateId (userId).

        // If candidateId is a UUID from auth, we update profile AND candidate.
        // If it's just a candidate record (unlinked), we just update candidate.
        // Assuming candidateId IS the profile/user ID based on previous context.

        // Update 'candidates' table — legacy ATS table absent from the regenerated types; cast preserves behavior.
        const { error: candidateError } = await (supabase as any)
            .from('candidates')
            .update(candidateUpdate)
            .eq('id', candidateId)

        if (candidateError) throw new Error('Failed to update candidate record: ' + candidateError.message)

        // Try to update 'profiles' table too, just in case they are linked
        await supabase.from('profiles').update(profileUpdate).eq('id', candidateId)


        // 4. Trigger AI Analysis automatically
        // We need to call a function that extracts text and updates the candidate.
        // We can reuse logic from generateProfileFromCV but adapted for admin/candidateId.

        await adminGenerateProfileFromCV(candidateId, filePath)

        revalidatePath(`/admin/candidates/${candidateId}`)
        return { success: true }

    } catch (error: any) {
        logCompat.error('Admin CV Upload Error:', error)
        return { success: false, error: error.message || 'Nie udało się przetworzyć CV' }
    }
}

export async function adminGenerateProfileFromCV(candidateId: string, cvUrl: string) {
    const supabase = createClient()

    try {
        // 1. Download file
        const { data: fileBlob, error: downloadError } = await supabase.storage
            .from('documents')
            .download(cvUrl)

        if (downloadError || !fileBlob) throw new Error('Failed to download CV')

        // 2. Parse Text
        const buffer = Buffer.from(await fileBlob.arrayBuffer())
        const { parseBuffer } = await import('@/lib/files/parsers')

        const fileExt = cvUrl.split('.').pop()?.toLowerCase()
        let mimeType = fileBlob.type

        if (!mimeType || mimeType === 'application/octet-stream') {
            if (fileExt === 'pdf') mimeType = 'application/pdf'
            else if (fileExt === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }

        const text = await parseBuffer(buffer, mimeType, cvUrl)
        const sanitizedText = text.slice(0, 15000)

        // 3. AI Extraction
        const aiData = await chatJSON<Record<string, any>>({
            model: 'gpt-4o-mini',
            system: 'You are an HR expert. You must output a JSON object.',
            messages: [{
                role: 'user',
                content: `Analyze the CV text and extract the following in json format:
- full_name (string): The candidate's full name.
- skills (array of strings): Technical skills, soft skills, tools.
- previous_clients (array of strings): Extract names of companies, clients, or projects.
- experience_years (number): Total years of professional experience in the IT industry. Output only the number.
- bio (string): Write a professional summary. 1st person view. Keep it under 1000 characters.

Text to analyze:
${sanitizedText.slice(0, 10000)}`,
            }],
        })
        const summary = aiData.bio || sanitizedText.slice(0, 500)
        const embedding = await generateEmbedding(summary)

        // 4. Update Candidate Record
        const updateData = {
            skills: aiData.skills,
            bio: summary,
            previous_clients: aiData.previous_clients || [],
            experience_years: typeof aiData.experience_years === 'number' ? aiData.experience_years : null,
            // embedding: embedding // access to embedding vector might be restricted or handle differently
        }

        // We probably also want to update the 'profiles' table if it exists
        await supabase.from('profiles').update({
            bio: summary,
            embedding: embedding as unknown as string,
            skills: aiData.skills || [],
            previous_clients: aiData.previous_clients || [],
            experience_years: typeof aiData.experience_years === 'number' ? aiData.experience_years : null
        }).eq('id', candidateId)

        const { error: updateError } = await (supabase as any)
            .from('candidates')
            .update(updateData)
            .eq('id', candidateId)

        if (updateError) throw new Error('Failed to update candidate: ' + updateError.message)

        return { success: true }

    } catch (error: any) {
        logCompat.error('Admin AI Generation Error:', error)
        throw error
    }
}
