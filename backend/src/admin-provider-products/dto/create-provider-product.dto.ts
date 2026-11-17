import {
  IsArray,
  ArrayNotEmpty,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

enum ProductType {
  VPS_HOSTING = 'VPS_HOSTING',
  LINUX_IP_VPS = 'LINUX_IP_VPS',
}

export class CreateProviderProductDto {
  @IsUUID()
  providerId!: string;

  @IsString()
  @MinLength(1)
  externalProductId!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsEnum(ProductType)
  productType!: ProductType;

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

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  supportedOS!: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}