export interface HostHeavenZone {
  id: string;
  name: string;
  location?: string;
  country?: string;
  isAvailable?: boolean;
  status?: string;
}

export interface HostHeavenIso {
  id: string;
  isoName: string;
  osType: 'LINUX' | 'WINDOWS' | string;
  version?: string;
  isDefault?: boolean;
}

export interface HostHeavenPricingItem {
  id: string;
  label: string;
  cores?: number;
  ram?: number; // in GB
  disk?: number; // in GB
  bandwidth?: number; // in GB
  price: number;
  currency?: string;
}

export interface HostHeavenCompletePricing {
  shared: {
    cpu: HostHeavenPricingItem[];
    ram: HostHeavenPricingItem[];
    disk: HostHeavenPricingItem[];
    bandwidth: HostHeavenPricingItem[];
  };
  dedicated: {
    cpu: HostHeavenPricingItem[];
    ram: HostHeavenPricingItem[];
    disk: HostHeavenPricingItem[];
    bandwidth: HostHeavenPricingItem[];
  };
}

export interface HostHeavenWallet {
  id: string;
  balance: number;
  currency: string;
  updatedAt?: string;
}

export interface HostHeavenCreateVmDto {
  zoneId: string;
  zoneIsoId: string;
  planType: 'SHARED' | 'DEDICATED';
  cpuPriceId: string;
  ramPriceId: string;
  diskPriceId: string;
  bandwidthPriceId: string;
  months: number;
  quantity?: number;
  useWalletBalance: boolean;
  couponCode?: string;
  gateway?: string;
}

export interface HostHeavenCreateVmResponse {
  status: 'COMPLETED' | 'PENDING' | 'FAILED';
  paymentId?: string;
  orderId: string;
  groupId?: string;
  vms?: Array<{
    id: string;
    vmId: string;
    ipAddress?: string;
    hostname?: string;
    status?: string;
  }>;
  message?: string;
}

export interface HostHeavenVmDetails {
  vmId: string;
  proxmoxVmid?: number;
  vmName: string;
  ipAddress: string;
  serverId?: string;
  zoneId?: string;
  status: string;
  planType?: string;
  cores?: number;
  ram?: number;
  disk?: number;
  bandwidth?: number;
  createdAt?: string;
  expiresAt?: string;
}

export interface HostHeavenLockStatus {
  vmId: string;
  isLocked: boolean;
  status: string;
  message?: string;
}

export interface HostHeavenVmMetrics {
  vmId: string;
  timeframe: string;
  cpu: {
    usagePercent: number;
    history?: Array<{ timestamp: string; value: number }>;
  };
  ram: {
    totalMb: number;
    usedMb: number;
    usagePercent: number;
    history?: Array<{ timestamp: string; value: number }>;
  };
  network: {
    rxBytes: number;
    txBytes: number;
    history?: Array<{ timestamp: string; rx: number; tx: number }>;
  };
  disk: {
    readBytes: number;
    writeBytes: number;
  };
}

export interface HostHeavenDriveStorage {
  mountPoint: string;
  fsType: string;
  totalGb: number;
  usedGb: number;
  freeGb: number;
  usagePercentage: number;
}

export interface HostHeavenStorageInfo {
  vmId: string;
  drives: HostHeavenDriveStorage[];
}

export interface HostHeavenRenewalCalcDto {
  vmId: string;
  monthsToAdd: number;
  cpuPriceId?: string;
  ramPriceId?: string;
  diskPriceId?: string;
  bandwidthPriceId?: string;
  couponCode?: string;
}

export interface HostHeavenRenewalCalcResult {
  originalAmount: number;
  discountAmount: number;
  payableAmount: number;
  couponStatus?: string;
  isSpecChange: boolean;
}

export interface HostHeavenConnectionTestResult {
  success: boolean;
  connected: boolean;
  message: string;
  resellerDomain?: string;
  wallet: {
    id?: string;
    balance: number;
    currency: string;
  };
}
