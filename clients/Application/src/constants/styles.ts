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
  },

  // Card styles
  modernCard: {
    maxWidth: 800,
    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
    borderRadius: 3,
    border: '1px solid rgba(0,0,0,0.06)'
  },

  smallCard: {
    maxWidth: 600
  }
} as const;

// Input field styles
export const INPUT_STYLES = {
  outlined: {
    '& .MuiOutlinedInput-root': {
      borderRadius: 2,
      backgroundColor: 'rgba(0,0,0,0.02)',
      '&:hover': {
        backgroundColor: 'rgba(0,0,0,0.04)',
      },
      '&.Mui-focused': {
        backgroundColor: 'white',
        boxShadow: '0 0 0 3px rgba(25, 118, 210, 0.1)',
      }
    }
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