export const breakpoints = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
} as const;

export const layout = {
  drawer: {
    widthDesktop: 220,
    widthTablet: 256,
    widthCollapsed: 68,
  },
  sidebar: {
    widthFixed: 360, // StoryViewer right column
    widthTablet: 300,
  },
  content: {
    maxWidthReading: undefined, // No limit - full width
  },
};
