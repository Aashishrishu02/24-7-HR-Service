
import {
  IsArray,
  ArrayNotEmpty,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

enum ProductType {
  VPS_HOSTING = 'VPS_HOSTING',
  LINUX_IP_VPS = 'LINUX_IP_VPS',
}

export class UpdateProviderProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  externalProductId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsEnum(ProductType)
  productType?: ProductType;

  @IsOptional()
  @IsInt()
  @Min(1)
  cpuCores?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  ramGb?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  storageGb?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  bandwidthGb?: number;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  supportedOS?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
