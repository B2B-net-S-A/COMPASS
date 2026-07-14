export default function ConsultantSuccessLoading() {
    return (
        <div className="space-y-6" aria-label="Ładowanie Consultant Success">
            <div className="h-24 animate-pulse rounded-xl bg-muted" />
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-xl bg-muted" />)}
            </div>
            <div className="grid gap-6 lg:grid-cols-2"><div className="h-96 animate-pulse rounded-xl bg-muted" /><div className="h-96 animate-pulse rounded-xl bg-muted" /></div>
        </div>
    )
}
