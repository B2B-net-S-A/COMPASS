import { Card, CardContent } from "@/components/ui/card"
import { Users } from "lucide-react"

export default function AdminConsultantsPage() {
    return (
        <div className="space-y-6 p-6 md:p-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Konsultanci (CSM Hub)</h1>
                <p className="text-muted-foreground mt-1">Centrum sukcesu konsultanta — monitoruj rozwój i zadowolenie.</p>
            </div>
            <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                    <Users className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold">Moduł w przygotowaniu</h3>
                    <p className="text-sm text-muted-foreground mt-2 max-w-md">
                        CSM Hub z pełnym monitoringiem rozwoju konsultantów będzie dostępny w kolejnej wersji.
                    </p>
                </CardContent>
            </Card>
        </div>
    )
}
