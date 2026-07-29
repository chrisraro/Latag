/**
 * Stub type declarations for react-native-purchases.
 * The actual module is a native module that may not be available in all
 * environments (CI, web builds). These declarations satisfy TypeScript
 * while the module is dynamically imported at runtime.
 */

declare module "react-native-purchases" {
  export interface CustomerInfo {
    entitlements: {
      active: Record<string, {
        expirationDate?: string | null;
        willRenew?: boolean;
        periodType?: "TRIAL" | "NORMAL";
      }>;
    };
  }

  export interface PurchasesOfferings {
    current: {
      availablePackages: Array<{
        product: {
          identifier: string;
          title: string;
          price: number;
          priceString: string;
          currencyCode: string;
          introPrice?: {
            price: number;
            priceString: string;
            subscriptionPeriod: string;
            periodUnit: string;
          } | null;
        };
      }>;
    } | null;
  }

  export interface PurchasesStoreProduct {
    identifier: string;
    title: string;
    price: number;
    priceString: string;
    currencyCode: string;
    introPrice?: {
      price: number;
      priceString: string;
      subscriptionPeriod: string;
      periodUnit: string;
    } | null;
  }

  const Purchases: {
    configure(config: { apiKey: string }): void;
    logIn(appUserId: string): Promise<void>;
    logOut(): Promise<void>;
    getCustomerInfo(): Promise<{ customerInfo: CustomerInfo }>;
    getOfferings(): Promise<PurchasesOfferings>;
    purchaseProduct(identifier: string): Promise<{ customerInfo: CustomerInfo }>;
    restorePurchases(): Promise<{ customerInfo: CustomerInfo }>;
    addCustomerInfoUpdateListener(callback: (info: CustomerInfo) => void): void;
  };

  export default Purchases;
}
