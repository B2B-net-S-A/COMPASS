import { Flame } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface LearningStreakWidgetProps {
    current: number
    longest: number
    lastDate: string | null
}

/**
 * A1.4: Mały widget pokazujący current/longest streak nauki.
 * - Cold (0 dni): zachęta "Zacznij dzisiaj"
 * - Active (1+ dni): płomień + liczba + best
 * - Cold po przerwie (last_date < yesterday): "Twoja passa to było X dni — zacznij nową!"
 */
export function LearningStreakWidget({ current, longest, lastDate }: LearningStreakWidgetProps) {
    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const isActive = current > 0 && (lastDate === today || lastDate === yesterday)
    const wasInterrupted = current === 0 && longest > 0

    let titleText = 'Zacznij swoją passę dzisiaj'
    let bigNumber = '0'
    let subText = 'Ukończ lekcję żeby zacząć'
    let isHot = false

    if (isActive) {
        titleText = current >= 7 ? 'Niezła passa!' : 'Passa rozpoczęta'
        bigNumber = String(current)
        subText = current === 1 ? 'dzień' : 'dni z rzędu'
        isHot = current >= 7
    } else if (wasInterrupted) {
        titleText = 'Passa przerwana'
        bigNumber = '0'
        subText = `Twój rekord: ${longest} ${longest === 1 ? 'dzień' : 'dni'}`
    }

    return (
        <Card
            className={
                isHot
                    ? 'bg-gradient-to-br from-warning/10 to-warning/10 border-warning/30'
                    : isActive
                      ? 'bg-gradient-to-br from-warning/10 to-warning/5 border-warning/20'
                      : 'bg-card border-border'
            }
        >
            <CardContent className="p-4 flex items-center gap-3">
                <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                        isHot
                            ? 'bg-warning/20'
                            : isActive
                              ? 'bg-warning/20'
                              : 'bg-muted'
                    }`}
                >
                    <Flame
                        className={`w-6 h-6 ${
                            isHot ? 'text-warning' : isActive ? 'text-warning' : 'text-muted-foreground'
                        }`}
                    />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                        Passa nauki
                    </p>
                    <div className="flex items-baseline gap-2 mt-0.5">
                        <span className={`text-2xl font-bold tabular-nums ${isHot ? 'text-warning' : ''}`}>
                            {bigNumber}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">{subText}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground/80 mt-0.5 truncate">{titleText}</p>
                </div>
            </CardContent>
        </Card>
    )
}
