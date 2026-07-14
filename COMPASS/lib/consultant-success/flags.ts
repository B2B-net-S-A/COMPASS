import 'server-only'

import { parseBooleanEnv } from './scheduling'

export function isConsultantSuccessEnabled(): boolean {
    return parseBooleanEnv(process.env.CONSULTANT_SUCCESS_ENABLED, false)
}
export function areConsultantSuccessAutomationsEnabled(): boolean {
    return isConsultantSuccessEnabled()
        && parseBooleanEnv(process.env.CONSULTANT_SUCCESS_AUTOMATIONS_ENABLED, false)
}

export function areConsultantSuccessSurveysEnabled(): boolean {
    return isConsultantSuccessEnabled()
        && parseBooleanEnv(process.env.CONSULTANT_SUCCESS_SURVEYS_ENABLED, false)
}
