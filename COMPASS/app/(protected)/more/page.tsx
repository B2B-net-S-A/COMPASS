import { redirect } from 'next/navigation'

// /more is a legacy alias — canonical route is /settings (Phase 0 IA refactor).
export default function MorePage() {
    redirect('/settings')
}
