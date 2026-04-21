import { KnowledgeBaseAdmin } from "@/components/admin/KnowledgeBaseAdmin"

export default function KnowledgeBasePage() {
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-white mb-8">Baza Wiedzy Compass Assist</h1>
            <KnowledgeBaseAdmin />
        </div>
    )
}
