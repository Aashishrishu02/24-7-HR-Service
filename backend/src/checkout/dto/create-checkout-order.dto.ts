import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateCheckoutOrderDto {
  @IsUUID()
  planId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  operatingSystem: string;
}
