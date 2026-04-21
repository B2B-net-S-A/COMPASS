import { Card, CardContent } from "@/components/ui/card"
import { BarChart3 } from "lucide-react"

export default function AdminReportsPage() {
    return (
        <div className="space-y-6 p-6 md:p-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Raporty i Analityka</h1>
                <p className="text-muted-foreground mt-1">Business Intelligence Dashboard.</p>
            </div>
            <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                    <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold">Moduł w przygotowaniu</h3>
                    <p className="text-sm text-muted-foreground mt-2 max-w-md">
                        Zaawansowana analityka i raporty będą dostępne w kolejnej wersji systemu.
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
