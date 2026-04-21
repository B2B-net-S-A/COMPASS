'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Loader2, Shield, ExternalLink } from 'lucide-react'
import { Logo } from '@/components/common/Logo'
import Link from 'next/link'
import { saveUserConsents } from '@/lib/actions/compliance'
import { CONSENT_LABELS, CONSENT_REQUIRED_CHECKBOXES, type ConsentCheckboxKey } from '@/lib/constants/compliance'

export default function ConsentPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checks, setChecks] = useState<Record<ConsentCheckboxKey, boolean>>({
    terms: false,
    privacy: false,
    data_processing: false,
    ai: false,
  })

  const allChecked = CONSENT_REQUIRED_CHECKBOXES.every(key => checks[key])

  const handleToggle = (key: ConsentCheckboxKey) => {
    setChecks(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSubmit = async () => {
    if (!allChecked) return
    setLoading(true)
    setError(null)

    const result = await saveUserConsents({
      accepted_terms: checks.terms,
      accepted_privacy: checks.privacy,
      accepted_data_processing: checks.data_processing,
      accepted_ai: checks.ai,
    })

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    // Consent saved — redirect to the main app
    router.push('/home')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <Logo size="lg" />
          </div>
          <div className="flex items-center justify-center gap-2 text-primary">
            <Shield className="h-5 w-5" />
            <h1 className="text-xl font-bold">Akceptacja regulaminów</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Aby kontynuować korzystanie z platformy ComPass, prosimy o zapoznanie się z poniższymi dokumentami i wyrażenie wymaganych zgód.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Consent checkboxes */}
          <div className="space-y-4">
            {CONSENT_REQUIRED_CHECKBOXES.map(key => {
              const label = CONSENT_LABELS[key]
              return (
                <div key={key} className="flex items-start space-x-3">
                  <Checkbox
                    id={`consent-${key}`}
                    checked={checks[key]}
                    onCheckedChange={() => handleToggle(key)}
                    disabled={loading}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <Label
                      htmlFor={`consent-${key}`}
                      className="text-sm font-medium leading-relaxed cursor-pointer"
                    >
                      {label.text}
                    </Label>
                    {label.docSlug && (
                      <Link
                        href={`/docs/${label.docSlug}`}
                        target="_blank"
                        className="flex items-center gap-1 text-xs text-primary hover:underline mt-0.5"
                      >
                        Przeczytaj dokument <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Error */}
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md border border-destructive/20">
              {error}
            </div>
          )}

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            className="w-full"
            disabled={!allChecked || loading}
            size="lg"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Przejdź do systemu
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Twoja akceptacja zostanie zarejestrowana wraz z adresem IP oraz datą i godziną.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
