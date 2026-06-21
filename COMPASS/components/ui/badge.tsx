import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
    "inline-flex items-center rounded-full border font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
    {
        variants: {
            variant: {
                default:
                    "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
                secondary:
                    "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
                destructive:
                    "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
                outline: "border-border text-foreground",
                neutral: "border-transparent bg-muted text-foreground",
                soft: "border-transparent bg-primary/10 text-primary",
                success: "border-success/20 bg-success/10 text-success",
                warning: "border-warning/20 bg-warning/10 text-warning",
                danger: "border-destructive/20 bg-destructive/10 text-destructive",
                info: "border-info/20 bg-info/10 text-info",
            },
            size: {
                sm: "px-1.5 py-0 text-[11px]",
                md: "px-2.5 py-0.5 text-xs",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "md",
        },
    }
)

export interface BadgeProps
    extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> { }

function Badge({ className, variant, size, ...props }: BadgeProps) {
    return (
        <div className={cn(badgeVariants({ variant, size }), className)} {...props} />
    )
}

export { Badge, badgeVariants }
