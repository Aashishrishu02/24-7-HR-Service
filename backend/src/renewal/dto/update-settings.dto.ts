
import { IsOptional, IsInt, Min, Max, IsString } from 'class-validator';

export class UpdateRenewalSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  renewalWindowDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  gracePeriodDays?: number;

  @IsOptional()
  @IsString()
  preExpiryNotificationDays?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  lowBalanceNotificationHours?: number;

  @IsOptional()
  @IsString()
  suspensionPolicy?: string;

  @IsOptional()
  @IsString()
  terminationPolicy?: string;

  @IsOptional()
  @IsString()
  renewalPricingModel?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  hostHeavenMarkupPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(80)
  hostHeavenProfitMarginPercent?: number;
}
