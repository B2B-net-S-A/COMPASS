import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const ALLOWED_DOMAIN = "@b2bnetwork.pl";

export async function GET(request: Request) {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get("code");
    const origin = requestUrl.origin;
    const next = requestUrl.searchParams.get("next") || "/home";

    if (code) {
        const supabase = createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
            console.error("[AUTH_CALLBACK] code exchange failed:", error.message);
            return NextResponse.redirect(`${origin}/login?error=auth_failed`);
        }

        // Defense-in-depth domain whitelist for SSO providers (Microsoft etc.).
        // The Azure single-tenant app already restricts at Microsoft's side, but
        // we re-check here so guest accounts or future multi-tenant changes can't
        // bypass the @b2bnetwork.pl whitelist.
        const { data: { user } } = await supabase.auth.getUser();
        if (user && !user.email?.toLowerCase().endsWith(ALLOWED_DOMAIN)) {
            await supabase.auth.signOut();
            return NextResponse.redirect(`${origin}/login?error=domain_not_allowed`);
        }
    }

    return NextResponse.redirect(`${origin}${next}`);
}
