import { createClient } from "@/lib/supabase/server";
import { syncRole } from "@/lib/auth/sync-role";
import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";

const ALLOWED_DOMAIN = "@b2bnetwork.pl";

// Coolify forwards traffic to the container on 0.0.0.0:10000, so request.url
// has an internal origin. Use the configured public site URL for redirects so
// the browser stays on the public hostname. Fall back to the request origin
// only for local dev where this env var isn't set.
function publicOrigin(request: Request): string {
    const fromEnv = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
    if (fromEnv) return fromEnv.replace(/\/+$/, '');
    return new URL(request.url).origin;
}

export async function GET(request: Request) {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get("code");
    const origin = publicOrigin(request);
    const next = requestUrl.searchParams.get("next") || "/home";

    if (code) {
        const supabase = createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
            logger.error({ event: 'auth.callback.code_exchange_failed', error });
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

        // Run the same role-sync pipeline as email+password login so SSO users
        // also pick up admin privileges from SUPER_ADMIN_EMAILS / admin_access_list.
        if (user?.email) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();
            const currentRole = profile?.role ?? 'consultant';
            try {
                await syncRole(supabase, user.id, user.email, currentRole);
            } catch (e) {
                logger.error({ event: 'auth.callback.sync_role_failed', error: e, userId: user.id });
            }
        }
    }

    return NextResponse.redirect(`${origin}${next}`);
}
