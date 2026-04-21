'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Plus, X, Award, ExternalLink } from "lucide-react"
import { toast } from "sonner"

export interface Certification {
    name: string
    issuer: string
    date_obtained: string
    expiry_date?: string
    credential_url?: string
}

function getCertStatus(cert: Certification): { label: string; className: string } {
    if (!cert.expiry_date) {
        return { label: 'Bezterminowy', className: 'bg-blue-500/20 text-blue-300 border-blue-500/30' }
    }
    const now = new Date()
    const expiry = new Date(cert.expiry_date)
    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    if (daysLeft < 0) {
        return { label: 'Wygasł', className: 'bg-red-500/20 text-red-300 border-red-500/30' }
    }
    if (daysLeft <= 60) {
        return { label: 'Wygasa wkrótce', className: 'bg-amber-500/20 text-amber-300 border-amber-500/30' }
    }
    return { label: 'Ważny', className: 'bg-green-500/20 text-green-300 border-green-500/30' }
}

function formatDate(iso: string): string {
    if (!iso) return ''
    try {
        return new Date(iso).toLocaleDateString('pl-PL', { year: 'numeric', month: 'short', day: 'numeric' })
    } catch {
        return iso
    }
}

interface CertificationsSectionProps {
    certifications: Certification[]
    onSave: (certifications: Certification[]) => Promise<void>
    readOnly?: boolean
}

export function CertificationsSection({ certifications: initialCerts, onSave, readOnly = false }: CertificationsSectionProps) {
    const [certifications, setCertifications] = useState<Certification[]>(initialCerts || [])
    const [isAdding, setIsAdding] = useState(false)
    const [newCert, setNewCert] = useState<Partial<Certification>>({})
    const [saving, setSaving] = useState(false)

    const handleAdd = () => {
        if (!newCert.name?.trim()) {
            toast.error('Wpisz nazwę certyfikatu')
            return
        }
        if (!newCert.issuer?.trim()) {
            toast.error('Wpisz nazwę organizacji wydającej')
            return
        }
        if (!newCert.date_obtained) {
            toast.error('Podaj datę uzyskania')
            return
        }
        const cert: Certification = {
            name: newCert.name.trim(),
            issuer: newCert.issuer.trim(),
            date_obtained: newCert.date_obtained,
            expiry_date: newCert.expiry_date || undefined,
            credential_url: newCert.credential_url?.trim() || undefined,
        }
        const updated = [...certifications, cert]
        setCertifications(updated)
        setNewCert({})
        setIsAdding(false)
        handleSave(updated)
    }

    const handleRemove = (index: number) => {
        const updated = certifications.filter((_, i) => i !== index)
        setCertifications(updated)
        handleSave(updated)
    }

    const handleSave = async (items: Certification[]) => {
        setSaving(true)
        try {
            await onSave(items)
            toast.success('Certyfikaty zaktualizowane')
        } catch {
            toast.error('Nie udało się zapisać')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Award className="h-5 w-5 text-primary" />
                        Certyfikaty
                    </CardTitle>
                    {!readOnly && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsAdding(!isAdding)}
                            disabled={saving}
                        >
                            <Plus className="h-4 w-4 mr-1" />
                            Dodaj
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {isAdding && (
                    <div className="p-3 rounded-lg bg-card/80 border border-white/10 space-y-3">
                        <input
                            type="text"
                            placeholder="Nazwa certyfikatu..."
                            value={newCert.name || ''}
                            onChange={e => setNewCert(prev => ({ ...prev, name: e.target.value }))}
                            className="w-full bg-transparent border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                            autoFocus
                        />
                        <input
                            type="text"
                            placeholder="Organizacja wydająca (np. AWS, Microsoft)..."
                            value={newCert.issuer || ''}
                            onChange={e => setNewCert(prev => ({ ...prev, issuer: e.target.value }))}
                            className="w-full bg-transparent border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                        />
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Data uzyskania</label>
                                <input
                                    type="date"
                                    value={newCert.date_obtained || ''}
                                    onChange={e => setNewCert(prev => ({ ...prev, date_obtained: e.target.value }))}
                                    className="w-full bg-card border border-white/10 rounded-md px-3 py-1.5 text-sm text-white"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-muted-foreground mb-1 block">Data wygaśnięcia (opcjonalnie)</label>
                                <input
                                    type="date"
                                    value={newCert.expiry_date || ''}
                                    onChange={e => setNewCert(prev => ({ ...prev, expiry_date: e.target.value }))}
                                    className="w-full bg-card border border-white/10 rounded-md px-3 py-1.5 text-sm text-white"
                                />
                            </div>
                        </div>
                        <input
                            type="url"
                            placeholder="URL potwierdzenia (opcjonalnie)..."
                            value={newCert.credential_url || ''}
                            onChange={e => setNewCert(prev => ({ ...prev, credential_url: e.target.value }))}
                            className="w-full bg-transparent border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                        />
                        <div className="flex gap-2">
                            <Button size="sm" onClick={handleAdd}>Zapisz</Button>
                            <Button size="sm" variant="ghost" onClick={() => { setIsAdding(false); setNewCert({}) }}>Anuluj</Button>
                        </div>
                    </div>
                )}

                {certifications.map((cert, idx) => {
                    const status = getCertStatus(cert)
                    return (
                        <div
                            key={`${cert.name}-${idx}`}
                            className="flex items-start justify-between p-3 rounded-lg bg-white/5 border border-white/5 hover:border-white/10 transition"
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="font-medium text-sm text-white truncate">{cert.name}</span>
                                    <Badge variant="outline" className={`${status.className} text-[10px] px-1.5 py-0`}>
                                        {status.label}
                                    </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">{cert.issuer}</p>
                                <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                                    <span>Uzyskano: {formatDate(cert.date_obtained)}</span>
                                    {cert.expiry_date && (
                                        <span>Wygasa: {formatDate(cert.expiry_date)}</span>
                                    )}
                                    {cert.credential_url && (
                                        <a
                                            href={cert.credential_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-primary hover:underline"
                                        >
                                            <ExternalLink className="h-3 w-3" />
                                            Weryfikuj
                                        </a>
                                    )}
                                </div>
                            </div>
                            {!readOnly && (
                                <button
                                    onClick={() => handleRemove(idx)}
                                    className="ml-2 p-1 text-muted-foreground hover:text-red-400 transition"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    )
                })}

                {certifications.length === 0 && !isAdding && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                        Brak certyfikatów. Dodaj swoje certyfikaty.
                    </p>
                )}
            </CardContent>
        </Card>
    )
}
