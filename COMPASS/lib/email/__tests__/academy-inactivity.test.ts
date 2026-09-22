import { expect, it, vi } from 'vitest'
import { sendCourseInactivityReminder } from '@/lib/email'
import { sendEmail } from '@/lib/email/sender'
vi.mock('@/lib/email/sender', () => ({ sendEmail: vi.fn() }))

it('embeds a pinned enrollment URL and escapes titles without implying lessons alone complete the course', async () => {
    vi.mocked(sendEmail).mockResolvedValue({ success: true })
    await sendCourseInactivityReminder('user@example.test', 'Żaneta <test>', { courseTitle: 'Kurs <script>', courseSlug: 'kurs', enrollmentId: '00000000-0000-4000-8000-000000000001', progressPercent: 99, completedLessons: 2, totalLessons: 2, lastAccessDaysAgo: 4, appUrl: 'https://compass.test/' })
    const html = vi.mocked(sendEmail).mock.calls[0][0].html
    expect(html).toContain('https://compass.test/learning/kurs/lekcja/first?enrollment=00000000-0000-4000-8000-000000000001')
    expect(html).toContain('Kurs &lt;script&gt;')
    expect(html).toContain('Żaneta &lt;test&gt;')
    expect(html).toContain('Sprawdź pozostałe warunki ukończenia szkolenia')
})
