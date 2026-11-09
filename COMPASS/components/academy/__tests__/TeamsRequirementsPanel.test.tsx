import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ACADEMY_TEAMS_GRAPH_ROLES, TeamsRequirementsPanel } from '../sessions/TeamsRequirementsPanel'

afterEach(cleanup)

describe('TeamsRequirementsPanel', () => {
    it('says the track is off and that this page grants nothing', () => {
        render(<TeamsRequirementsPanel enabled={false} />)
        expect(screen.getByText(/wyłączony przełącznikiem/)).toBeInTheDocument()
        expect(screen.getByText(/ta strona ich nie zmienia/)).toBeInTheDocument()
        expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })
    it('lists only roles documented in the Graph readiness note', () => {
        const note = readFileSync(resolve(__dirname, '../../../../docs/academy/graph-readiness.md'), 'utf8')
        render(<TeamsRequirementsPanel enabled />)
        for (const { role } of ACADEMY_TEAMS_GRAPH_ROLES) {
            expect(screen.getByText(role)).toBeInTheDocument()
            expect(note).toContain(role)
        }
        expect(ACADEMY_TEAMS_GRAPH_ROLES.map(item => item.role)).not.toContain('OnlineMeetings.ReadWrite.All')
    })
})
