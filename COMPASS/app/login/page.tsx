'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, Loader2, Eye, EyeOff, CheckCircle2 } from 'lucide-react'
import { AuthShell } from '@/components/blocks/AuthShell'
import Link from 'next/link'
import { login, signup, signInWithMicrosoft } from './actions'
import { ARCHIVED_ACCOUNT_ERROR_CODE, ARCHIVED_ACCOUNT_MESSAGE_PL } from '@/lib/auth/employment-access'
import { PASSWORD_POLICY_HINT_PL } from '@/lib/auth/password-policy'

// ─── Loading Step Messages ──────────────────────────────────────────────────
const LOADING_STEPS = [
    { text: 'Weryfikuję dane...', progress: 35 },
    { text: 'Sprawdzam uprawnienia...', progress: 65 },
    { text: 'Przygotowuję panel...', progress: 90 },
]

export default function LoginPage() {
    const [isSignUp, setIsSignUp] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    // Show/Hide password
    const [showPassword, setShowPassword] = useState(false)

    // PR5a: pracownicy biura (@b2bnetwork.pl) muszą logować się przez SSO.
    // Track wpisany email żeby dynamicznie ukryć password field.
    const [typedEmail, setTypedEmail] = useState('')
    const requiresSso =
        !isSignUp && typedEmail.toLowerCase().trim().endsWith('@b2bnetwork.pl')

    // Shake animation
    const [shaking, setShaking] = useState(false)
    const cardRef = useRef<HTMLDivElement>(null)

    // Failed attempts counter (for showing forgot password link)
    const [failCount, setFailCount] = useState(0)

    // Loading progress
    const [progress, setProgress] = useState(0)
    const [statusText, setStatusText] = useState('')
    const loadingTimers = useRef<NodeJS.Timeout[]>([])

    // Success overlay
    const [showSuccessOverlay, setShowSuccessOverlay] = useState(false)


    // Detect desktop for opening links in new tab
    const [isDesktop, setIsDesktop] = useState(false)
    useEffect(() => {
        setIsDesktop(window.innerWidth >= 768)
    }, [])

    // Pick up error from /auth/callback redirects (e.g. ?error=domain_not_allowed)
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const err = params.get('error')
        if (err === 'domain_not_allowed') {
            setError('Logowanie przez Microsoft jest dostępne tylko dla kont @b2bnetwork.pl.')
        } else if (err === ARCHIVED_ACCOUNT_ERROR_CODE) {
            setError(ARCHIVED_ACCOUNT_MESSAGE_PL)
        } else if (err === 'auth_failed') {
            setError('Logowanie nie powiodło się. Spróbuj ponownie.')
        }
    }, [])

    const [ssoLoading, setSsoLoading] = useState(false)
    async function handleMicrosoftLogin() {
        setError(null)
        setSuccess(null)
        setSsoLoading(true)
        const result = await signInWithMicrosoft()
        // Server action redirects on success; only returns here on error
        if (result?.error) {
            setError(result.error)
            setSsoLoading(false)
            triggerShake()
        }
    }

    // ─── Shake trigger ──────────────────────────────────────────────────
    const triggerShake = useCallback(() => {
        setShaking(true)
        setTimeout(() => setShaking(false), 500)
    }, [])

    // ─── Loading steps animation ────────────────────────────────────────
    const startLoadingSteps = useCallback(() => {
        setProgress(0)
        setStatusText('')
        // Clear any previous timers
        loadingTimers.current.forEach(t => clearTimeout(t))
        loadingTimers.current = []

        LOADING_STEPS.forEach((step, i) => {
            const timer = setTimeout(() => {
                setProgress(step.progress)
                setStatusText(step.text)
            }, i * 800)
            loadingTimers.current.push(timer)
        })
    }, [])

    const stopLoadingSteps = useCallback(() => {
        loadingTimers.current.forEach(t => clearTimeout(t))
        loadingTimers.current = []
        setProgress(0)
        setStatusText('')
    }, [])

    // Cleanup timers on unmount
    useEffect(() => {
        return () => {
            loadingTimers.current.forEach(t => clearTimeout(t))
        }
    }, [])

    // ─── Form Submit ────────────────────────────────────────────────────
    async function handleSubmit(formData: FormData) {
        setLoading(true)
        setError(null)
        setSuccess(null)
        startLoadingSteps()

        if (isSignUp) {
            const signupResult = await signup(formData)
            stopLoadingSteps()
            if (signupResult?.error) {
                setError(signupResult.error)
                triggerShake()
            } else if (signupResult?.success) {
                setSuccess(signupResult.success)
            }
        } else {
            const result = await login(formData)
            if (result?.error) {
                stopLoadingSteps()
                setError(result.error)
                setFailCount(prev => prev + 1)
                triggerShake()
            }
            // If no error → redirect happens server-side
            // Show success overlay briefly before redirect kicks in
            if (!result?.error) {
                setProgress(100)
                setStatusText('Przekierowuję...')
                setShowSuccessOverlay(true)
                // Redirect is handled by server action, overlay is just visual polish
                return
            }
        }
        setLoading(false)
    }

    return (
        <AuthShell
            heading="Witaj ponownie"
            subtitle={isSignUp ? 'Utwórz nowe konto' : 'Zaloguj się do panelu konsultanta'}
        >
            <div ref={cardRef} className={`login-card-enter ${shaking ? 'login-card-shake' : ''}`}>
                {/* Progress bar */}
                {loading && (
                    <div
                        className="login-progress-bar"
                        style={{ width: `${progress}%`, opacity: loading ? 1 : 0 }}
                    />
                )}

                {/* Success overlay */}
                {showSuccessOverlay && (
                    <div className="absolute inset-0 bg-card z-20 flex flex-col items-center justify-center">
                        <div className="login-success-anim text-primary">
                            <svg width="64" height="64" viewBox="0 0 52 52">
                                <circle
                                    className="login-success-circle"
                                    cx="26" cy="26" r="25"
                                    fill="none" stroke="currentColor" strokeWidth="2"
                                />
                                <path
                                    className="login-success-check"
                                    fill="none" stroke="currentColor" strokeWidth="3"
                                    strokeLinecap="round" strokeLinejoin="round"
                                    d="M14.1 27.2l7.1 7.2 16.7-16.8"
                                />
                            </svg>
                        </div>
                        <p className="text-lg font-semibold mt-4 login-success-text text-foreground">
                            Witaj z powrotem!
                        </p>
                        <p className="text-sm text-muted-foreground mt-1 login-success-subtext">
                            Przygotowuję Twój panel...
                        </p>
                    </div>
                )}

                <form action={handleSubmit} className="space-y-4">
                            {/* Email field */}
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    name="email"
                                    type="email"
                                    placeholder="name@b2bnetwork.pl"
                                    required
                                    disabled={loading}
                                    data-testid="login-email"
                                    value={typedEmail}
                                    onChange={(e) => setTypedEmail(e.target.value)}
                                    className="login-input-glow transition-all duration-200"
                                />
                                {isSignUp && (
                                    <p className="text-xs text-muted-foreground/80">
                                        Rejestracja dostępna tylko dla email z domeny <span className="font-mono text-foreground/90">@b2bnetwork.pl</span>.
                                    </p>
                                )}
                                {requiresSso && (
                                    <p className="text-xs text-primary/90 bg-primary/10 border border-primary/20 rounded-md px-3 py-2">
                                        Pracownicy biura logują się przez Microsoft 365.
                                        Kliknij <strong>Zaloguj przez Microsoft 365</strong> poniżej.
                                    </p>
                                )}
                            </div>

                            {/* Full name (signup only) */}
                            {isSignUp && (
                                <div className="space-y-2">
                                    <Label htmlFor="fullName">Imię i Nazwisko</Label>
                                    <Input
                                        id="fullName"
                                        name="fullName"
                                        type="text"
                                        placeholder="Jan Kowalski"
                                        required={isSignUp}
                                        disabled={loading}
                                        className="login-input-glow transition-all duration-200"
                                    />
                                </div>
                            )}

                            {/* GDPR consent (signup only) */}
                            {isSignUp && (
                                <div className="flex items-start space-x-2">
                                    <input
                                        type="checkbox"
                                        id="gdpr_consent"
                                        name="gdpr_consent"
                                        className="mt-1"
                                        required
                                    />
                                    <Label htmlFor="gdpr_consent" className="text-xs leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                        Akceptuję politykę prywatności i zgadzam się na przetwarzanie moich danych osobowych zgodnie z RODO.
                                    </Label>
                                </div>
                            )}

                            {/* Password field with show/hide toggle.
                                PR5a: hidden when typed email is @b2bnetwork.pl
                                (those users login via Microsoft SSO only). */}
                            {!requiresSso && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="password">Hasło</Label>
                                    {!isSignUp && (
                                        <Link
                                            href="/forgot-password"
                                            className="text-xs text-muted-foreground hover:text-primary transition-colors"
                                            tabIndex={-1}
                                        >
                                            Nie pamiętasz hasła?
                                        </Link>
                                    )}
                                </div>
                                <div className="relative">
                                    <Input
                                        id="password"
                                        name="password"
                                        type={showPassword ? 'text' : 'password'}
                                        required
                                        disabled={loading}
                                        data-testid="login-password"
                                        className="login-input-glow transition-all duration-200 pr-10"
                                    />
                                    {/* Audyt 2026-08: przełącznik miał `tabIndex={-1}` i zero
                                        etykiety — nie dało się go dosięgnąć z klawiatury,
                                        a czytnik ekranu ogłaszał pusty przycisk. */}
                                    <button
                                        type="button"
                                        aria-label={showPassword ? 'Ukryj hasło' : 'Pokaż hasło'}
                                        aria-pressed={showPassword}
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        {showPassword ? (
                                            <EyeOff className="h-4 w-4" />
                                        ) : (
                                            <Eye className="h-4 w-4" />
                                        )}
                                    </button>
                                </div>
                                {isSignUp && <p className="text-xs text-muted-foreground">{PASSWORD_POLICY_HINT_PL}</p>}
                            </div>
                            )}

                            {/* Error message with animation */}
                            {error && (
                                <div data-testid="login-error" className="login-msg-enter flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md border border-destructive/20">
                                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                    <div>
                                        <span>{error}</span>
                                        {/* Show forgot password link after 2+ failed attempts */}
                                        {!isSignUp && (
                                            <Link
                                                href="/forgot-password"
                                                className="block mt-1.5 text-xs text-primary hover:underline"
                                            >
                                                Nie pamiętasz hasła? Zresetuj je →
                                            </Link>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Success message with animation */}
                            {success && (
                                <div className="login-msg-enter flex items-center gap-2 text-sm text-primary bg-primary/10 p-3 rounded-md border border-primary/20">
                                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                                    <span>{success}</span>
                                </div>
                            )}

                            {/* Submit button — hidden when SSO required */}
                            {!requiresSso && (
                                <Button type="submit" className="w-full" disabled={loading} data-testid="login-submit">
                                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    {isSignUp ? 'Zarejestruj się' : 'Zaloguj się'}
                                </Button>
                            )}

                            {/* Loading status text */}
                            {loading && statusText && (
                                <p className="text-center text-xs text-muted-foreground login-status-pulse">
                                    {statusText}
                                </p>
                            )}

                            {/* Microsoft 365 SSO (only on login screen, not signup) */}
                            {!isSignUp && (
                                <>
                                    <div className="relative my-2">
                                        <div className="absolute inset-0 flex items-center">
                                            <span className="w-full border-t border-border" />
                                        </div>
                                        <div className="relative flex justify-center text-xs uppercase">
                                            <span className="bg-card px-2 text-muted-foreground">lub</span>
                                        </div>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full"
                                        disabled={loading || ssoLoading}
                                        onClick={handleMicrosoftLogin}
                                        data-testid="login-microsoft"
                                    >
                                        {ssoLoading ? (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                            <svg className="mr-2 h-4 w-4" viewBox="0 0 21 21" aria-hidden="true">
                                                <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                                                <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                                                <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                                                <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                                            </svg>
                                        )}
                                        Zaloguj przez Microsoft 365
                                    </Button>
                                </>
                            )}
                        </form>

                <div className="mt-6 space-y-3 text-center text-xs text-muted-foreground">
                    {/* Self-signup disabled — nowe konta wyłącznie przez admin invite (/admin/settings/users). */}
                    <p>Nie masz jeszcze konta? Skontaktuj się z administratorem.</p>
                    <div className="flex items-center justify-center gap-3 text-muted-foreground/70">
                        <a href="/privacy-policy" target={isDesktop ? '_blank' : undefined} rel={isDesktop ? 'noopener noreferrer' : undefined} className="hover:text-primary transition-colors">Polityka prywatności</a>
                        <span>·</span>
                        <a href="/terms" target={isDesktop ? '_blank' : undefined} rel={isDesktop ? 'noopener noreferrer' : undefined} className="hover:text-primary transition-colors">Regulamin</a>
                        <span>·</span>
                        <a href="/help" target={isDesktop ? '_blank' : undefined} rel={isDesktop ? 'noopener noreferrer' : undefined} className="hover:text-primary transition-colors">Pomoc</a>
                    </div>
                </div>
            </div>
        </AuthShell>
    )
}
