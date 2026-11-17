
import {
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreatePlanProviderMappingDto {
  @IsUUID()
  planId!: string;

  @IsUUID()
  providerId!: string;

  @IsUUID()
  providerProductId!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  autoPurchaseEnabled?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxAllowedCost?: number;

  @IsOptional()
  @IsObject()
  regionMapping?: Record<string, string>;

  @IsOptional()
  @IsObject()
  osMapping?: Record<string, string>;
}
