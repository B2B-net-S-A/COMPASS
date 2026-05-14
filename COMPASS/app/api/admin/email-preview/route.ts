import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { canAccessInternalZone, isAdminLike, type AppRole } from '@/lib/types/role'
import { isPreviewTemplate, PREVIEW_TEMPLATES, renderPreview } from '@/lib/email/previews'

export const dynamic = 'force-dynamic'

/**
 * Admin-only email template preview.
 *
 *   GET /api/admin/email-preview                   → JSON list of templates
 *   GET /api/admin/email-preview?template=NAME     → HTML render (iframe-safe)
 *   GET /api/admin/email-preview?template=NAME&format=json → { subject, html }
 *
 * Returns 401 if not signed in, 403 if not admin. No emails are sent.
 *
 * Why a route handler instead of a server action: lets us hit it from a
 * browser iframe, curl, or Postman with just an authenticated cookie. The
 * iframe is the most useful view (you see the email exactly as a recipient
 * would in Outlook).
 */
export async function GET(request: NextRequest): Promise<Response> {
    // Auth: load user + role (mirrors requireAdminLayout/requireAdminAction)
    const supabase = createClient()
    const {
        data: { user },
        error: userErr,
    } = await supabase.auth.getUser()

    if (userErr || !user || !user.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single<{ role: string | null }>()

    const role = (profile?.role ?? 'consultant') as AppRole

    if (!canAccessInternalZone(role) || !isAdminLike(role)) {
        return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 })
    }

    // List mode (no ?template)
    const url = new URL(request.url)
    const template = url.searchParams.get('template')

    if (!template) {
        return NextResponse.json({
            available: PREVIEW_TEMPLATES,
            usage: '/api/admin/email-preview?template=<name> for HTML iframe, append &format=json for raw object',
        })
    }

    if (!isPreviewTemplate(template)) {
        return NextResponse.json(
            {
                error: `Unknown template: ${template}`,
                available: PREVIEW_TEMPLATES,
            },
            { status: 400 },
        )
    }

    const result = renderPreview(template)

    if (url.searchParams.get('format') === 'json') {
        return NextResponse.json(result)
    }

    // Default: HTML for iframe rendering. Wrap in a minimal page that shows
    // the subject + the email body in an iframe-like card.
    const page = `<!doctype html>
<html lang="pl">
<head>
    <meta charset="utf-8" />
    <title>Email preview: ${template}</title>
    <style>
        body { font-family: -apple-system, system-ui, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 24px; }
        .preview-meta { max-width: 700px; margin: 0 auto 16px; padding: 16px 20px; background: #1e293b; border-radius: 8px; border: 1px solid #334155; }
        .preview-meta .label { color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
        .preview-meta .value { color: #f1f5f9; font-size: 14px; margin-top: 4px; }
        .preview-frame { max-width: 700px; margin: 0 auto; }
    </style>
</head>
<body>
    <div class="preview-meta">
        <div class="label">Template</div>
        <div class="value">${template}</div>
        <div class="label" style="margin-top: 12px;">Subject</div>
        <div class="value">${escapeHtml(result.subject)}</div>
    </div>
    <div class="preview-frame">${result.html}</div>
</body>
</html>`

    return new Response(page, {
        status: 200,
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
        },
    })
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}
