import {
  IsString,
  IsIn,
  IsOptional,
  IsBoolean,
  IsNumber,
  Min,
} from 'class-validator';

export class UpdateHostHeavenMappingDto {
  @IsOptional()
  @IsString()
  zoneId?: string;

  @IsOptional()
  @IsString()
  zoneName?: string;

  @IsOptional()
  @IsString()
  zoneIsoId?: string;

  @IsOptional()
  @IsString()
  isoName?: string;

  @IsOptional()
  @IsString()
  @IsIn(['SHARED', 'DEDICATED'])
  planType?: 'SHARED' | 'DEDICATED';

  @IsOptional()
  @IsString()
  cpuPricingId?: string;

  @IsOptional()
  @IsString()
  cpuName?: string;

  @IsOptional()
  @IsString()
  ramPricingId?: string;

  @IsOptional()
  @IsString()
  ramName?: string;

  @IsOptional()
  @IsString()
  diskPricingId?: string;

  @IsOptional()
  @IsString()
  diskName?: string;

  @IsOptional()
  @IsString()
  bandwidthPricingId?: string;

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
}
