export type EligibleDriver = {
  id: string;
  is_premium?: boolean | null;
};

export type DriverPushSubscription = {
  driver_id?: string | null;
};

export const prioritizeEligibleDrivers = <T extends EligibleDriver>(drivers: T[]): T[] => {
  const premiumDrivers = drivers.filter((driver) => driver.is_premium === true);
  return premiumDrivers.length > 0 ? premiumDrivers : drivers;
};

export const selectPriorityDriverSubscriptions = <
  TDriver extends EligibleDriver,
  TSubscription extends DriverPushSubscription
>(drivers: TDriver[], subscriptions: TSubscription[]): TSubscription[] => {
  const subscribedDriverIds = new Set(
    subscriptions.map((subscription) => subscription.driver_id)
  );
  const subscribedDrivers = drivers.filter((driver) => subscribedDriverIds.has(driver.id));
  const priorityDriverIds = new Set(prioritizeEligibleDrivers(subscribedDrivers).map((driver) => driver.id));
  return subscriptions.filter((subscription) =>
    Boolean(subscription.driver_id && priorityDriverIds.has(subscription.driver_id))
  );
};
