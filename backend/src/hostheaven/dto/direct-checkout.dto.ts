import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsOptional,
  IsInt,
} from 'class-validator';

export class DirectHostHeavenCheckoutDto {
  @IsString()
  @IsNotEmpty()
  zoneId: string;

  @IsString()
  @IsNotEmpty()
  zoneIsoId: string;

  @IsString()
  @IsIn(['SHARED', 'DEDICATED'])
  planType: 'SHARED' | 'DEDICATED';

  @IsString()
  @IsNotEmpty()
  cpuPriceId: string;

  @IsString()
  @IsNotEmpty()
  ramPriceId: string;

  @IsString()
  @IsNotEmpty()
  diskPriceId: string;

  @IsString()
  @IsNotEmpty()
  bandwidthPriceId: string;

  @IsOptional()
  @IsInt()
  @IsIn([1, 3, 6, 12])
  months?: number = 1;

  @IsString()
  @IsNotEmpty()
  operatingSystem: string;

  @IsOptional()
  @IsString()
  hostname?: string;

  @IsOptional()
  @IsString()
  @IsIn(['WALLET', 'RAZORPAY'])
  paymentMethod?: 'WALLET' | 'RAZORPAY' = 'WALLET';
}
