
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class CreateInventoryDto {
  @IsUUID()
  providerId!: string;

  @IsString()
  @MinLength(1)
  providerVpsId!: string;

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  hostname?: string;

  @IsInt()
  @Min(1)
  cpuCores!: number;

  @IsInt()
  @Min(1)
  ramGb!: number;

  @IsInt()
  @Min(1)
  storageGb!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  bandwidthGb?: number;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  operatingSystem?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  providerCost!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  // Plain text input; service encrypts before database storage.
  @IsOptional()
  @IsString()
  accessDetails?: string;
}
