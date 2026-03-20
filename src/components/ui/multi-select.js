import * as React from "react"
import { cn } from "./utils"
import { Check, ChevronDown, X, Search } from "lucide-react"
import { Badge } from "./badge"
import { Button } from "./button"

const MultiSelect = React.forwardRef(
  ({ options, value, onChange, placeholder = "Wählen...", className, ...props }, ref) => {
    const [open, setOpen] = React.useState(false)
    const [searchTerm, setSearchTerm] = React.useState("")
    const containerRef = React.useRef(null)

    React.useEffect(() => {
      if (!open) setSearchTerm("")
    }, [open])

    React.useEffect(() => {
      const handleClickOutside = (event) => {
        if (containerRef.current && !containerRef.current.contains(event.target)) {
          setOpen(false)
        }
      }
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    const filteredOptions = options.filter((option) =>
      option.label.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const handleUnselect = (itemValue) => {
      onChange(value.filter((i) => i !== itemValue))
    }

    const toggleOption = (itemValue) => {
      if (value.includes(itemValue)) {
        handleUnselect(itemValue)
      } else {
        onChange([...value, itemValue])
      }
    }

    return (
      <div ref={containerRef} className={cn("relative", className)}>
        <div
          className={cn(
            "flex min-h-[36px] w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          onClick={() => setOpen(!open)}
        >
          <div className="flex flex-wrap gap-1">
            {value.length > 0 ? (
              value.map((v) => {
                const option = options.find((o) => o.value === v)
                return (
                  <Badge
                    key={v}
                    variant="secondary"
                    className="flex items-center gap-1 rounded-sm px-1 font-normal bg-zinc-100 text-zinc-900 border-zinc-200"
                  >
                    {option ? option.label : v}
                    <button
                      className="ml-1 rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleUnselect(v)
                        }
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleUnselect(v)
                      }}
                    >
                      <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                    </button>
                  </Badge>
                )
              })
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </div>
          <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
        </div>
        {open && (
          <div className="absolute z-50 mt-1 max-h-60 w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 bg-white">
            <div className="p-2 border-b flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                autoFocus
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Suchen..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <div className="overflow-auto max-h-[calc(60vh-40px)] p-1 space-y-1">
              {filteredOptions.length === 0 && (
                <div className="py-2 text-center text-sm text-muted-foreground">Keine Optionen</div>
              )}
              {filteredOptions.map((option) => (
                <div
                  key={option.value}
                  className={cn(
                    "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-zinc-100 hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                    value.includes(option.value) && "bg-zinc-50"
                  )}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleOption(option.value)
                  }}
                >
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    {value.includes(option.value) && (
                      <Check className="h-4 w-4" />
                    )}
                  </span>
                  <span>{option.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }
)

MultiSelect.displayName = "MultiSelect"

export { MultiSelect }
