'use client'

import { useState, useEffect } from 'react'
import { getMyFavoriteProjects } from '@/lib/actions/favorites'
import { useLayoutPreferences } from '@/lib/contexts/LayoutPreferencesContext'
import { LayoutSwitcher } from '@/components/profile/LayoutSwitcher'
import { ProfileGridLayout } from '@/components/profile/layouts/ProfileGridLayout'
import { ProfileTabsLayout } from '@/components/profile/layouts/ProfileTabsLayout'
import { ProfileFeedLayout } from '@/components/profile/layouts/ProfileFeedLayout'
import { useConfirm } from '@/components/shared/ConfirmDialog'

export function ConsultantProfileView() {
    // State
    const [bio, setBio] = useState('')
    const [experience, setExperience] = useState(0)
    const [status, setStatus] = useState('open')
    const [fullName, setFullName] = useState('')
    const [phone, setPhone] = useState('')
    const [capacity, setCapacity] = useState(100)
    const [sentiments, setSentiments] = useState<string[]>([])
    const [verifier, setVerifier] = useState('not_interested')
    const [ambassador, setAmbassador] = useState('not_interested')
    const [sales, setSales] = useState('not_interested')
    const [clients, setClients] = useState<string[]>([])
    const [clientInput, setClientInput] = useState('')
    const [availableFrom, setAvailableFrom] = useState<string>('')
    const [fteStatus, setFteStatus] = useState<string>('')
    const [maxMonthlyHours, setMaxMonthlyHours] = useState<number>(160)
    const [loading, setLoading] = useState(false)
    const [avatarLoading, setAvatarLoading] = useState(false)
    const [confirm, ConfirmUI] = useConfirm()
    const [currentCvUrl, setCurrentCvUrl] = useState<string | null>(null)
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
    const [coverLetter, setCoverLetter] = useState('')
    const [favorites, setFavorites] = useState<any[]>([])
    const [initialProfile, setInitialProfile] = useState<any>(null)
    const [isDirty, setIsDirty] = useState(false)
    const [fileToUpload, setFileToUpload] = useState<File | null>(null)
    const [loyaltyPoints, setLoyaltyPoints] = useState(0)
    const [loyaltyTier, setLoyaltyTier] = useState('bronze')

    // Load profile data
    useEffect(() => {
        const loadProfile = async () => {
            try {
                const { getMyProfile } = await import('@/lib/actions/matching')
                const profile = await getMyProfile()
                if (profile) {
                    if (profile.bio) setBio(profile.bio)
                    if (profile.experience_years) setExperience(profile.experience_years)
                    if (profile.current_status) setStatus(profile.current_status)
                    if (profile.capacity_percentage) setCapacity(profile.capacity_percentage)
                    if (profile.project_sentiment) setSentiments(profile.project_sentiment)
                    if (profile.verifier_status) setVerifier(profile.verifier_status)
                    if (profile.ambassador_status) setAmbassador(profile.ambassador_status)
                    if (profile.sales_support_status) setSales(profile.sales_support_status)
                    if (profile.previous_clients) setClients(profile.previous_clients)
                    if (profile.available_from) setAvailableFrom(profile.available_from)
                    if (profile.fte_status) setFteStatus(profile.fte_status)
                    if (profile.max_monthly_hours) setMaxMonthlyHours(profile.max_monthly_hours)
                    if (profile.cv_url) setCurrentCvUrl('uploaded')
                    if (profile.avatar_url) setAvatarUrl(profile.avatar_url)
                    if (profile.loyalty_points != null) setLoyaltyPoints(profile.loyalty_points)
                    if (profile.loyalty_tier) setLoyaltyTier(profile.loyalty_tier)
                    if (profile.full_name) setFullName(profile.full_name)
                    if (profile.phone) setPhone(profile.phone)

                    setInitialProfile({
                        bio: profile.bio || '',
                        experience_years: profile.experience_years || 0,
                        current_status: profile.current_status || 'open',
                        capacity_percentage: profile.capacity_percentage || 100,
                        project_sentiment: profile.project_sentiment || [],
                        verifier_status: profile.verifier_status || 'not_interested',
                        ambassador_status: profile.ambassador_status || 'not_interested',
                        sales_support_status: profile.sales_support_status || 'not_interested',
                        previous_clients: profile.previous_clients || [],
                        available_from: profile.available_from || '',
                        fte_status: profile.fte_status || '',
                        max_monthly_hours: profile.max_monthly_hours || 160,
                        full_name: profile.full_name || '',
                        phone: profile.phone || '',
                        skills: profile.skills || [],
                        tech_stack: profile.tech_stack || [],
                        certifications: profile.certifications || [],
                    })
                }
            } catch (e) {
                console.error('Failed to load profile', e)
            }
        }
        const loadFavorites = async () => {
            const favs = await getMyFavoriteProjects()
            setFavorites(favs)
        }
        loadProfile()
        loadFavorites()
    }, [])

    // Track dirty state
    useEffect(() => {
        if (!initialProfile) return

        const currentState = {
            bio,
            experience_years: experience,
            current_status: status,
            capacity_percentage: capacity,
            project_sentiment: sentiments,
            verifier_status: verifier,
            ambassador_status: ambassador,
            sales_support_status: sales,
            previous_clients: clients,
            available_from: availableFrom,
            fte_status: fteStatus,
            max_monthly_hours: maxMonthlyHours,
            full_name: fullName,
            phone: phone
        }

        const isModified = JSON.stringify(currentState) !== JSON.stringify(initialProfile)
        setIsDirty(isModified)

        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isModified) {
                e.preventDefault()
                e.returnValue = ''
            }
        }

        window.addEventListener('beforeunload', handleBeforeUnload)
        return () => window.removeEventListener('beforeunload', handleBeforeUnload)
    }, [bio, experience, status, capacity, sentiments, verifier, ambassador, sales, clients, availableFrom, fteStatus, maxMonthlyHours, initialProfile, fullName, phone])

    // Handlers
    const handleSaveProfile = async () => {
        const ok = await confirm({
            title: 'Zapisz profil',
            description: 'Czy na pewno chcesz zapisać zmiany w profilu?',
            confirmLabel: 'Zapisz',
        })
        if (!ok) return

        setLoading(true)
        try {
            const { updateProfileFull } = await import('@/lib/actions/matching')
            const result = await updateProfileFull({
                bio,
                experience_years: experience,
                current_status: status,
                capacity_percentage: capacity,
                project_sentiment: sentiments,
                verifier_status: verifier,
                ambassador_status: ambassador,
                sales_support_status: sales,
                previous_clients: clients,
                available_from: availableFrom,
                fte_status: fteStatus,
                max_monthly_hours: maxMonthlyHours,
                full_name: fullName,
                phone: phone
            })
            if (result.success === false) {
                alert('Wystąpił błąd podczas zapisywania profilu: ' + (result.error || 'Nieznany błąd'))
                return
            }
            if (result.warning) alert(result.warning)
            alert('Profil zaktualizowany pomyślnie!')
            setIsDirty(false)
        } catch (error: unknown) {
            const err = error as Error
            console.error(err)
            alert('Wystąpił błąd podczas zapisywania profilu: ' + (err?.message || 'Nieznany błąd'))
        } finally {
            setLoading(false)
        }
    }

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setAvatarLoading(true)
        const formData = new FormData()
        formData.append('file', file)

        try {
            const { uploadAvatar } = await import('@/lib/actions/files')
            const result = await uploadAvatar(formData)
            if (result.success) {
                const objectUrl = URL.createObjectURL(file)
                setAvatarUrl(objectUrl)
                alert('Avatar zaktualizowany! Odśwież stronę, aby zobaczyć zmiany.')
            }
        } catch (error) {
            console.error(error)
            alert('Błąd podczas wgrywania avatara.')
        } finally {
            setAvatarLoading(false)
        }
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFileToUpload(e.target.files[0])
        }
    }

    const handleProfileUpdate = async () => {
        if (!fileToUpload) {
            alert('Proszę najpierw wybrać plik CV.')
            return
        }

        if (currentCvUrl && currentCvUrl !== 'uploaded') {
            const ok2 = await confirm({
                title: 'Nadpisanie CV',
                description: 'Wgranie nowego CV nadpisze poprzednie. Czy chcesz kontynuować?',
                confirmLabel: 'Nadpisz',
            })
            if (!ok2) return
        }

        setLoading(true)
        const formData = new FormData()
        formData.append('file', fileToUpload)

        try {
            const { uploadCV, generateProfileFromCV } = await import('@/lib/actions/files')

            const result = await uploadCV(formData)

            if (result.success) {
                const manualData = {
                    experience,
                    status,
                    capacity,
                    sentiments,
                    verifier,
                    ambassador,
                    sales,
                    coverLetter
                }
                const genResult = await generateProfileFromCV(manualData)

                if (genResult.success && genResult.data) {
                    if (genResult.data.bio) setBio(genResult.data.bio)
                    if (genResult.data.previous_clients) setClients(genResult.data.previous_clients)

                    alert('Proces zakończony sukcesem! Profil został zaktualizowany.')
                    setCurrentCvUrl('uploaded')
                    setInitialProfile((prev: any) => ({ ...prev, bio: genResult.data.bio, previous_clients: genResult.data.previous_clients }))
                    setFileToUpload(null)
                    setCoverLetter('')
                } else {
                    alert('CV wgrane, ale wystąpił błąd przy generowaniu profilu: ' + (genResult.error || 'Nieznany błąd'))
                }
            } else {
                alert('Błąd uploadu: ' + result.error)
            }
        } catch (err) {
            console.error(err)
            alert('Wystąpił krytyczny błąd.')
        } finally {
            setLoading(false)
        }
    }

    const handleToggleSentiment = (sentiment: string) => {
        if (sentiments.includes(sentiment)) {
            setSentiments(sentiments.filter(s => s !== sentiment))
        } else {
            setSentiments([...sentiments, sentiment])
        }
    }

    const handleAddClient = () => {
        if (clientInput && !clients.includes(clientInput)) {
            setClients([...clients, clientInput])
            setClientInput('')
        }
    }

    const handleRemoveClient = (client: string) => {
        setClients(clients.filter(c => c !== client))
    }

    // Get layout preference
    const { layout } = useLayoutPreferences()

    // Common props for all layouts
    const layoutProps = {
        initialProfile,
        avatarUrl,
        avatarLoading,
        handleAvatarUpload,
        fullName,
        setFullName,
        phone,
        setPhone,
        bio,
        setBio,
        clients,
        clientInput,
        setClientInput,
        handleAddClient,
        handleRemoveClient,
        status,
        setStatus,
        capacity,
        setCapacity,
        sentiments,
        handleToggleSentiment,
        experience,
        setExperience,
        currentCvUrl,
        fileToUpload,
        handleFileSelect,
        coverLetter,
        setCoverLetter,
        handleUploadCV: handleProfileUpdate,
        loading,
        verifier,
        setVerifier,
        ambassador,
        setAmbassador,
        sales,
        setSales,
        availableFrom,
        setAvailableFrom,
        fteStatus,
        setFteStatus,
        maxMonthlyHours,
        setMaxMonthlyHours,
        favorites,
        handleSave: handleSaveProfile,
        isDirty,
        loyaltyPoints,
        loyaltyTier
    }

    return (
        <div className="min-h-screen p-4 md:p-6 lg:p-8">
            {/* Layout Switcher - Always Visible */}
            <div className="mb-8 max-w-2xl mx-auto">
                <LayoutSwitcher />
            </div>

            {/* Dynamic Layout Rendering */}
            {layout === 'grid' && <ProfileGridLayout {...layoutProps} />}
            {layout === 'tabs' && <ProfileTabsLayout {...layoutProps} />}
            {layout === 'feed' && <ProfileFeedLayout {...layoutProps} />}

            <ConfirmUI />
        </div>
    )
}
