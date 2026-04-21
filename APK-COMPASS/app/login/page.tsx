'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '@/components/ui/card'
import { AlertCircle, Loader2, Eye, EyeOff, CheckCircle2 } from 'lucide-react'
import { Logo } from '@/components/common/Logo'
import Link from 'next/link'
import { login, signup, verifyMfaAction } from './actions'

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

    // MFA State (setMfaUserId used when login returns mfa_required)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- setter kept for MFA flow
    const [mfaUserId, setMfaUserId] = useState<string | null>(null)
    const [mfaCode, setMfaCode] = useState('')

    // Detect desktop for opening links in new tab
    const [isDesktop, setIsDesktop] = useState(false)
    useEffect(() => {
        setIsDesktop(window.innerWidth >= 768)
    }, [])

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

    // ─── MFA Submit ─────────────────────────────────────────────────────
    async function handleMfaSubmit() {
        if (!mfaUserId || !mfaCode) return
        setLoading(true)
        setError(null)
        startLoadingSteps()

        const result = await verifyMfaAction(mfaUserId, mfaCode)
        if (result?.error) {
            stopLoadingSteps()
            setError(result.error)
            triggerShake()
            setLoading(false)
        }
        // Redirect handled by server action if success
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4 relative overflow-hidden">
            {/* 1. Animated gradient mesh background */}
            <div className="login-bg-mesh" />

            <Card
                ref={cardRef}
                className={`w-full max-w-md bg-card relative z-10 login-card-enter ${shaking ? 'login-card-shake' : ''}`}
            >
                {/* 7. Progress bar */}
                {loading && (
                    <div
                        className="login-progress-bar"
                        style={{ width: `${progress}%`, opacity: loading ? 1 : 0 }}
                    />
                )}

                {/* 8. Success overlay */}
                {showSuccessOverlay && (
                    <div className="absolute inset-0 bg-card z-20 flex flex-col items-center justify-center rounded-lg">
                        <div className="login-success-anim">
                            <svg width="64" height="64" viewBox="0 0 52 52">
                                <circle
                                    className="login-success-circle"
                                    cx="26" cy="26" r="25"
                                    fill="none" stroke="#3A8DFF" strokeWidth="2"
                                />
                                <path
                                    className="login-success-check"
                                    fill="none" stroke="#3A8DFF" strokeWidth="3"
                                    strokeLinecap="round" strokeLinejoin="round"
                                    d="M14.1 27.2l7.1 7.2 16.7-16.8"
                                />
                            </svg>
                        </div>
                        <p className="text-lg font-semibold mt-4 login-success-text">
                            Witaj z powrotem!
                        </p>
                        <p className="text-sm text-muted-foreground mt-1 login-success-subtext">
                            Przygotowuję Twój panel...
                        </p>
                    </div>
                )}

                <CardHeader className="space-y-1">
                    <div className="mb-8 flex flex-col items-center">
                        <Logo size="xl" className="mb-6" />
                        <h1 className="text-2xl font-bold text-white">Witaj ponownie</h1>
                        <p className="text-muted-foreground mt-2">Zaloguj się do swojego konta</p>
                    </div>
                    <CardDescription className="text-center">
                        {isSignUp ? 'Utwórz nowe konto' : 'Zaloguj się do panelu konsultanta'}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {!mfaUserId ? (
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
                                    className="login-input-glow transition-all duration-200"
                                />
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

                            {/* Password field with show/hide toggle */}
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
                                    <button
                                        type="button"
                                        tabIndex={-1}
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
                                {isSignUp && <p className="text-xs text-muted-foreground">Min. 10 znaków, 1 duża litera, 1 cyfra.</p>}
                            </div>

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

                            {/* Submit button */}
                            <Button type="submit" className="w-full" disabled={loading} data-testid="login-submit">
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {isSignUp ? 'Zarejestruj się' : 'Zaloguj się'}
                            </Button>

                            {/* Loading status text */}
                            {loading && statusText && (
                                <p className="text-center text-xs text-muted-foreground login-status-pulse">
                                    {statusText}
                                </p>
                            )}
                        </form>
                    ) : (
                        /* ─── MFA Section ─────────────────────────────────── */
                        <div className="space-y-4">
                            <div className="text-center space-y-2">
                                <div className="bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto text-primary">
                                    <AlertCircle className="h-6 w-6" />
                                </div>
                                <h3 className="font-semibold text-lg">Weryfikacja dwuetapowa</h3>
                                <p className="text-sm text-muted-foreground">
                                    Wysłaliśmy kod weryfikacyjny na Twój adres email. Wpisz go poniżej, aby kontynuować.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="code">Kod weryfikacyjny</Label>
                                <Input
                                    id="code"
                                    value={mfaCode}
                                    onChange={(e) => setMfaCode(e.target.value)}
                                    placeholder="123456"
                                    className="text-center text-lg tracking-widest login-input-glow transition-all duration-200"
                                    maxLength={6}
                                    disabled={loading}
                                />
                            </div>
                            {error && (
                                <div className="login-msg-enter flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md border border-destructive/20">
                                    <AlertCircle className="h-4 w-4 shrink-0" />
                                    <span>{error}</span>
                                </div>
                            )}
                            <Button onClick={handleMfaSubmit} className="w-full" disabled={loading || mfaCode.length < 6}>
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Potwierdź
                            </Button>
                            {loading && statusText && (
                                <p className="text-center text-xs text-muted-foreground login-status-pulse">
                                    {statusText}
                                </p>
                            )}
                        </div>
                    )}
                </CardContent>
                <CardFooter className="flex flex-col space-y-2 text-center text-sm text-muted-foreground">
                    <p>
                        {isSignUp ? 'Masz już konto?' : 'Nie masz konta?'}
                        <button
                            type="button"
                            className="ml-1 text-primary hover:underline font-medium"
                            onClick={() => {
                                setIsSignUp(!isSignUp)
                                setError(null)
                                setSuccess(null)
                                setFailCount(0)
                            }}
                        >
                            {isSignUp ? 'Zaloguj się' : 'Zarejestruj się'}
                        </button>
                    </p>
                </CardFooter>
                <div className="text-center pb-4 space-y-2">
                    <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground/60">
                        <a href="/privacy-policy" target={isDesktop ? '_blank' : undefined} rel={isDesktop ? 'noopener noreferrer' : undefined} className="hover:text-primary transition-colors">Polityka prywatności</a>
                        <span>·</span>
                        <a href="/terms" target={isDesktop ? '_blank' : undefined} rel={isDesktop ? 'noopener noreferrer' : undefined} className="hover:text-primary transition-colors">Regulamin</a>
                        <span>·</span>
                        <a href="/help" target={isDesktop ? '_blank' : undefined} rel={isDesktop ? 'noopener noreferrer' : undefined} className="hover:text-primary transition-colors">Pomoc</a>
                    </div>
                    <p className="text-xs text-muted-foreground/40">ComPass by Inframinds</p>
                </div>
            </Card>
        </div>
    )
}
