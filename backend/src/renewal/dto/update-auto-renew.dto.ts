import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateAutoRenewDto {
  @IsBoolean()
  enabled: boolean;

  @IsOptional()
  @IsBoolean()
  consent?: boolean;
}
