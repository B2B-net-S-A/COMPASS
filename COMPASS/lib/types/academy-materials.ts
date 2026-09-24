export interface AcademyRunMaterial {
    id: string
    filename: string
    storage_path: string
    mime_type: string
    size_bytes: number
    status: 'uploading' | 'quarantined' | 'scanning' | 'ready' | 'rejected'
    review_status: 'pending_review' | 'published' | 'rejected' | 'withdrawn'
    review_note: string | null
    uploaded_by: string | null
}
