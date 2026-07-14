export const WEB_BUILD_VERSION_URL = '/build-version.json';
export const WEB_BUILD_CHECK_INTERVAL_MS = 5 * 60 * 1000;

export function shouldReloadForWebBuild(
  loadedBuildId: string | null | undefined,
  latestBuildId: string | null | undefined
): boolean {
  const loaded = loadedBuildId?.trim();
  const latest = latestBuildId?.trim();

  return Boolean(
    loaded &&
      latest &&
      loaded !== '__WT_WEB_BUILD_ID__' &&
      latest !== '__WT_WEB_BUILD_ID__' &&
      loaded !== latest
  );
}
