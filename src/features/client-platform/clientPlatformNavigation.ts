const clientRootPath = '/';

export const resolveCityPickerReturnTo = (returnTo: string | null | undefined) => {
  if (!returnTo?.startsWith('/') || returnTo.startsWith('//') || returnTo.startsWith('/city')) {
    return clientRootPath;
  }

  return returnTo;
};

export const buildCityPickerPath = (returnTo: string) => {
  const safeReturnTo = resolveCityPickerReturnTo(returnTo);
  return safeReturnTo === clientRootPath
    ? '/city'
    : `/city?returnTo=${encodeURIComponent(safeReturnTo)}`;
};
