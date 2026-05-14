
import { UnifiedDocumentManager } from '@/components/documents/UnifiedDocumentManager'

export default function DocumentsPage() {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-white">Dokumenty i Finanse</h1>
                    <p className="text-muted-foreground">Zarządzanie kontraktami, fakturami i historią zmian.</p>
                </div>
            </div>

            <UnifiedDocumentManager />
        </div>
    )
}
