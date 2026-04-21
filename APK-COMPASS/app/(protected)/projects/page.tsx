import { ProjectsListClient } from "@/components/admin/ProjectsListClient"

export default function ProjectsPage() {
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-white">Marketplace Projektów</h1>
            <p className="text-muted-foreground">Widok Konsultanta</p>
            <ProjectsListClient isAdmin={false} />
        </div>
    )
}
