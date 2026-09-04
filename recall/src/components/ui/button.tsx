import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/*
 * The tokens& .btn: serif label, full pill, 1px rule, inverts on hover.
 * .btn--primary is the filled variant; everything else is the outline.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-pill font-serif transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-foreground bg-primary text-primary-foreground hover:opacity-85",
        destructive:
          "border border-destructive bg-destructive text-destructive-foreground hover:opacity-85",
        outline:
          "border border-foreground bg-transparent text-foreground hover:bg-foreground hover:text-primary-foreground",
        secondary:
          "border border-foreground bg-secondary text-secondary-foreground hover:bg-foreground hover:text-primary-foreground",
        ghost:
          "border border-transparent font-mono hover:border-foreground/20 hover:bg-foreground/5",
        link: "font-mono text-foreground underline underline-offset-4 hover:opacity-60",
      },
      size: {
        default: "px-8 py-3 text-base leading-6",
        sm: "px-5 py-2 text-sm leading-5",
        lg: "px-10 py-3.5 text-lg",
        icon: "h-9 w-9 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
