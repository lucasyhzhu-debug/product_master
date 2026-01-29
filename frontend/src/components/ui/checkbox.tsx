import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

const Checkbox = React.forwardRef<
    HTMLInputElement,
    React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
    <div className="relative inline-flex items-center">
        <input
            type="checkbox"
            className="peer h-4 w-4 shrink-0 opacity-0 absolute inset-0 cursor-pointer"
            ref={ref}
            {...props}
        />
        <div className={cn(
            "flex h-4 w-4 items-center justify-center rounded-sm border border-primary ring-offset-background",
            "peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
            "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
            "peer-checked:bg-primary peer-checked:text-primary-foreground",
            className
        )}>
            <Check className="h-3 w-3 hidden peer-checked:block" strokeWidth={3} />
        </div>
    </div>
))
Checkbox.displayName = "Checkbox"

export { Checkbox }
