import DOMPurify from 'isomorphic-dompurify'

/**
 * Sanitize HTML zanim oddamy go do `dangerouslySetInnerHTML`. Używamy
 * defaultowej konfiguracji DOMPurify — pozwala typowy formatting (p, h1-h6,
 * lists, links, code, blockquote, table) i blokuje `<script>`, inline event
 * handlers (`onclick=`), `javascript:` URLs, oraz `<iframe>`/`<object>`.
 *
 * Używamy gdy treść pochodzi z bazy (np. legal docs editowane przez admina) —
 * nawet zaufany autor może niechcący wkleić HTML z osadzonym JS. Plus defense
 * in depth jeśli atakujący przejmie konto admin.
 */
export function sanitizeHtml(dirty: string | null | undefined): string {
    if (!dirty) return ''
    return DOMPurify.sanitize(dirty)
}
