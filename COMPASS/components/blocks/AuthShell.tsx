import { Check } from "lucide-react"

import { cn } from "@/lib/utils"
import { Logo } from "@/components/common/Logo"

interface AuthShellProps {
  /** Card heading (e.g. "Witaj ponownie"). */
  heading: string
  /** Optional subtitle under the heading. */
  subtitle?: string
  /** Card contents — the form (or a success/error state). */
  children: React.ReactNode
  /** Footer line under the card. Defaults to "COMPASS · B2B Network". */
  footer?: React.ReactNode
  className?: string
}

const BRAND_FEATURES = [
  "Ewidencja czasu pracy, urlopy i obecność",
  "Onboarding, offboarding i lifecycle pracownika",
  "Premie, faktury i rozliczenia w jednym miejscu",
  "Akademia, liga i rozwój zespołu",
]

/**
 * Premium split-screen auth layout (Tailwind Plus / shadcnblocks aesthetic),
 * shared by login / forgot-password / reset. Left = brand panel on `bg-primary`
 * (follows the active accent palette); right = the form card. On mobile the
 * brand panel is hidden and the logo sits above the heading. Purely
 * presentational — all auth wiring lives in the page that supplies `children`.
 */
export function AuthShell({
  heading,
  subtitle,
  children,
  footer = "COMPASS · B2B Network",
  className,
}: AuthShellProps) {
  return (
    <div className={cn("min-h-screen bg-background lg:grid lg:grid-cols-2", className)}>
      {/* Brand panel — lg+ only. bg-primary so it recolors with the palette. */}
      <div className="relative hidden flex-col justify-between bg-primary p-12 text-primary-foreground lg:flex">
        <Logo size="md" variant="monochrome" href="" className="text-primary-foreground" />
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Twoje miejsce pracy — w jednym miejscu.
          </h2>
          <p className="mt-4 text-base text-primary-foreground/80">
            Czas pracy, urlopy, lifecycle, rozliczenia i rozwój — cała platforma HR
            B2B Network w jednym panelu.
          </p>
          <ul className="mt-8 space-y-3">
            {BRAND_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-3 text-sm text-primary-foreground/90">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15">
                  <Check className="h-3 w-3" />
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-primary-foreground/70">COMPASS · B2B Network</p>
      </div>

      {/* Form column. */}
      <div className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center">
            <Logo size="lg" href="" className="mb-6 lg:hidden" />
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{heading}</h1>
            {subtitle && (
              <p className="mt-1.5 text-center text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>

          <div className="relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-sm">
            {children}
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">{footer}</p>
        </div>
      </div>
    </div>
  )
}
