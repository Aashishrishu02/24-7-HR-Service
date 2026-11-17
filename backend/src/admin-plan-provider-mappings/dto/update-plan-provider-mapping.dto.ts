
import {
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  Min,
} from 'class-validator';

export class UpdatePlanProviderMappingDto {
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
