export function shouldBlockContentForSidebar({
  isEmbedded,
  isSmallScreen,
  sidebarExpanded,
}: {
  isEmbedded: boolean;
  isSmallScreen: boolean;
  sidebarExpanded: boolean;
}): boolean {
  return !isEmbedded && isSmallScreen && sidebarExpanded;
}
