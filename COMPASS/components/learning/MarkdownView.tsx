'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface MarkdownViewProps {
    content: string
    className?: string
}

/**
 * Bezpieczny renderer markdown — nie włączamy `rehype-raw` (XSS risk).
 * Wspiera GFM: tabele, checkboxy, autolinki, fenced code blocks.
 */
export function MarkdownView({ content, className }: MarkdownViewProps) {
    return (
        <div
            className={cn(
                'prose prose-sm max-w-none',
                'prose-headings:text-foreground prose-headings:font-bold',
                'prose-p:text-foreground/90 prose-li:text-foreground/90',
                'prose-strong:text-foreground prose-em:text-foreground/80',
                'prose-a:text-primary prose-a:underline hover:prose-a:text-primary/80',
                'prose-code:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none',
                'prose-pre:bg-muted prose-pre:border prose-pre:border-border',
                'prose-blockquote:border-l-primary prose-blockquote:text-foreground/80',
                'prose-table:border prose-table:border-border',
                'prose-th:bg-muted prose-th:text-foreground prose-th:p-2 prose-th:border prose-th:border-border',
                'prose-td:p-2 prose-td:border prose-td:border-border prose-td:text-foreground/90',
                className,
            )}
        >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
    )
}
