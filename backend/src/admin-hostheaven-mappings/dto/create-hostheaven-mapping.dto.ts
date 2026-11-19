import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsOptional,
  IsBoolean,
  IsNumber,
  Min,
} from 'class-validator';

export class CreateHostHeavenMappingDto {
  @IsString()
  @IsNotEmpty()
  planId!: string;

  @IsString()
  @IsNotEmpty()
  zoneId!: string;

  @IsOptional()
  @IsString()
  zoneName?: string;

  @IsString()
  @IsNotEmpty()
  zoneIsoId!: string;

  @IsOptional()
  @IsString()
  isoName?: string;

  @IsString()
  @IsIn(['SHARED', 'DEDICATED'])
  planType!: 'SHARED' | 'DEDICATED';

  @IsString()
  @IsNotEmpty()
  cpuPricingId!: string;

  @IsOptional()
  @IsString()
  cpuName?: string;

  @IsString()
  @IsNotEmpty()
  ramPricingId!: string;

  @IsOptional()
  @IsString()
  ramName?: string;

  @IsString()
  @IsNotEmpty()
  diskPricingId!: string;

  @IsOptional()
  @IsString()
  diskName?: string;

  @IsString()
  @IsNotEmpty()
  bandwidthPricingId!: string;

  @IsOptional()
  @IsString()
  bandwidthName?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  providerCost?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  externalConfigId?: string;

  @IsOptional()
  @IsBoolean()
  isCostVerified?: boolean;

  @IsOptional()
  @IsString()
  costStatus?: string;
}
