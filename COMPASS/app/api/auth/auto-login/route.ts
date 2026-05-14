import { NextResponse } from 'next/server'

// SECURITY: Auto-login endpoint disabled. It contained hardcoded credentials
// (email + password) which is a critical security risk in production.
// Users must authenticate via /login.

export async function GET() {
    return NextResponse.json(
        {
            error: 'This endpoint has been disabled for security reasons.',
            hint: 'Please log in via /login.',
        },
        { status: 403 }
    )
}
