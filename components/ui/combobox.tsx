"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Search, X, MapPin } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

// Search in registry option component with fake loading
interface SearchInRegistryOptionProps {
  inputValue: string;
  onSelectCustomValue: (value: string) => void;
  isLoading?: boolean;
  notFound?: boolean;
}

function SearchInRegistryOption({ 
  inputValue, 
  onSelectCustomValue, 
  isLoading = false, 
  notFound = false 
}: SearchInRegistryOptionProps) {
  // Use provided loading and notFound states instead of simulating
  return (
    <Button
      variant="outline"
      size="sm"
      className="w-full max-w-xs"
      disabled={isLoading}
      onClick={(e) => {
        e.stopPropagation();
        if (notFound) {
          onSelectCustomValue(inputValue);
        }
      }}
    >
      {isLoading ? (
        <div className="flex items-center">
          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
          <span>Søger efter "{inputValue}" i register...</span>
        </div>
      ) : notFound ? (
        <span>Tilføj "{inputValue}" som flytype</span>
      ) : (
        <span>Søg efter "{inputValue}" i register</span>
      )}
    </Button>
  );
}

// Interface for OGN search results
interface OgnSearchResult {
  flarmID: string;
  model: string;
  registration: string;
  competitionID: string;
}

type ComboboxItem = {
  value: string
  label: string
}

type ComboboxProps = {
  items: ComboboxItem[]
  value: string
  onChange: (value: string) => void
  onTextChange?: (text: string) => void
  placeholder?: string
  emptyText?: string
  initialSearchMode?: boolean
  tallDropdown?: boolean
  searchInOgnDatabase?: boolean | ((inputValue: string) => boolean)
  customButtonText?: string
}

export function Combobox({
  items,
  value,
  onChange,
  onTextChange,
  placeholder = "Vælg en mulighed",
  emptyText = "Ingen resultater fundet.",
  initialSearchMode = false,
  tallDropdown = false,
  searchInOgnDatabase = false,
  customButtonText,
}: ComboboxProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState("")
  const [isSearchMode, setIsSearchMode] = React.useState(initialSearchMode)
  const [isSearchingOgn, setIsSearchingOgn] = React.useState(false)
  const [ognResults, setOgnResults] = React.useState<OgnSearchResult[]>([])
  const [noOgnResults, setNoOgnResults] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const dropdownRef = React.useRef<HTMLDivElement>(null)
  const debounceTimerRef = React.useRef<NodeJS.Timeout | null>(null)

  // Find the selected item from the items list or create a placeholder for the value
  const selectedItem = React.useMemo(() => {
    // First try to find the item in the provided items array - including partial matching on MongoDB IDs
    const found = items.find((item) => {
      // Exact match on value
      if (item.value === value) return true;
      
      // For MongoDB-style IDs, check if the item's value contains the last part of the selected value
      // This helps with items that were added to the options array after selection
      if (value && value.length > 20 && item.value.length > 20) {
        return item.value.endsWith(value.slice(-8)) || value.endsWith(item.value.slice(-8));
      }
      
      return false;
    });
    
    if (found) return found;
    
    // If we have a value but no matching item, it might be a manually entered name
    if (value) {
      // Check if this is an OGN aircraft (value starts with ogn_)
      if (value.startsWith('ogn_')) {
        const registration = value.replace('ogn_', '');
        // Try to find it in the OGN results
        const ognMatch = ognResults.find(
          result => (result.registration && result.registration.toUpperCase() === registration.toUpperCase()) || 
                    (result.flarmID && result.flarmID === registration)
        );
        
        if (ognMatch) {
          // Format the label based on available data
          let label = '';
          if (ognMatch.model && ognMatch.registration) {
            label = `${ognMatch.model} ${ognMatch.registration}`;
            if (ognMatch.competitionID) {
              label += ` (${ognMatch.competitionID})`;
            }
          } else if (ognMatch.registration) {
            label = ognMatch.registration;
          } else if (ognMatch.model) {
            label = ognMatch.model;
          } else {
            label = registration;
          }
          return { value, label };
        }
        
        // If not found in OGN results, just display the registration
        return { value, label: registration };
      }
      
      // Try to extract a label from the value if it's a MongoDB ID (not likely to be displayed as is)
      if (value.length > 20) {
        return { value, label: inputValue || "Selected item" }
      }
      
      // For values that look like they could be displayed, use them directly
      return { value, label: value }
    }
    
    return null
  }, [items, value, inputValue, ognResults])

  // Filter items based on search input
  const filteredItems =
    isSearchMode && inputValue
      ? items.filter((item) => item.label.toLowerCase().includes(inputValue.toLowerCase()))
      : items

  // Combine OGN results with local items
  const combinedItems = React.useMemo(() => {
    if (!searchInOgnDatabase || !inputValue || ognResults.length === 0) {
      return filteredItems;
    }
    
    // Create ComboboxItems from OGN results
    const ognItems = ognResults.map(result => {
      // Format the label based on available data
      let label = '';
      
      if (result.registration) {
        if (result.model) {
          label = `${result.model} ${result.registration}`;
        } else {
          label = result.registration;
        }
        
        // Add competition ID if available
        if (result.competitionID) {
          label += ` (${result.competitionID})`;
        }
      } else if (result.model) {
        label = result.model;
        if (result.competitionID) {
          label += ` (${result.competitionID})`;
        }
      } else if (result.flarmID) {
        label = `FLARM: ${result.flarmID}`;
      } else {
        // Fallback if no useful data
        label = "Unknown aircraft";
      }
      
      return {
        value: `ogn_${result.registration || result.flarmID}`,
        label
      };
    });
    
    // Combine but avoid duplicates based on value property
    const existingValues = new Set(filteredItems.map(item => item.value));
    const uniqueOgnItems = ognItems.filter(item => !existingValues.has(item.value));
    
    return [...filteredItems, ...uniqueOgnItems];
  }, [filteredItems, ognResults, inputValue, searchInOgnDatabase]);

  // Determine if we should search the OGN database based on the searchInOgnDatabase prop
  const shouldSearchOgnDatabase = React.useCallback(
    (input: string): boolean => {
      if (typeof searchInOgnDatabase === 'function') {
        return searchInOgnDatabase(input);
      }
      return !!searchInOgnDatabase;
    },
    [searchInOgnDatabase]
  );

  // Debounced search in OGN database
  const searchOgnDatabase = React.useCallback(async (query: string) => {
    if (!shouldSearchOgnDatabase(query) || !query || query.length < 2) {
      setIsSearchingOgn(false);
      setOgnResults([]);
      return;
    }
    
    try {
      setIsSearchingOgn(true);
      setNoOgnResults(false);
      
      const response = await fetch(`/api/tablet/fetch_ogn_database?query=${encodeURIComponent(query)}`);
      const data = await response.json();
      
      if (data.success && data.results) {
        setOgnResults(data.results);
        setNoOgnResults(data.results.length === 0);
      } else {
        setOgnResults([]);
        setNoOgnResults(true);
      }
    } catch (error) {
      console.error('Error searching OGN database:', error);
      setOgnResults([]);
      setNoOgnResults(true);
    } finally {
      setIsSearchingOgn(false);
    }
  }, [shouldSearchOgnDatabase]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value
    setInputValue(text)
    
    if (onTextChange) {
      onTextChange(text)
    }
    
    // Debounce the OGN database search
    if (shouldSearchOgnDatabase(text) && text.length >= 2) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      
      debounceTimerRef.current = setTimeout(() => {
        searchOgnDatabase(text);
      }, 300); // 300ms debounce time
    } else if (text.length < 2) {
      setOgnResults([]);
      setNoOgnResults(false);
    }
  }

  const handleSelectItem = (item: ComboboxItem) => {
    onChange(item.value)
    setInputValue("")
    setIsSearchMode(false)
    setIsOpen(false)
  }

  const toggleSearchMode = () => {
    setIsSearchMode(!isSearchMode)
    if (!isSearchMode) {
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus()
        }
      }, 0)
    } else {
      setInputValue("")
    }
  }

  // Clean up timer on unmount
  React.useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick)
    }

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick)
    }
  }, [isOpen])

  // Adjust dropdown position if needed
  React.useEffect(() => {
    if (isOpen && dropdownRef.current && containerRef.current) {
      const dropdownRect = dropdownRef.current.getBoundingClientRect()
      const viewportHeight = window.innerHeight

      // If dropdown extends beyond viewport, adjust its position
      if (dropdownRect.bottom > viewportHeight) {
        // Set a more appropriate max-height
        dropdownRef.current.style.maxHeight = `${Math.min(200, viewportHeight - dropdownRect.top - 20)}px`
      }
    }
  }, [isOpen])

  // The text to display in the button
  const displayText = selectedItem ? selectedItem.label : (inputValue || placeholder)

  // Handle button click - if initialSearchMode is true, focus input right away
  const handleButtonClick = () => {
    const newOpenState = !isOpen;
    setIsOpen(newOpenState);
    
    // If we're opening the dropdown and initialSearchMode is true, enable search mode
    if (newOpenState && initialSearchMode && !isSearchMode) {
      setIsSearchMode(true);
      // Focus the input after a small delay to ensure it's rendered
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 10);
    }
  };

  // Get all results - filtered local items plus OGN results
  const allResults = combinedItems;
  const hasNoResults = allResults.length === 0;

  return (
    <div className="relative w-full" ref={containerRef}>
      <Button
        variant="outline"
        role="combobox"
        aria-expanded={isOpen}
        className="w-full justify-between h-12 text-base"
        onClick={handleButtonClick}
      >
        {displayText}
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>

      {isOpen && (
        <div ref={dropdownRef} className="absolute z-50 w-full mt-1 bg-white rounded-md border shadow-md">
          {/* Header with search controls */}
          <div className="flex items-center border-b px-3 py-2 bg-background">
            {isSearchMode ? (
              <>
                <Input
                  ref={inputRef}
                  placeholder={`Søg ${placeholder.toLowerCase()}`}
                  className="h-10 text-base flex-1"
                  value={inputValue}
                  onChange={handleInputChange}
                  onClick={(e) => e.stopPropagation()}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 ml-1 flex-shrink-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleSearchMode()
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <span className="text-sm text-muted-foreground flex-1 py-1">{allResults.length} muligheder</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 flex-shrink-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleSearchMode()
                  }}
                >
                  <Search className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>

          {/* Scrollable list of options - height determined by tallDropdown prop */}
          <div className={`overflow-y-scroll ${tallDropdown ? 'h-[275px] max-h-[70vh]' : 'h-48 max-h-[30vh]'}`}>
            {hasNoResults ? (
              <div className="py-6 text-center text-base">
                {emptyText}
                <div className="mt-2 space-y-2">
                  {isSearchMode && inputValue.trim() !== "" && (
                    <>
                      {isSearchingOgn ? (
                        <div className="flex items-center justify-center py-2">
                          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                          <span>Søger efter "{inputValue.trim()}" i register...</span>
                        </div>
                      ) : (
                        <Button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (onTextChange) onTextChange(inputValue.trim())
                            if (onChange) onChange("guest") // Use special value to indicate a guest
                            setIsOpen(false)
                          }}
                          variant="default"
                          size="sm"
                          className="w-full max-w-xs"
                        >
                          {customButtonText 
                            ? customButtonText.replace('{value}', inputValue.trim())
                            : `Tilføj "${inputValue.trim()}" som flytype`
                          }
                        </Button>
                      )}
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          setIsSearchMode(false)
                        }}
                      >
                        Vis alle muligheder
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div>
                {allResults.map((item) => (
                  <div
                    key={item.value}
                    className={cn(
                      "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-3 text-base outline-none hover:bg-accent hover:text-accent-foreground",
                      value === item.value && "bg-accent/50",
                    )}
                    onClick={() => handleSelectItem(item)}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === item.value ? "opacity-100" : "opacity-0")} />
                    {/* Show MapPin for OGN guest planes */}
                    {item.value.toString().startsWith('ogn_') && (
                      <MapPin className="mr-1 h-4 w-4 text-amber-500" />
                    )}
                    {/* Look for competition ID in parentheses at the end of the label and make it bold */}
                    {(() => {
                      // Check if label contains a competition ID in parentheses at the end
                      const match = item.label.match(/^(.*?)(\s\(([A-Z0-9]+)\))$/);
                      if (match) {
                        // Display the base part and the competition ID in bold
                        return (
                          <>
                            {match[1]}
                            <span className="font-bold">{` (${match[3]})`}</span>
                          </>
                        );
                      }
                      // Otherwise just show the regular label
                      return item.label;
                    })()}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

