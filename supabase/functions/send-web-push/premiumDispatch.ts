export type EligibleDriver = {
  id: string;
  is_premium?: boolean | null;
};

export const prioritizeEligibleDrivers = <T extends EligibleDriver>(drivers: T[]): T[] => {
  const premiumDrivers = drivers.filter((driver) => driver.is_premium === true);
  return premiumDrivers.length > 0 ? premiumDrivers : drivers;
};
