/**
 * Centralny moduł toast dla ComPass
 * ===================================
 * AUTOMATYCZNIE zastępuje toast.success() animowanym checkmarkiem.
 *
 * Zamiast:  import { toast } from 'sonner'
 * Używaj:   import { toast } from '@/lib/toast'
 *
 * Wszystkie metody (error, warning, info, loading, promise, custom, dismiss)
 * działają identycznie jak w sonner. Jedynie `success` ma animowany SVG checkmark.
 *
 * Dlaczego to działa automatycznie:
 * - Nowe komponenty importujące z '@/lib/toast' od razu mają animację
 * - Stare komponenty z 'sonner' + toastSuccess() też działają (backward compatible)
 * - Zero konfiguracji, zero dodatkowych importów
 */

import { toast as sonnerToast, type ExternalToast } from 'sonner'
import { AnimatedCheckmark } from '@/components/ui/success-animation'

// Zachowaj referencję do oryginalnego success PRZED nadpisaniem
const originalSuccess = sonnerToast.success.bind(sonnerToast)

// Enhanced success z animowanym checkmarkiem
function enhancedSuccess(message: string | React.ReactNode, options?: ExternalToast) {
    return originalSuccess(message, {
        icon: <AnimatedCheckmark size={20} color="#22c55e" />,
        duration: 4000,
        ...options,
    })
}

// Re-export toast z nadpisanym success (bez mutowania oryginału)
export const toast = Object.assign(
    // Base toast function (for custom toasts)
    (...args: Parameters<typeof sonnerToast>) => sonnerToast(...args),
    {
        // Override success with animated version
        success: enhancedSuccess,
        // Pass through all other methods unchanged
        error: sonnerToast.error,
        warning: sonnerToast.warning,
        info: sonnerToast.info,
        loading: sonnerToast.loading,
        promise: sonnerToast.promise,
        custom: sonnerToast.custom,
        dismiss: sonnerToast.dismiss,
        message: sonnerToast.message,
    }
)

// Re-export toastSuccess for backward compatibility
export { enhancedSuccess as toastSuccess }
