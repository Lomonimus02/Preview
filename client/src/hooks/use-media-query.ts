import { useState, useEffect } from "react";

// Define breakpoint values (can be adjusted as needed)
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
};

export type Breakpoint = keyof typeof BREAKPOINTS;

/**
 * Custom hook that returns true if the current viewport width satisfies the query
 * @param query - A media query string like "(min-width: 768px)" or a shorthand like "md" which uses predefined breakpoints
 * @returns Boolean indicating if the query matches
 */
export function useMediaQuery(query: string): boolean {
  // Convert shorthand queries like "md" to full media queries
  const fullQuery = getFullQuery(query);
  
  // State to track if the media query matches
  const [matches, setMatches] = useState<boolean>(() => {
    // Default to false during SSR
    if (typeof window === "undefined") return false;
    
    // Initialize with the current match state
    return window.matchMedia(fullQuery).matches;
  });

  useEffect(() => {
    // Bail early if no window (SSR)
    if (typeof window === "undefined") return;
    
    // Create media query list
    const mediaQueryList = window.matchMedia(fullQuery);
    
    // Update state when matches change
    const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
    
    // Modern browsers
    mediaQueryList.addEventListener("change", listener);
    
    // Update in case the query changed
    setMatches(mediaQueryList.matches);
    
    // Cleanup
    return () => {
      mediaQueryList.removeEventListener("change", listener);
    };
  }, [fullQuery]);

  return matches;
}

/**
 * Helper function to convert shorthand queries to full media queries
 */
function getFullQuery(query: string): string {
  // If it's a predefined breakpoint shorthand
  if (query in BREAKPOINTS) {
    const breakpoint = query as Breakpoint;
    return `(min-width: ${BREAKPOINTS[breakpoint]}px)`;
  }
  
  // If it's a shorthand without parentheses but with min/max-width
  if (query.includes("min-width:") || query.includes("max-width:") && !query.includes("(")) {
    return `(${query})`;
  }
  
  // Return as-is if it's already a full query or not recognized
  return query;
}

/**
 * Helper hook for responsive design based on common breakpoints
 * Returns an object with boolean flags for each breakpoint
 */
export function useBreakpoints() {
  const sm = useMediaQuery("sm");
  const md = useMediaQuery("md"); 
  const lg = useMediaQuery("lg");
  const xl = useMediaQuery("xl");
  const xxl = useMediaQuery("2xl");

  return {
    isMobile: !sm, // smaller than sm
    isTablet: sm && !lg, // sm to lg
    isDesktop: lg, // lg and above
    isSmall: sm,
    isMedium: md,
    isLarge: lg,
    isXL: xl,
    isXXL: xxl,
  };
}