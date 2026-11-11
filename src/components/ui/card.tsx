import * as React from "react"
import { cn } from "cn"

function Card({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col gap-4 overflow-hidden rounded-xl border border-border bg-card py-4 text-sm text-card-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Card }
