import { shouldBlockContentForSidebar } from '../rootLayout';

describe('shouldBlockContentForSidebar', () => {
  it('keeps embedded previews interactive even when their narrow viewport looks mobile', () => {
    expect(
      shouldBlockContentForSidebar({
        isEmbedded: true,
        isSmallScreen: true,
        sidebarExpanded: true,
      }),
    ).toBe(false);
  });

  it('blocks the main page only while the mobile sidebar is open', () => {
    expect(
      shouldBlockContentForSidebar({
        isEmbedded: false,
        isSmallScreen: true,
        sidebarExpanded: true,
      }),
    ).toBe(true);
    expect(
      shouldBlockContentForSidebar({
        isEmbedded: false,
        isSmallScreen: true,
        sidebarExpanded: false,
      }),
    ).toBe(false);
    expect(
      shouldBlockContentForSidebar({
        isEmbedded: false,
        isSmallScreen: false,
        sidebarExpanded: true,
      }),
    ).toBe(false);
  });
});
