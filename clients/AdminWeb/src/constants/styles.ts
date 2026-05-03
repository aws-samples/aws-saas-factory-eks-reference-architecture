// Common style constants to reduce repetition
export const COMMON_STYLES = {
  // Layout
  centerFlex: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center'
  },
  
  flexEnd: {
    justifyContent: 'flex-end',
    gap: 1,
    p: 2
  },

  // Spacing
  marginBottom2: { mb: 2 },
  marginBottom3: { mb: 3 },
  marginBottom4: { mb: 4 },

  // Loading container
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '200px'
  }
} as const;

// Color constants
export const COLORS = {
  shadow: 'rgba(0,0,0,0.08)',
  border: 'rgba(0,0,0,0.06)',
  inputBg: 'rgba(0,0,0,0.02)',
  inputHover: 'rgba(0,0,0,0.04)',
  focusShadow: 'rgba(25, 118, 210, 0.1)'
} as const;