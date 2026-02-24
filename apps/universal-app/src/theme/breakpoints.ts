export const breakpoints = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
} as const;

export const layout = {
  drawer: {
    widthDesktop: 240,
    widthTablet: 280,
    widthCollapsed: 73,
  },
  sidebar: {
    widthFixed: 360, // StoryViewer right column
    widthTablet: 300,
  },
  content: {
    maxWidthReading: undefined, // No limit - full width
  },
};
