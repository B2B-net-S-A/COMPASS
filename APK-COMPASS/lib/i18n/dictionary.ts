export type Locale = 'pl' | 'en'

export const dictionary = {
    pl: {
        // Generic
        dashboard: 'Dashboard',
        projects: 'Projekty',
        profile: 'Profil',
        documents: 'Dokumenty',
        more: 'Więcej',
        consultants: 'Konsultanci',
        referrals: 'Rekomendacje',
        reports: 'Raporty',
        settings: 'Ustawienia',
        logout: 'Wyloguj się',
        welcome: 'Witaj',
        panel: 'To jest Twój panel główny w aplikacji APK ComPass.',
        notifications: 'Powiadomienia',
        favorites: 'Ulubione projekty',
        no_favorites: 'Nie masz jeszcze ulubionych projektów.',

        // Sidebar group headings
        group_main: 'Główne',
        group_growth: 'Rozwój',
        group_community: 'Społeczność',
        group_internal: 'Strefa wewnętrzna',
        group_internal_admin: 'Administracja HR',
        group_admin: 'Administracja',
        group_account: 'Konto',

        // Navigation — consultant panels (Phase 0+)
        nav_home: 'Pulpit',
        nav_learning: 'Learning Center',
        nav_league: 'Dynaminds League',
        nav_support: 'Support',
        nav_news: 'Aktualności',
        nav_incubator: 'Inkubator',
        nav_profile: 'Profil',
        nav_settings: 'Moje preferencje',
        nav_notifications: 'Powiadomienia',

        // Navigation — admin
        nav_admin_learning: 'Moderacja kursów',
        nav_admin_league: 'Konfiguracja League',
        nav_admin_support: 'Kolejka ticketów',
        nav_admin_inbox: 'Obsługa zgłoszeń',
        nav_admin_news: 'Composer News',
        nav_admin_incubator: 'Pitche / Projekty',
        nav_admin_users: 'Użytkownicy',
        nav_admin_settings: 'Ustawienia platformy',

        // Navigation — internal employee zone (Phase 12: collapsed to single hub link)
        nav_internal_hub: 'HR (obecność / urlopy / timesheet)',
        nav_internal_admin_hub: 'Administracja HR',
        // Phase 11 sub-page labels (kept for back-compat with old translations + tab labels)
        nav_internal_attendance: 'Lista obecności',
        nav_internal_calendar: 'Kalendarz urlopów',
        nav_internal_leave: 'Moje urlopy',
        nav_internal_timesheet: 'Timesheet',
        nav_internal_admin_leave: 'Wnioski urlopowe',
        nav_internal_admin_timesheets: 'Timesheety',
        nav_internal_admin_employees: 'Pracownicy wewnętrzni',

        // Mobile bottom-nav (short labels, ≤8 chars)
        mobile_home: 'Pulpit',
        mobile_learning: 'Nauka',
        mobile_league: 'League',
        mobile_news: 'Aktualności',
        mobile_more: 'Więcej',

        // Panel landing taglines
        learning_tagline: 'Rozwijaj się przez kursy firmowe i konsultanckie',
        league_tagline: 'Twoje punkty, poziomy i ranking',
        support_tagline: 'Tickety, baza wiedzy i pomoc AI',
        news_tagline: 'Najnowsze ogłoszenia i komunikaty',
        incubator_tagline: 'Twoje pomysły i nasze produkty wewnętrzne',

        // Common buttons / states
        coming_soon: 'Wkrótce dostępne',
        coming_soon_desc: 'Pracujemy nad tym modułem. Wróć tu wkrótce.',
        save: 'Zapisz',
        cancel: 'Anuluj',
        edit: 'Edytuj',
        delete: 'Usuń',
        view: 'Zobacz',
        loading: 'Ładowanie…',
        error_generic: 'Wystąpił błąd. Spróbuj ponownie.',
        empty_state: 'Brak danych',
    },
    en: {
        // Generic
        dashboard: 'Dashboard',
        projects: 'Projects',
        profile: 'Profile',
        documents: 'Documents',
        more: 'More',
        consultants: 'Consultants',
        referrals: 'Referrals',
        reports: 'Reports',
        settings: 'Settings',
        logout: 'Log out',
        welcome: 'Welcome',
        panel: 'This is your main dashboard in APK ComPass application.',
        notifications: 'Notifications',
        favorites: 'Favorite projects',
        no_favorites: 'You have no favorite projects yet.',

        // Sidebar group headings
        group_main: 'Main',
        group_growth: 'Growth',
        group_community: 'Community',
        group_internal: 'Internal',
        group_internal_admin: 'HR Admin',
        group_admin: 'Administration',
        group_account: 'Account',

        // Navigation — consultant panels
        nav_home: 'Home',
        nav_learning: 'Learning Center',
        nav_league: 'Dynaminds League',
        nav_support: 'Support',
        nav_news: 'News',
        nav_incubator: 'Incubator',
        nav_profile: 'Profile',
        nav_settings: 'My preferences',
        nav_notifications: 'Notifications',

        // Navigation — admin
        nav_admin_learning: 'Course moderation',
        nav_admin_league: 'League config',
        nav_admin_support: 'Ticket queue',
        nav_admin_inbox: 'Inbox handling',
        nav_admin_news: 'News composer',
        nav_admin_incubator: 'Pitches / Projects',
        nav_admin_users: 'Users',
        nav_admin_settings: 'Platform settings',

        // Navigation — internal employee zone (Phase 12: collapsed to single hub link)
        nav_internal_hub: 'HR (attendance / leave / timesheet)',
        nav_internal_admin_hub: 'HR administration',
        // Phase 11 sub-page labels (kept for back-compat with old translations + tab labels)
        nav_internal_attendance: 'Attendance',
        nav_internal_calendar: 'Vacation calendar',
        nav_internal_leave: 'My leave',
        nav_internal_timesheet: 'Timesheet',
        nav_internal_admin_leave: 'Leave requests',
        nav_internal_admin_timesheets: 'Timesheets',
        nav_internal_admin_employees: 'Internal employees',

        // Mobile bottom-nav
        mobile_home: 'Home',
        mobile_learning: 'Learn',
        mobile_league: 'League',
        mobile_news: 'News',
        mobile_more: 'More',

        // Panel landing taglines
        learning_tagline: 'Grow through company and peer-authored courses',
        league_tagline: 'Your points, levels and rankings',
        support_tagline: 'Tickets, knowledge base and AI help',
        news_tagline: 'Latest announcements and updates',
        incubator_tagline: 'Your ideas and our internal products',

        // Common buttons / states
        coming_soon: 'Coming soon',
        coming_soon_desc: "We're working on this module. Check back soon.",
        save: 'Save',
        cancel: 'Cancel',
        edit: 'Edit',
        delete: 'Delete',
        view: 'View',
        loading: 'Loading…',
        error_generic: 'An error occurred. Please try again.',
        empty_state: 'No data',
    }
}
