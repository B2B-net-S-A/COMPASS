import { describe, expect, it } from 'vitest'
import { academyManagedTeamsConfiguration } from '../db-worker'

const id = '00000000-0000-4000-8000-000000000001'

describe('ACADEMY_TEAMS_ENABLED', () => {
    it.each([undefined, '', 'false', 'TRUE', '1'])('keeps the managed track off for %s, whatever credentials exist', value => {
        const config = academyManagedTeamsConfiguration({ ACADEMY_TEAMS_ENABLED: value, AZURE_TENANT_ID: id, AZURE_CLIENT_ID: id, AZURE_CLIENT_SECRET: 'x' } as unknown as NodeJS.ProcessEnv)
        expect(config.managedTeamsAvailable).toBe(false)
        expect(config.reason).toContain('linku')
    })
    it('still needs complete credentials once the switch is on', () => {
        expect(academyManagedTeamsConfiguration({ ACADEMY_TEAMS_ENABLED: 'true' } as unknown as NodeJS.ProcessEnv).managedTeamsAvailable).toBe(false)
        expect(academyManagedTeamsConfiguration({ ACADEMY_TEAMS_ENABLED: 'true', AZURE_TENANT_ID: 'nie-uuid', AZURE_CLIENT_ID: id, AZURE_CLIENT_SECRET: 'x' } as unknown as NodeJS.ProcessEnv).managedTeamsAvailable).toBe(false)
    })
})
