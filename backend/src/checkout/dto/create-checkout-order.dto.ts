import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateCheckoutOrderDto {
  @IsString()
  @IsNotEmpty()
  planId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  operatingSystem: string;
}
