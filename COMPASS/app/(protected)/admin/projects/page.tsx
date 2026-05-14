import { Suspense } from 'react'
import { ProjectsListClient } from "@/components/admin/ProjectsListClient"

export default function AdminProjectsPage() {
    return (
        <Suspense fallback={<div className="text-center py-12 text-white">Ładowanie...</div>}>
            <ProjectsListClient isAdmin={true} />
        </Suspense>
    )
}
