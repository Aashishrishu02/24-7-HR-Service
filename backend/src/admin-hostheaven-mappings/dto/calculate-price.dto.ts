import {
  IsString,
  IsIn,
  IsOptional,
  IsNumber,
  Min,
} from 'class-validator';

export class CalculateHostHeavenPriceDto {
  @IsString()
  @IsIn(['SHARED', 'DEDICATED'])
  planType!: 'SHARED' | 'DEDICATED';

  @IsOptional()
  @IsString()
  planId?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  durationDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cpuPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  ramPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  diskPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  bandwidthPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  providerCost?: number;
}
