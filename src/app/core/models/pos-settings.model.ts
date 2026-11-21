/** Canonical dot-notated configuration keys */
export const POS_CONFIG_KEYS = {
  REMAINING_AMOUNT_THRESHOLD: 'cashier.payment.remaining_amount_threshold',
  ENABLE_REMAINING_AMOUNT_THRESHOLD: 'cashier.payment.enable_remaining_amount_threshold',
} as const;

/** System fallback defaults when neither server nor cache is reachable */
export const DEFAULT_CONFIG_VALUES: Record<string, string> = {
  [POS_CONFIG_KEYS.REMAINING_AMOUNT_THRESHOLD]: '50.00',
  [POS_CONFIG_KEYS.ENABLE_REMAINING_AMOUNT_THRESHOLD]: 'true',
};

export interface PosSettingItem {
  configKey: string;
  configValue: string;
  dataType: 'STRING' | 'DECIMAL' | 'BOOLEAN' | 'INTEGER' | 'JSON';
  description?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface PosSettingsResponse {
  scopeType: string;
  scopeId: string;
  settings: Record<string, string>;
  details?: Record<string, PosSettingItem>;
}

export interface UpdatePosSettingsBatchRequest {
  scopeType?: string;
  scopeId?: string;
  settings: Record<string, string>;
}
